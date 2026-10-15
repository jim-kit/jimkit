"use client";

import type { LayoutApi, LayoutCategory, LayoutSort, LayoutTool } from "@jimkit/sdk";
import { LayoutContext } from "@jimkit/sdk/react";
import { Kebab, Spinner, useContextMenu } from "@jimkit/ui";
import { Component, Suspense, lazy, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { isHueValue, tint } from "./arrange";
import type { ToolEntry } from "./catalog";
import { useToolMenu } from "./menus";
import { ArrangeBar, ToolMarks, UpdateDot, UpdatePip, useActivate } from "./parts";
import { kitVersionOf, loadClient, useApp } from "./providers";
import { SessionChip } from "./session-ui";
import { Grip, useSortItem } from "./sortable";

/**
 * The layout API (packages/sdk/src/layout.ts): everything a theme's layout is given, built from the app's own state. A layout never
 * sees `useApp()`; it gets this, so the app can change inside without breaking a layout, and a layout can't break the app.
 */

type Sort = ReturnType<typeof useSortItem>;
const wrap = (sort: Sort): LayoutSort & { __sort: Sort } => ({ item: sort.item as never, handle: sort.handle as never, arranging: sort.arranging, hidden: sort.isHidden, __sort: sort });

/** Hooks live at module level, so their identity never changes between renders. */
function useToolSort(tool: LayoutTool, siblings: string[]): LayoutSort {
  const { reorder } = useApp();
  return wrap(useSortItem({ list: `tools:${tool.category}`, id: tool.id, ids: siblings, name: tool.name, apply: (next, final) => reorder.tools(tool.category, next, final) }));
}
function useCategorySort(category: LayoutCategory, siblings: string[]): LayoutSort {
  const { reorder } = useApp();
  return wrap(useSortItem({ list: "cats", id: category.id, ids: siblings, name: category.name, apply: reorder.cats }));
}

function useToolContextMenu(tool: LayoutTool) {
  const { catalog } = useApp();
  const menuFor = useToolMenu();
  const entry = catalog.byId.get(tool.id);
  const ctx = useContextMenu(() => (entry ? menuFor(entry, "home") : []), tool.name);
  return { bind: ctx.bind as never, menu: ctx.menu };
}

const parts: LayoutApi["parts"] = {
  ToolMenuButton: ({ tool, className }) => {
    const { catalog } = useApp();
    const menuFor = useToolMenu();
    const entry = catalog.byId.get(tool.id);
    return entry ? <Kebab items={() => menuFor(entry, "home")} label={`${tool.name}: more`} className={className} /> : null;
  },
  SessionChip: ({ dotFirst }) => { const { setSettings } = useApp(); return <SessionChip dotFirst={dotFirst} onClick={() => setSettings(true)} />; },
  ToolMarks: ({ tool, ...rest }) => { const { catalog } = useApp(); const t = catalog.byId.get(tool.id); return t ? <ToolMarks tool={t} {...rest} /> : null; },
  Grip: ({ sort, ...rest }) => <Grip sort={(sort as unknown as { __sort: Sort }).__sort} {...rest} />,
  ArrangeBar,
  KitsDot: UpdateDot,
  SettingsDot: UpdatePip,
};

function useLayoutApi(): LayoutApi {
  const app = useApp();
  const activate = useActivate();
  const { catalog, toolHues, favourites, session } = app;
  const toTool = (t: ToolEntry): LayoutTool => {
    const shade = tint(toolHues[t.id], catalog.category(t.category).hue);
    const state: LayoutTool["state"] = t.unavailable ? "unavailable" : t.status === "soon" ? "soon" : t.trusted && session.tier === "public" ? "locked" : "ready";
    return {
      id: t.id, name: t.name, blurb: t.blurb, icon: t.icon, iconAnimation: t.iconAnimation, category: t.category,
      color: { hue: shade.hue, hex: shade.hex, own: t.id in toolHues && !shade.hex && isHueValue(toolHues[t.id]) },
      favourite: favourites.includes(t.id), state, note: t.unavailable ?? t.note, quick: t.quick ?? [],
    };
  };
  const categories: LayoutCategory[] = app.home.categories.map((c) => ({ id: c.id, name: c.name, blurb: c.blurb, icon: c.icon, hue: c.hue, tools: app.home.toolsIn(c.id).map(toTool) }));
  // starred tools, wherever they live, that the visitor has not hidden (hidden ones show only while arranging)
  const byId = new Map(categories.flatMap((c) => c.tools.map((t) => [t.id, t] as const)));
  return {
    siteName: app.siteName, mode: app.mode, setMode: app.setMode, mobile: app.mobile, session,
    categories, groups: app.home.groups,
    favourites: favourites.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
    recents: app.recent.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])).slice(0, 6),
    prefs: app.layout, setPrefs: app.setLayout,
    open: (tool, init) => { const t = catalog.byId.get(typeof tool === "string" ? tool : tool.id); if (t) activate(t, init); },
    chooseFiles: () => {
      const input = document.createElement("input");
      input.type = "file"; input.multiple = true;
      input.onchange = () => { if (input.files?.length) app.setPending(Array.from(input.files)); };
      input.click();
    },
    openSettings: () => app.setSettings(true), openSearch: () => app.setPalette(true),
    canManageKits: session.tier === "trusted", openKits: () => app.setKitsOpen(true),
    arranging: app.arranging, setArranging: app.setArranging, canReset: app.hasOrder, reset: app.resetOrder,
    toolCount: catalog.tools.length, useToolContextMenu, useToolSort, useCategorySort, parts,
  };
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  return <LayoutContext.Provider value={useLayoutApi()}>{children}</LayoutContext.Provider>;
}

/** A layout that crashes, or that the addon doesn't have, must not take the page with it: the built-in layout takes over. */
class Safe extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("the theme's layout failed; using the built-in one:", error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const layouts = new Map<string, ComponentType>();
function layoutComponent(addon: string, id: string): ComponentType {
  // a new version of a kit is a new module: the cache key says which
  const key = `${addon}@${kitVersionOf(addon)}/${id}`;
  let C = layouts.get(key);
  if (!C) {
    C = lazy(async () => {
      const mod = await loadClient(addon);
      const found = mod.layouts?.[id];
      if (!found) throw new Error(`The "${addon}" addon has no layout "${id}".`);
      return { default: found };
    });
    layouts.set(key, C);
  }
  return C;
}

const Loading = () => <div className="grid min-h-dvh place-items-center text-faint"><Spinner size={22} /></div>;

/** The home screen as a theme's layout draws it. `fallback` is the built-in layout. */
export function ThemedLayout({ addon, id, fallback }: { addon: string; id: string; fallback: ReactNode }) {
  // an installed kit's code is a browser import: there is nothing to draw on the server but the wait, and the first client render has to
  // draw the same wait (not the layout) or React can't match it to the server's page
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted && kitVersionOf(addon)) return <Loading />;
  const Layout = layoutComponent(addon, id);
  return (
    // keyed by layout and version, so a layout that failed is tried again when the theme or the kit changes
    <Safe key={`${addon}@${kitVersionOf(addon)}/${id}`} fallback={fallback}>
      <Suspense fallback={<Loading />}>
        <LayoutProvider><Layout /></LayoutProvider>
      </Suspense>
    </Safe>
  );
}
