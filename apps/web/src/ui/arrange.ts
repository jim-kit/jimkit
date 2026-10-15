/*
 * The order a visitor gave the home screen, and the layout rules built on it. Plain functions, no React:
 * the shell calls them, the tests pin them down.
 */

/** What a visitor arranged: category ids, and tool ids (all categories in one list; each category only looks at its own). */
export interface Order { cats: string[]; tools: string[] }
export const NO_ORDER: Order = { cats: [], tools: [] };

export const ORDER_COOKIE = "jk_order";
/** What a visitor hid: category ids and tool ids, the same shape and cookie format as the order. */
export type Hidden = Order;
export const NO_HIDDEN: Hidden = NO_ORDER;
export const HIDDEN_COOKIE = "jk_hidden";
export const FAVS_COOKIE = "jk_favs";
export const HUES_COOKIE = "jk_hues";
/** Categories the visitor folded up on the home screen (ids, comma separated like the favourites). */
export const COLLAPSED_COOKIE = "jk_collapsed";

/** How the home screen packs small categories. `group`: small ones share a row or column. `wide`: in Metro a group is two tile columns wide. */
export interface Layout { group: boolean; wide: boolean }
export const DEFAULT_LAYOUT: Layout = { group: true, wide: false };
export const LAYOUT_COOKIE = "jk_layout";
/** `g1w0`. Anything unreadable is the default. */
export function parseLayout(raw: string | null | undefined): Layout {
  const m = /^g([01])w([01])$/.exec(raw ?? "");
  return m ? { group: m[1] === "1", wide: m[2] === "1" } : DEFAULT_LAYOUT;
}
export const isDefaultLayout = (l: Layout) => l.group === DEFAULT_LAYOUT.group && l.wide === DEFAULT_LAYOUT.wide;
export const serializeLayout = (l: Layout) => (isDefaultLayout(l) ? "" : `g${l.group ? 1 : 0}w${l.wide ? 1 : 0}`);
/** Cookies travel with every request, so the order stays small. Past this, the tail of the tool list is dropped. */
export const ORDER_MAX = 1800;

// The cookie holds ids only. Ids outside this set can't be written safely and keep their default place.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const uniqueSafe = (ids: string[]) => [...new Set(ids.filter((id) => SAFE_ID.test(id)))];

/** `cat.cat~tool.tool.tool`. Anything unreadable is the default order. */
export function parseOrder(raw: string | null | undefined): Order {
  if (!raw || raw.length > 4096) return NO_ORDER;
  const [cats = "", tools = ""] = raw.split("~");
  return { cats: uniqueSafe(cats.split(".")), tools: uniqueSafe(tools.split(".")) };
}

export const parseHidden = (raw: string | null | undefined): Hidden => parseOrder(raw);
export const serializeHidden = (hidden: Hidden): string => serializeOrder(hidden);

export function serializeOrder(order: Order, max = ORDER_MAX): string {
  const cats = uniqueSafe(order.cats);
  const tools = uniqueSafe(order.tools);
  const size = () => cats.join(".").length + 1 + tools.join(".").length; // ids are ASCII: characters are bytes
  // whole ids come off the end; whatever is missing simply falls back to the default order
  while (tools.length && size() > max) tools.pop();
  while (cats.length && size() > max) cats.pop();
  return cats.length || tools.length ? `${cats.join(".")}~${tools.join(".")}` : "";
}

/** Saved ids first, in saved order; everything the list doesn't mention (new addons) after, in its own order. Unknown ids are ignored. */
export function sortByOrder<T>(items: T[], idOf: (item: T) => string, saved: string[]): T[] {
  const rank = new Map<string, number>();
  saved.forEach((id, i) => { if (!rank.has(id)) rank.set(id, i); });
  const known = items.filter((i) => rank.has(idOf(i))).sort((a, b) => rank.get(idOf(a))! - rank.get(idOf(b))!);
  return [...known, ...items.filter((i) => !rank.has(idOf(i)))];
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = list.slice();
  next.splice(Math.max(0, Math.min(to, list.length - 1)), 0, next.splice(from, 1)[0]);
  return next;
}

/** One step earlier (-1) or later (1). Returns the same array when the item is already at that end. */
export function moveBy(ids: string[], id: string, delta: -1 | 1): string[] {
  const at = ids.indexOf(id);
  if (at < 0 || at + delta < 0 || at + delta >= ids.length) return ids;
  return moveItem(ids, at, at + delta);
}

/* ───────── layout ───────── */

/**
 * Small categories share a row (Basic, Glass) or a column (Metro). `capacity` is how many columns a row has, or how many tile rows a
 * column has; a category takes as many as it has tools. A category with more than `small` tools stands alone. Within a stretch of small ones,
 * each goes into the first group that still has room, so a gap left by a two-tool category is filled by a one-tool one that comes later.
 */
export function packGroups(items: { id: string; size: number }[], capacity = 3, small = 2): string[][] {
  const groups: { ids: string[]; used: number }[] = [];
  let run: typeof groups = [];
  for (const { id, size: raw } of items) {
    const size = Math.max(1, raw);
    if (size > small || size > capacity) {
      groups.push({ ids: [id], used: capacity });
      run = [];
      continue;
    }
    let g = run.find((r) => r.used + size <= capacity);
    if (!g) { g = { ids: [], used: 0 }; groups.push(g); run.push(g); }
    g.ids.push(id);
    g.used += size;
  }
  return groups.map((g) => g.ids);
}

/* ───────── applying an order to the catalog ───────── */

interface Cat { id: string }
interface Tool { id: string; category: string }
export interface Source<C extends Cat, T extends Tool> { categories: C[]; tools: T[] }
export interface HomeView<C extends Cat, T extends Tool> {
  /** in the order they are shown */
  categories: C[];
  /** the same ids grouped as they sit together (a row, or a Metro column) */
  groups: string[][];
  toolsIn(id: string): T[];
}

/** The catalog as this visitor sees it: their order where they gave one, small categories packed together. */
/** `group: false` leaves every category on its own; `capacity` is how many columns (Basic, Glass) or tiles (Metro) a group can hold. */
export interface Pack { group?: boolean; capacity?: number }

export function buildHome<C extends Cat, T extends Tool>(src: Source<C, T>, order: Order, hidden: Hidden = NO_HIDDEN, showHidden = false, pack: Pack = {}): HomeView<C, T> {
  const gone = { cats: new Set(hidden.cats), tools: new Set(hidden.tools) };
  const byCat = new Map<string, T[]>();
  for (const c of src.categories) {
    const sorted = sortByOrder(src.tools.filter((t) => t.category === c.id), (t) => t.id, order.tools);
    byCat.set(c.id, showHidden ? sorted : sorted.filter((t) => !gone.tools.has(t.id)));
  }
  // a category whose addons are all off has no tools and takes no place; a hidden one (or one with every tool hidden) is only there for editing
  const shown = sortByOrder(src.categories.filter((c) => byCat.get(c.id)!.length && (showHidden || !gone.cats.has(c.id))), (c) => c.id, order.cats);
  const groups = pack.group === false ? shown.map((c) => [c.id]) : packGroups(shown.map((c) => ({ id: c.id, size: byCat.get(c.id)!.length })), pack.capacity);
  const byId = new Map(shown.map((c) => [c.id, c]));
  return { categories: groups.flat().map((id) => byId.get(id)!), groups, toolsIn: (id) => byCat.get(id) ?? [] };
}

export function withCategoryOrder(order: Order, ids: string[]): Order {
  return { ...order, cats: ids };
}

/** Puts `ids` (the new order of one category) into the saved order. The other categories keep what they have. */
export function withToolOrder<C extends Cat, T extends Tool>(src: Source<C, T>, order: Order, category: string, ids: string[]): Order {
  const view = buildHome(src, order, NO_HIDDEN, true);
  const tools = view.categories.flatMap((c) => (c.id === category ? ids : view.toolsIn(c.id).map((t) => t.id)));
  return { ...order, tools };
}

/* ───────── dragging ───────── */

export interface Rect { left: number; top: number; right: number; bottom: number }
const inside = (r: Rect, p: { x: number; y: number }) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;

/**
 * Where the dragged item (index `from`) should land for a pointer at `p`: the item under the pointer, else the one with the nearest centre.
 * Over its own slot it stays where it is, so it doesn't jump back and forth as the others shift.
 */
export function targetIndex(rects: Rect[], from: number, p: { x: number; y: number }): number {
  if (rects[from] && inside(rects[from], p)) return from;
  const hit = rects.findIndex((r) => inside(r, p));
  if (hit >= 0) return hit;
  let best = from, dist = Infinity;
  rects.forEach((r, i) => {
    const d = Math.hypot((r.left + r.right) / 2 - p.x, (r.top + r.bottom) / 2 - p.y);
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}

/* ───────── favourites and per-tool colours ───────── */

const TOOL_ID = /^[a-z0-9][a-z0-9._-]*$/i;

/** The tools a visitor starred, in the order they starred them. Anything that is not a plain id is dropped. */
export const parseFavs = (raw: string | null | undefined): string[] => [...new Set((raw ?? "").split(",").filter((x) => TOOL_ID.test(x)))].slice(0, 60);
export const serializeFavs = (ids: string[]): string => ids.join(",");

/**
 * A colour the visitor picked for a tool, keyed by tool id: either a hue from the swatches ("250", 0 to 359,
 * which the theme turns into its own shade) or an exact colour from the picker ("c8a2f0", no #).
 */
export const parseHues = (raw: string | null | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const pair of (raw ?? "").split(",")) {
    const [id, v = ""] = pair.split(":");
    if (!TOOL_ID.test(id ?? "")) continue;
    if (/^[0-9a-f]{6}$/i.test(v)) out[id] = v.toLowerCase();
    else if (/^-?\d{1,4}$/.test(v)) out[id] = String(((Number(v) % 360) + 360) % 360);
  }
  return out;
};
export const serializeHues = (hues: Record<string, string>): string => Object.entries(hues).map(([id, v]) => `${id}:${v}`).join(",");
/** A stored swatch hue is a plain number; anything else is an exact colour. */
// a hue is one to three digits; an exact colour is always six hex digits, which may all be numerals ("123456" is a colour, not a hue)
export const isHueValue = (v: string | undefined): v is string => !!v && /^\d{1,3}$/.test(v);

/** What a stored colour means for one tool: a swatch hue the theme shades, or an exact colour used as it is. */
export function tint(value: string | undefined, categoryHue: number): { hue: number; hex?: string } {
  if (!value) return { hue: categoryHue };
  return isHueValue(value) ? { hue: Number(value) } : { hue: categoryHue, hex: `#${value}` };
}

/** Favourites first, in the order they were starred; everything else keeps its own order after them. */
export function pinFavourites<T>(items: T[], idOf: (item: T) => string, favs: string[]): T[] {
  const rank = new Map(favs.map((id, i) => [id, i] as const));
  const starred = items.filter((i) => rank.has(idOf(i))).sort((a, b) => rank.get(idOf(a))! - rank.get(idOf(b))!);
  return [...starred, ...items.filter((i) => !rank.has(idOf(i)))];
}

