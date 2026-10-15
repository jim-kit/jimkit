import type { AddonManifest, AddonStatus, CategoryMeta, FileActionMeta, ToolInit, ToolMeta } from "@jimkit/sdk";

/** Categories every install has. Addons put tools in them by id, and may declare their own. */
export const BUILTIN_CATEGORIES: CategoryMeta[] = [
  { id: "write", name: "Write", blurb: "Text, Markdown, data, diffs", icon: "PenLine", hue: 285 },
  { id: "convert", name: "Convert", blurb: "One file format into another", icon: "Shuffle", hue: 45 },
  { id: "edit", name: "Edit", blurb: "Photos, for now", icon: "WandSparkles", hue: 345 },
  { id: "inspect", name: "Inspect", blurb: "Poke at a file", icon: "ScanSearch", hue: 75 },
  { id: "utilities", name: "Utilities", blurb: "Small, sharp tools", icon: "Wrench", hue: 150 },
];

export interface ToolEntry extends ToolMeta {
  addon: string;
  /** set when the addon can't run on this machine: why */
  unavailable?: string;
  /** a limitation worth saying out loud */
  note?: string;
}

export interface Catalog {
  categories: CategoryMeta[];
  tools: ToolEntry[];
  actions: (FileActionMeta & { addon: string })[];
  byId: Map<string, ToolEntry>;
  /** a tool by its id, or by an old id it answers to (with what that old id started it with) */
  resolve(id: string): { tool: ToolEntry; init?: ToolInit } | undefined;
  /** ids as they are now: old ids replaced by the tool that took over, repeats dropped, ids nothing answers to left as they are */
  canonical(ids: string[]): string[];
  category(id: string): CategoryMeta;
  toolsIn(id: string): ToolEntry[];
}

export function buildCatalog(manifests: AddonManifest[], status: Record<string, AddonStatus> = {}): Catalog {
  const cats = new Map(BUILTIN_CATEGORIES.map((c) => [c.id, c]));
  for (const m of manifests) for (const c of m.categories ?? []) if (!cats.has(c.id)) cats.set(c.id, c);
  const tools: ToolEntry[] = manifests.flatMap((m) => m.tools.map((t) => ({ ...t, addon: m.id, unavailable: status[m.id]?.ok === false ? status[m.id].reason ?? "Not available here." : undefined, note: status[m.id]?.note })));
  const actions = manifests.flatMap((m) => (m.fileActions ?? []).map((a) => ({ ...a, addon: m.id })));
  const used = new Set(tools.map((t) => t.category));
  const categories = [...cats.values()].filter((c) => used.has(c.id));
  const byId = new Map(tools.map((t) => [t.id, t]));
  const aliases = new Map<string, { tool: ToolEntry; init: ToolInit }>();
  for (const t of tools) for (const [old, init] of Object.entries(t.aliases ?? {})) if (!byId.has(old) && !aliases.has(old)) aliases.set(old, { tool: t, init });
  const resolve = (id: string) => { const t = byId.get(id); return t ? { tool: t } : aliases.get(id); };
  const fallback: CategoryMeta = { id: "other", name: "Other", blurb: "", icon: "Puzzle", hue: 200 };
  return {
    categories, tools, actions, byId, resolve,
    canonical: (ids) => [...new Set(ids.map((id) => resolve(id)?.tool.id ?? id))],
    category: (id) => cats.get(id) ?? fallback,
    toolsIn: (id) => tools.filter((t) => t.category === id),
  };
}

const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export function fileMatches(f: Pick<File, "name" | "type">, accept: FileActionMeta["accept"]): boolean {
  if (accept.ext?.includes("*") || accept.mime?.includes("*/*")) return true; // matches everything
  const ext = extOf(f.name);
  if (accept.ext?.some((e) => e.toLowerCase() === ext)) return true;
  return !!accept.mime?.some((m) => (m.endsWith("/*") ? f.type.startsWith(m.slice(0, -1)) : f.type === m));
}

/** Tools that can take these files: ones that accept every file first, then ones that accept at least one. */
export function actionsFor(files: Pick<File, "name" | "type">[], catalog: Catalog) {
  const all = catalog.actions.filter((a) => files.every((f) => fileMatches(f, a.accept)));
  const some = catalog.actions.filter((a) => !all.includes(a) && files.some((f) => fileMatches(f, a.accept)));
  const rank = (a: { priority?: number }) => -(a.priority ?? 0);
  return [...all.sort((a, b) => rank(a) - rank(b)), ...some.sort((a, b) => rank(a) - rank(b))];
}
