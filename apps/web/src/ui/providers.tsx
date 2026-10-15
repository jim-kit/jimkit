"use client";

import type { AddonManifest, AddonSource, AddonStatus, CategoryMeta, ClientModule, Host, SessionView, ThemeMeta, ToolInit } from "@jimkit/sdk";
import { HostContext } from "@jimkit/sdk/react";
import { registerIcons, toast } from "@jimkit/ui";
import { Toaster } from "sonner";
import { flushSync } from "react-dom";
import { glide } from "./glide";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clientLoaders } from "@/generated/addons.client";
import { accentVars } from "./accent";
import { buildHome, COLLAPSED_COOKIE, FAVS_COOKIE, HUES_COOKIE, parseFavs, parseHues, serializeHues, serializeFavs, DEFAULT_LAYOUT, HIDDEN_COOKIE, isDefaultLayout, LAYOUT_COOKIE, parseLayout, serializeLayout, type Layout, NO_HIDDEN, NO_ORDER, ORDER_COOKIE, parseHidden, parseOrder, serializeHidden, serializeOrder, withCategoryOrder, withToolOrder, type Hidden, type HomeView, type Order } from "./arrange";
import { actionsFor, buildCatalog, type Catalog, type ToolEntry } from "./catalog";
import { exposeHostModules } from "./host-modules";
import { updateFor } from "./kits-util";
import type { UpdateInfo } from "@/core/updates";
import type { StoreView } from "@/core/store/types";

/** A theme's id: "basic" (built into the core) or the id of a theme an addon brings. */
export type ThemeId = string;
export type ModeId = "dark" | "light";
/** Basic is the core's own look: always there, whatever is installed. Every other theme comes from an addon (see ThemeMeta). */
/** A theme as the app lists it: what its addon declared, and which addon that was (Basic has none). */
export type ThemeEntry = ThemeMeta & { addon?: string };
export const BASIC_THEME: ThemeEntry = { id: "basic", name: "Basic", blurb: "Neutral grey surfaces and thin borders" };
export const ACCENT_LIST: { id: string; name: string; color: string }[] = [
  { id: "blue", name: "Blue", color: "#0d6efd" },
  { id: "teal", name: "Teal", color: "#0aa89a" },
  { id: "green", name: "Green", color: "#198754" },
  { id: "orange", name: "Orange", color: "#e8590c" },
  { id: "pink", name: "Pink", color: "#d63384" },
  { id: "purple", name: "Purple", color: "#7950f2" },
  { id: "ink", name: "Ink", color: "linear-gradient(135deg, #212529 50%, #f1f3f5 50%)" },
];

interface OpenTool { toolId: string; init?: ToolInit; seq: number }

interface App {
  catalog: Catalog;
  /** the addons that are on (built in and installed kits) */
  manifests: AddonManifest[];
  session: SessionView;
  refreshSession(): Promise<void>;
  setSession(s: SessionView): void;
  siteName: string;
  theme: ThemeId;
  mode: ModeId;
  accent: string;
  setTheme(t: ThemeId): void;
  /** the looks to choose from: Basic, then what the switched-on addons bring */
  themes: ThemeEntry[];
  /** the id of the layout the current theme uses ("grid" is built into the app), and the addon that brings it */
  themeLayout: string;
  themeAddon?: string;
  setMode(m: ModeId): void;
  setAccent(a: string): void;
  mobile: boolean;
  current: OpenTool | null;
  openTool(toolId: string, init?: ToolInit): void;
  closeTool(): void;
  recent: string[];
  removeRecent(id: string): void;
  clearRecents(): void;
  /** whether a visitor may open this tool right now (it is not coming soon, not missing its engine, not locked to the trusted network) */
  canOpen(id: string): boolean;
  /** a link that opens straight into a tool */
  toolLink(id: string): string;
  /** categories folded up on the home screen */
  collapsed: string[];
  toggleCollapsed(id: string): void;
  /** the tool whose colour is being chosen in the colour dialog (opened from a menu) */
  colourFor: string | null;
  setColourFor(id: string | null): void;
  palette: boolean;
  setPalette(b: boolean): void;
  settings: boolean;
  setSettings(b: boolean): void;
  /** current values of every addon's declared settings */
  addonSettings: Record<string, Record<string, unknown>>;
  setAddonSettings(s: Record<string, Record<string, unknown>>): void;
  /** how many installed kits have a newer version in the registry (found in the background, trusted visitors only) */
  kitUpdates: number;
  /** whether a newer Jimkit is published (looked up now and then, trusted visitors only), and whether the visitor has seen it yet */
  appUpdate: UpdateInfo | null;
  /** a newer version exists that the visitor has not looked at in Settings yet: the dot on the Settings button */
  updateUnseen: boolean;
  checkAppUpdate(force?: boolean): Promise<void>;
  /** the Kits screen: add, update and remove kits */
  kitsOpen: boolean;
  setKitsOpen(b: boolean): void;
  /** the set of addons changed (a kit was added or removed): show the new tools without reloading the page */
  applyKits(next: { manifests: AddonManifest[]; status: Record<string, AddonStatus>; addonSettings: Record<string, Record<string, unknown>> }): void;
  /** the home screen as this visitor arranged it */
  home: HomeView<CategoryMeta, ToolEntry>;
  arranging: boolean;
  setArranging(b: boolean): void;
  /** `list:id` of the item being dragged */
  drag: string | null;
  setDrag(k: string | null): void;
  /** `persist: false` is for the middle of a drag. Each returns the categories (or tools) in the order now shown. */
  reorder: { cats(ids: string[], persist: boolean): string[]; tools(category: string, ids: string[], persist: boolean): string[] };
  hasOrder: boolean;
  /** the whole order, hidden items included (the menus that move things start from it) */
  fullOrder: { cats(): string[]; tools(category: string): string[] };
  /** what the visitor hid: shown dimmed while editing, left out of the home screen otherwise */
  layout: Layout;
  setLayout(patch: Partial<Layout>): void;
  hidden: Hidden;
  /** starred tools, shown in their own row at the top of the home screen */
  favourites: string[];
  toggleFavourite(id: string): void;
  /** colours the visitor chose for single tools (a hue); a tool without one takes its category's */
  toolHues: Record<string, string>;
  setToolHue(id: string, value: string | null): void;
  setHidden(kind: "cats" | "tools", id: string, hide: boolean): void;
  resetOrder(): void;
  /** said to screen readers */
  announce(msg: string): void;
  /** files the user dropped that wait for a choice of tool */
  pending: File[] | null;
  setPending(f: File[] | null): void;
}

const AppContext = createContext<App | null>(null);
export const useApp = () => useContext(AppContext)!;

const RECENT_KEY = "jk.recent";

function useIsMobile(initial: boolean) {
  const [m, setM] = useState(initial);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-width: 1023px)");
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

function cookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/** Switching look is animated: the old look is photographed, the new one swapped in, and revealed through a circle growing from the press. */
function withTransition(apply: () => void, at: { x: number; y: number }) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce) return apply();
  const r = Math.hypot(Math.max(at.x, window.innerWidth - at.x), Math.max(at.y, window.innerHeight - at.y));
  const root = document.documentElement;
  // a soft edge needs a mask whose radius can be animated (a registered custom property); otherwise a plain circle
  const soft = typeof CSS !== "undefined" && "registerProperty" in CSS && CSS.supports("mask-image", "radial-gradient(circle at 0 0, #000, transparent)");
  const feather = 140;
  root.style.setProperty("--jk-x", `${at.x}px`);
  root.style.setProperty("--jk-y", `${at.y}px`);
  if (soft) root.classList.add("jk-soft-reveal");
  // flushSync: React has to finish rendering inside the callback, or the "after" picture is taken before it has caught up
  const t = doc.startViewTransition(() => flushSync(apply));
  t.ready.then(() => {
    // fill: the circle has to stay fully open until the transition is taken down; without it the radius falls back to 0 for one frame and the old look shows through
    const timing = { duration: 800, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" as const, pseudoElement: "::view-transition-new(root)" };
    root.animate(soft ? { "--jk-r": ["0px", `${r + feather}px`] } : { clipPath: [`circle(0px at ${at.x}px ${at.y}px)`, `circle(${r}px at ${at.x}px ${at.y}px)`] }, timing);
  }).catch(() => {});
  t.finished.finally(() => root.classList.remove("jk-soft-reveal"));
}

export function Providers({ manifests: initialManifests, status: initialStatus, initialSession, initialTheme, initialMode, initialAccent, siteName, initialMobile, initialOrder, initialHidden, initialLayout, initialFavs, initialHues, initialCollapsed, addonSettings: initialAddonSettings, children }: {
  manifests: AddonManifest[]; status: Record<string, AddonStatus>; initialSession: SessionView; addonSettings: Record<string, Record<string, unknown>>; initialTheme: ThemeId; initialMode: ModeId; initialAccent: string; siteName: string; initialMobile: boolean; initialOrder: string; initialHidden: string; initialLayout: string; initialFavs: string; initialHues: string; initialCollapsed: string; children: ReactNode;
}) {
  const [live, setLive] = useState(() => { syncKitSources(initialManifests); return { manifests: initialManifests, status: initialStatus }; });
  const { manifests, status } = live;
  const catalog = useMemo(() => buildCatalog(manifests, status), [manifests, status]);
  const themes = useMemo(() => {
    const seen = new Set([BASIC_THEME.id]);
    const list: ThemeEntry[] = [BASIC_THEME];
    for (const m of manifests) for (const t of m.themes ?? []) if (!seen.has(t.id)) { seen.add(t.id); list.push({ ...t, addon: m.id }); }
    // Basic first, then by `order` (the ones that ship have 10, 20, 30; a kit's default is after them), then as they were found
    return list.map((t, i) => ({ t, i })).sort((a, b) => (a.t.id === "basic" ? -1 : b.t.id === "basic" ? 1 : (a.t.order ?? 100) - (b.t.order ?? 100) || a.i - b.i)).map((x) => x.t);
  }, [manifests]);
  const [kitsOpen, setKitsOpen] = useState(false);
  const [kitUpdates, setKitUpdates] = useState(0);
  const hasKits = manifests.some((m) => m.source);
  // is there a newer Jimkit? The server looks at most twice a day and remembers; this only asks it. Nothing is installed from here.
  const [appUpdate, setAppUpdate] = useState<UpdateInfo | null>(null);
  const [seenUpdate, setSeenUpdate] = useState<string | null>(null);
  const checkAppUpdate = useCallback(async (force = false) => {
    try {
      const r = await fetch(`/api/update${force ? "?refresh=1" : ""}`, { cache: "no-store" });
      if (r.ok) setAppUpdate(await r.json());
    } catch { /* offline: no news is fine */ }
  }, []);
  useEffect(() => {
    try { setSeenUpdate(localStorage.getItem("jk.update.seen")); } catch { /* storage blocked */ }
    if (initialSession.tier === "trusted") void checkAppUpdate();
  }, [initialSession.tier, checkAppUpdate]);
  const updateUnseen = !!appUpdate?.newer && appUpdate.latest !== seenUpdate;
  // once the page is up, and again when the Kits screen closes: has any installed kit got a newer version? (The registry answer is cached on the server.)
  useEffect(() => {
    if (!hasKits || initialSession.tier !== "trusted" || kitsOpen) return;
    let live = true;
    void fetch("/api/store").then((r) => (r.ok ? r.json() : null)).then((v: StoreView | null) => {
      if (live && v) setKitUpdates(v.kits.filter((k) => updateFor(k, v.registry.kits)).length);
    }).catch(() => {});
    return () => { live = false; };
  }, [hasKits, initialSession.tier, kitsOpen, manifests]);
  const [session, setSession] = useState(initialSession);
  const [theme, setThemeState] = useState(initialTheme);
  const [mode, setModeState] = useState(initialMode);
  const [accent, setAccentState] = useState(initialAccent);
  const [current, setCurrent] = useState<OpenTool | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [palette, setPalette] = useState(false);
  const [settings, setSettingsState] = useState(false);
  const setSettings = useCallback((open: boolean) => {
    setSettingsState(open);
    if (open) setAppUpdate((u) => { if (u?.newer && u.latest) { try { localStorage.setItem("jk.update.seen", u.latest); } catch { /* storage blocked */ } setSeenUpdate(u.latest); } return u; });
  }, []);
  const [pending, setPending] = useState<File[] | null>(null);
  const [order, setOrderState] = useState<Order>(() => parseOrder(initialOrder));
  const [arranging, setArranging] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [hidden, setHiddenState] = useState<Hidden>(() => parseHidden(initialHidden));
  const [layout, setLayoutState] = useState<Layout>(() => parseLayout(initialLayout));
  const [favourites, setFavourites] = useState<string[]>(() => catalog.canonical(parseFavs(initialFavs)));
  const [collapsed, setCollapsed] = useState<string[]>(() => parseFavs(initialCollapsed));
  const [colourFor, setColourFor] = useState<string | null>(null);
  const toggleCollapsed = useCallback((id: string) => setCollapsed((cur) => {
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    document.cookie = next.length ? `${COLLAPSED_COOKIE}=${serializeFavs(next)}; path=/; max-age=31536000; samesite=lax` : `${COLLAPSED_COOKIE}=; path=/; max-age=0`;
    return next;
  }), []);
  const [toolHues, setToolHues] = useState<Record<string, string>>(() => parseHues(initialHues));
  const remember = (name: string, v: string) => { document.cookie = v ? `${name}=${v}; path=/; max-age=31536000; samesite=lax` : `${name}=; path=/; max-age=0`; };
  const toggleFavourite = useCallback((id: string) => setFavourites((cur) => {
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    remember(FAVS_COOKIE, serializeFavs(next));
    return next;
  }), []);
  const setToolHue = useCallback((id: string, value: string | null) => setToolHues((cur) => {
    const next = { ...cur };
    if (value === null) delete next[id]; else next[id] = value;
    remember(HUES_COOKIE, serializeHues(next));
    return next;
  }), []);
  const orderRef = useRef(order);
  const [addonSettings, setAddonSettings] = useState(initialAddonSettings);
  const applyKits = useCallback((next: { manifests: AddonManifest[]; status: Record<string, AddonStatus>; addonSettings: Record<string, Record<string, unknown>> }) => {
    syncKitSources(next.manifests);
    setLive({ manifests: next.manifests, status: next.status });
    setAddonSettings(next.addonSettings);
  }, []);
  const mobile = useIsMobile(initialMobile);
  const seq = useRef(0);
  const last = useRef({ x: 0, y: 0 });

  // addon icons are registered by the addon's client module; load them now so the catalog shows them, not just opened tools
  useEffect(() => { preloadIcons(manifests.map((m) => m.id)); }, [manifests]);

  useEffect(() => {
    try { setRecent(catalog.canonical(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"))); } catch { /* ignore */ }
    last.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const on = (e: PointerEvent) => { last.current = { x: e.clientX, y: e.clientY }; };
    document.addEventListener("pointerdown", on, { capture: true, passive: true });
    return () => document.removeEventListener("pointerdown", on, { capture: true });
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const r = await fetch("/api/session", { cache: "no-store" });
      if (r.ok) setSession(await r.json());
    } catch { /* offline: keep what we have */ }
  }, []);
  useEffect(() => {
    const on = () => document.visibilityState === "visible" && void refreshSession();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [refreshSession]);

  // a theme from an installed kit has its stylesheet loaded from the data folder: have it in the page before the look is switched
  const themeCss = useCallback((t: string) => {
    const m = manifests.find((x) => x.source?.themeCss && x.themes?.some((th) => th.id === t));
    if (!m?.source) return Promise.resolve();
    const href = `/api/kits/${m.id}/${m.source.sha256}/theme.css`;
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return Promise.resolve();
    return new Promise<void>((done) => {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = href;
      link.onload = () => done(); link.onerror = () => done();
      document.head.append(link);
    });
  }, [manifests]);
  const setTheme = useCallback(async (t: ThemeId) => {
    await themeCss(t);
    withTransition(() => {
      document.documentElement.dataset.theme = t;
      document.documentElement.toggleAttribute("data-flat", !!themes.find((x) => x.id === t)?.flat);
      setThemeState(t);
      cookie("jk_theme", t);
    }, last.current);
  }, [themeCss, themes]);
  // a theme whose addon was just switched off or removed: fall back to Basic rather than keep a look nothing styles
  useEffect(() => {
    if (!themes.some((t) => t.id === theme)) { document.documentElement.dataset.theme = "basic"; document.documentElement.removeAttribute("data-flat"); setThemeState("basic"); cookie("jk_theme", "basic"); }
  }, [themes, theme]);
  const themeMeta = themes.find((t) => t.id === theme);
  const themeLayout = themeMeta?.layout ?? "grid";
  const themeAddon = themeMeta?.addon;
  const setMode = useCallback((m: ModeId) => withTransition(() => {
    document.documentElement.dataset.mode = m;
    // a custom colour is fitted to the page it sits on: it changes with the mode
    const acc = document.documentElement.dataset.accent ?? "";
    if (acc.startsWith("hex-")) for (const [k, v] of Object.entries(accentVars(acc, m))) document.documentElement.style.setProperty(k, v);
    setModeState(m);
    cookie("jk_mode", m);
  }, last.current), []);
  const setAccent = useCallback((a: string) => {
    const el = document.documentElement;
    for (const k of ["--accent", "--accent-fg", "--accent-rgb"]) el.style.removeProperty(k);
    for (const [k, v] of Object.entries(accentVars(a, el.dataset.mode === "light" ? "light" : "dark"))) el.style.setProperty(k, v);
    el.dataset.accent = a;
    setAccentState(a);
    cookie("jk_accent", a);
  }, []);

  const commitOrder = useCallback((fn: (o: Order) => Order, persist: boolean) => {
    const next = fn(orderRef.current);
    orderRef.current = next;
    setOrderState(next);
    if (persist) {
      const v = serializeOrder(next);
      document.cookie = v ? `${ORDER_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax` : `${ORDER_COOKIE}=; path=/; max-age=0`;
    }
    return next;
  }, []);
  // Metro can make a group two tile columns wide (six tiles); the other looks have three columns
  const pack = useMemo(() => ({ group: layout.group, capacity: themeLayout !== "grid" && layout.wide ? 6 : 3 }), [layout, themeLayout]);
  const home = useMemo(() => buildHome(catalog, order, hidden, arranging, pack), [catalog, order, hidden, arranging, pack]);
  // every category and tool in the visitor's order, hidden ones too: a menu that reorders must not drop the places of those it can't see
  const fullOrder = useMemo<App["fullOrder"]>(() => {
    const all = buildHome(catalog, order, hidden, true, pack);
    return { cats: () => all.categories.map((c) => c.id), tools: (cat) => all.toolsIn(cat).map((t) => t.id) };
  }, [catalog, order, hidden, pack]);
  const reorder = useMemo<App["reorder"]>(() => ({
    cats: (ids, persist) => buildHome(catalog, commitOrder((o) => withCategoryOrder(o, ids), persist), hidden, true, pack).categories.map((c) => c.id),
    tools: (cat, ids, persist) => buildHome(catalog, commitOrder((o) => withToolOrder(catalog, o, cat, ids), persist), hidden, true, pack).toolsIn(cat).map((t) => t.id),
  }), [catalog, commitOrder, hidden, pack]);
  const hiddenRef = useRef(hidden);
  const saveHidden = useCallback((next: Hidden) => {
    hiddenRef.current = next;
    setHiddenState(next);
    const v = serializeHidden(next);
    document.cookie = v ? `${HIDDEN_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax` : `${HIDDEN_COOKIE}=; path=/; max-age=0`;
  }, []);
  const setHidden = useCallback((kind: "cats" | "tools", id: string, hide: boolean) => {
    const cur = hiddenRef.current;
    const list = cur[kind].filter((x) => x !== id);
    saveHidden({ ...cur, [kind]: hide ? [...list, id] : list });
  }, [saveHidden]);
  const setLayout = useCallback((patch: Partial<Layout>) => {
    // flushSync: the new layout must be in the DOM before glide measures where everything ended up
    glide(() => flushSync(() => setLayoutState((cur) => {
      const next = { ...cur, ...patch };
      const v = serializeLayout(next);
      document.cookie = v ? `${LAYOUT_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax` : `${LAYOUT_COOKIE}=; path=/; max-age=0`;
      return next;
    })));
  }, []);
  const resetOrder = useCallback(() => { commitOrder(() => NO_ORDER, true); saveHidden(NO_HIDDEN); setLayout(DEFAULT_LAYOUT); setSaid("Layout reset."); }, [commitOrder, saveHidden, setLayout]);
  useEffect(() => {
    document.documentElement.classList.toggle("jk-arranging", arranging);
    return () => document.documentElement.classList.remove("jk-arranging");
  }, [arranging]);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const canOpen = useCallback((id: string) => {
    const t = catalog.resolve(id)?.tool;
    return !!t && !t.unavailable && t.status !== "soon" && !(t.trusted && sessionRef.current.tier === "public");
  }, [catalog]);
  const toolLink = useCallback((id: string) => `${window.location.origin}${window.location.pathname}?tool=${encodeURIComponent(id)}`, []);

  const openTool = useCallback((asked: string, init?: ToolInit) => {
    // an old id (a bookmark, a favourite from before two tools became one) opens the tool that took over, started the old way
    const found = catalog.resolve(asked);
    if (!found) return; // an id nothing answers to opens nothing, and must not leave the address or `current` pointing at it
    const toolId = found.tool.id;
    if (found.init) init = { ...found.init, ...init };
    setCurrent({ toolId, init, seq: ++seq.current });
    setPalette(false);
    setPending(null);
    setRecent((r) => {
      const next = [toolId, ...r.filter((x) => x !== toolId)].slice(0, 8);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    // the address follows the tool, so Back closes it and the link can be shared; a second tool replaces the first instead of stacking
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("tool") !== toolId) {
        url.searchParams.set("tool", toolId);
        if (window.history.state?.jkTool) window.history.replaceState({ jkTool: toolId }, "", url);
        else window.history.pushState({ jkTool: toolId }, "", url);
      }
    } catch { /* an address that cannot be changed (a sandboxed frame) is fine: the tool still opens */ }
  }, [catalog]);
  const closeTool = useCallback(() => {
    setCurrent(null);
    try {
      if (window.history.state?.jkTool) window.history.back();
      else if (new URL(window.location.href).searchParams.has("tool")) {
        const url = new URL(window.location.href);
        url.searchParams.delete("tool");
        window.history.replaceState(null, "", url);
      }
    } catch { /* see openTool */ }
  }, []);
  const removeRecent = useCallback((id: string) => setRecent((r) => {
    const next = r.filter((x) => x !== id);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }), []);
  const clearRecents = useCallback(() => { setRecent([]); try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ } }, []);

  // a link with ?tool= opens that tool, and the browser's Back and Forward buttons open and close tools
  const canOpenRef = useRef(canOpen);
  canOpenRef.current = canOpen;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  useEffect(() => {
    const sync = (fromLoad: boolean) => {
      const id = new URLSearchParams(window.location.search).get("tool");
      if (!id) return void setCurrent(null);
      const found = catalogRef.current.resolve(id);
      if (found && canOpenRef.current(id)) setCurrent((c) => (c?.toolId === found.tool.id ? c : { toolId: found.tool.id, init: found.init, seq: ++seq.current }));
      else if (fromLoad) { const url = new URL(window.location.href); url.searchParams.delete("tool"); window.history.replaceState(null, "", url); }
      else setCurrent(null);
    };
    sync(true);
    const on = () => sync(false);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);

  const host = useMemo<Host>(() => ({
    session,
    mobile,
    // a tool asking for another gets what a visitor's press gets: locked, soon and unavailable ones don't open
    open: (id, init) => {
      const t = catalog.resolve(id)?.tool;
      if (!t) return;
      if (t.unavailable) return void toast(`${t.name} isn't available here`, { description: t.unavailable });
      if (t.status === "soon") return void toast(`${t.name} is coming soon`);
      if (!canOpen(t.id)) return void toast(`${t.name} needs the unlock code`, { description: "Open Settings and enter it." });
      openTool(id, init);
    },
    offer: (files) => setPending(files),
    canOffer: (files) => actionsFor(files.map((f) => ({ name: f.name, type: f.type ?? "" })), catalog).length > 0,
    hasTool: (id) => catalog.byId.has(id),
    settings: (addon) => addonSettings[addon] ?? {},
    api: (addon, path, init) => fetch(`/api/a/${encodeURIComponent(addon)}/${path.replace(/^\//, "")}`, { credentials: "same-origin", ...init }),
    storage: (addon) => {
      const k = (key: string) => `jk.${addon}.${key}`;
      return {
        get: (key) => { try { return localStorage.getItem(k(key)); } catch { return null; } },
        set: (key, value) => { try { localStorage.setItem(k(key), value); return true; } catch { return false; } },
        remove: (key) => { try { localStorage.removeItem(k(key)); } catch { /* ignore */ } },
      };
    },
  }), [session, mobile, openTool, catalog, addonSettings]);

  const value: App = { manifests, kitUpdates, appUpdate, updateUnseen, checkAppUpdate, kitsOpen, setKitsOpen, applyKits, favourites, toggleFavourite, toolHues, setToolHue, catalog, session, refreshSession, setSession, siteName, theme, mode, accent, setTheme, themes, themeLayout, themeAddon, setMode, setAccent, mobile, current, openTool, closeTool, recent, removeRecent, clearRecents, canOpen, toolLink, collapsed, toggleCollapsed, colourFor, setColourFor, palette, setPalette, settings, setSettings, addonSettings, setAddonSettings, pending, setPending, home, arranging, setArranging, drag, setDrag, reorder, fullOrder, hasOrder: !!(order.cats.length || order.tools.length || hidden.cats.length || hidden.tools.length || !isDefaultLayout(layout)), hidden, setHidden, layout, setLayout, resetOrder, announce: setSaid };
  return (
    <AppContext.Provider value={value}>
      <HostContext.Provider value={host}>
        {children}
        <p className="sr-only" role="status" aria-live="polite">{said}</p>
        <Toaster theme={mode} position={mobile ? "top-center" : "bottom-right"} offset={mobile ? "calc(env(safe-area-inset-top) + 10px)" : 20} />
      </HostContext.Provider>
    </AppContext.Provider>
  );
}

/** Where each installed kit's code comes from: the folder of its hash, so an update is a new module and the old one is never reused. */
const kitSources = new Map<string, AddonSource>();
function syncKitSources(manifests: AddonManifest[]) {
  kitSources.clear();
  for (const m of manifests) if (m.source && m.client) kitSources.set(m.id, m.source);
}
/** Part of a tool's cache key: changes when its kit is updated. */
export const kitVersionOf = (addon: string) => kitSources.get(addon)?.sha256 ?? "";

async function importKit(addon: string, src: AddonSource): Promise<ClientModule> {
  exposeHostModules();
  const base = `/api/kits/${addon}/${src.sha256}`;
  if (src.css && !document.querySelector(`link[data-kit="${src.sha256}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${base}/client.css`;
    link.dataset.kit = src.sha256;
    document.head.append(link);
  }
  const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${base}/client.js`);
  return mod.default as ClientModule;
}

/** Loads (once) the client module of an addon and registers the icons it brings. */
const modules = new Map<string, Promise<ClientModule>>();
export function loadClient(addon: string): Promise<ClientModule> {
  const src = kitSources.get(addon);
  const key = `${addon}@${src?.sha256 ?? ""}`;
  const known = modules.get(key);
  if (known) return known;
  const loader = clientLoaders[addon];
  if (!src && !loader) return Promise.reject(new Error(`addon "${addon}" has no client module`));
  const p: Promise<ClientModule> = (src ? importKit(addon, src) : loader().then((m) => m.default)).then((m) => {
    if (m.icons) registerIcons(m.icons as never);
    return m;
  });
  modules.set(key, p);
  p.catch(() => modules.delete(key));
  return p;
}

/** Loads every addon's client module at start so the icons it brings are registered (see Icon: it redraws when they arrive). */
export function preloadIcons(addons: string[]) {
  for (const a of addons) if (clientLoaders[a] || kitSources.has(a)) void loadClient(a).catch(() => {});
}
