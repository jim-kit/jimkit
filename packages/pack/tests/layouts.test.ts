import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateBundle } from "@jimkit/sdk/bundle";
import * as sdkReact from "../../sdk/src/react";
import type { LayoutApi, LayoutCategory, LayoutTool } from "../../sdk/src/index";
import { packKit } from "../src/pack.mjs";

const fixture = fileURLToPath(new URL("./fixtures/list-theme", import.meta.url));
let work: string;
let bundle: { manifest: Record<string, unknown>; files: Record<string, string> };

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "jk-layout-"));
  const r = await packKit(fixture, { out: join(work, "jimkit-kit.json") });
  bundle = JSON.parse(readFileSync(r.file, "utf8"));
}, 60_000);
afterAll(() => rmSync(work, { recursive: true, force: true }));

const tool = (id: string, over: Partial<LayoutTool> = {}): LayoutTool => ({ id, name: id.toUpperCase(), blurb: `about ${id}`, icon: "Puzzle", category: "write", color: { hue: 200, own: false }, favourite: false, state: "ready", quick: [], ...over });

/** A stand-in for what the app gives a layout: plain data, and parts that draw a marker so the test can see they were used. */
function fakeApi(over: Partial<LayoutApi> = {}): LayoutApi {
  const write: LayoutCategory = { id: "write", name: "Write", blurb: "", icon: "PenLine", hue: 285, tools: [tool("editor"), tool("diff", { state: "soon" })] };
  const sort = { item: {}, handle: {}, arranging: false, hidden: false };
  const mark = (name: string) => () => createElement("i", { "data-part": name });
  return {
    siteName: "My Jimkit", mode: "dark", setMode() {}, mobile: false, session: { tier: "trusted" } as never,
    categories: [write], groups: [["write"]], favourites: [], recents: [], prefs: { group: true, wide: false }, setPrefs() {},
    open() {}, chooseFiles() {}, openSettings() {}, openSearch() {}, canManageKits: true, openKits() {},
    arranging: false, setArranging() {}, canReset: false, reset() {}, toolCount: 2,
    useToolContextMenu: () => ({ bind: {}, menu: null }), useToolSort: () => sort, useCategorySort: () => sort,
    parts: { SessionChip: mark("session"), ToolMarks: mark("marks"), Grip: mark("grip"), ArrangeBar: mark("arrange"), ToolMenuButton: mark("kebab"), KitsDot: mark("kitsdot"), SettingsDot: mark("settingsdot") },
    ...over,
  };
}

async function loadLayout() {
  const g = globalThis as Record<string, unknown>;
  g.__jimkit = { modules: { react: React, "react/jsx-runtime": jsxRuntime, "@jimkit/ui": { Icon: () => createElement("svg", { "data-icon": "x" }) }, "@jimkit/sdk": { defineClient: (m: unknown) => m }, "@jimkit/sdk/react": sdkReact } };
  try {
    const mod = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(bundle.files["client.js"]).toString("base64")}`);
    return mod.default as { layouts: Record<string, () => unknown> };
  } finally {
    delete g.__jimkit;
  }
}
const draw = (Layout: () => unknown, api: LayoutApi) => renderToStaticMarkup(createElement(sdkReact.LayoutContext.Provider, { value: api }, createElement(Layout as never)));

describe("a layout kit", () => {
  it("packs: a theme with a layout needs client code, and the stylesheet is optional but scoped", () => {
    expect(validateBundle(bundle).ok).toBe(true);
    expect(bundle.manifest).toMatchObject({ client: true, server: false, themes: [{ id: "list", layout: "list" }] });
    expect(Object.keys(bundle.files).sort()).toEqual(["client.js", "client.css", "theme.css"].filter((f) => f in bundle.files).sort());
  });

  it("exports its layouts under the id the theme names", async () => {
    const client = await loadLayout();
    expect(Object.keys(client.layouts)).toEqual(["list"]);
  });

  it("draws the tools, categories and chrome it is given", async () => {
    const { layouts } = await loadLayout();
    const html = draw(layouts.list, fakeApi());
    expect(html).toContain("My Jimkit");
    expect(html).toContain("Write");
    expect(html).toContain("EDITOR");
    expect(html).toContain("about editor");
    expect(html).toContain("Kits");
    expect(html).toContain('data-part="kebab"'); // the host's own ⋮ menu is used, not a copy
    expect(html).not.toContain('data-part="arrange"');
  });

  it("shows a tool that is not ready as such, and does not let it be pressed", async () => {
    const { layouts } = await loadLayout();
    const html = draw(layouts.list, fakeApi());
    expect(html).toMatch(/<button[^>]*disabled[^>]*>DIFF/);
  });

  it("leaves out Kits for a visitor who may not manage them, and says when everything is hidden", async () => {
    const { layouts } = await loadLayout();
    const html = draw(layouts.list, fakeApi({ canManageKits: false, categories: [], groups: [] }));
    expect(html).not.toContain(">Kits<");
    expect(html).toContain("Everything is hidden");
    expect(draw(layouts.list, fakeApi({ categories: [], groups: [], toolCount: 0 }))).toContain("No tools are installed");
  });

  it("uses the host's controls while arranging", async () => {
    const { layouts } = await loadLayout();
    const sort = { item: {}, handle: {}, arranging: true, hidden: false };
    const html = draw(layouts.list, fakeApi({ arranging: true, useToolSort: () => sort, useCategorySort: () => sort }));
    expect(html).toContain('data-part="grip"');
    expect(html).toContain('data-part="marks"');
    expect(html).toContain('data-part="arrange"');
  });

  it("throws a clear error when it is used outside the app", () => {
    expect(() => renderToStaticMarkup(createElement(function Bare() { sdkReact.useLayout(); return null; }))).toThrow(/outside a Jimkit layout/);
  });
});
