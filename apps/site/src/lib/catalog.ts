import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The tool list, read from the addon manifests at build time, so the site shows what the product has.
 * `next build` runs in apps/site, so the repository root is two levels up.
 */
const ROOT = resolve(process.cwd(), "../..");

export interface Category { id: string; name: string; blurb: string; icon: string; hue: number }
export interface SiteTool {
  id: string; name: string; blurb: string; icon: string; category: string; addon: string;
  /** runs in the page: the tool's own code is client-side */
  demo: boolean;
}

// the categories every install has (apps/web/src/ui/catalog.ts); addons can add their own
const BUILTIN: Category[] = [
  { id: "write", name: "Write", blurb: "Text, Markdown, data, diffs", icon: "PenLine", hue: 285 },
  { id: "convert", name: "Convert", blurb: "One file format into another", icon: "Shuffle", hue: 45 },
  { id: "edit", name: "Edit", blurb: "Photos, for now", icon: "WandSparkles", hue: 345 },
  { id: "inspect", name: "Inspect", blurb: "Poke at a file", icon: "ScanSearch", hue: 75 },
  { id: "utilities", name: "Utilities", blurb: "Small, sharp tools", icon: "Wrench", hue: 150 },
];

/** The addons whose tools run entirely in the browser, so they can run on this page. */
const IN_PAGE = new Set(["text", "hash", "devtools"]);

export interface FileAction { id: string; tool: string; label: string; icon: string; priority: number; accept: { ext?: string[]; mime?: string[] } }

export function loadCatalog() {
  const categories = new Map(BUILTIN.map((c) => [c.id, c]));
  const tools: SiteTool[] = [];
  const actions: FileAction[] = [];
  for (const dir of readdirSync(resolve(ROOT, "addons")).sort()) {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "addons", dir, "package.json"), "utf8"));
    const m = pkg.jimkit;
    if (!m) continue;
    // the developer category is blue in the app; on this site every category gets its own warm-palette hue
    for (const c of m.categories ?? []) if (!categories.has(c.id)) categories.set(c.id, c.id === "dev" ? { ...c, hue: 165 } : c);
    for (const a of m.fileActions ?? []) actions.push({ id: a.id, tool: a.tool, label: a.label, icon: a.icon, priority: a.priority ?? 0, accept: a.accept });
    for (const t of m.tools) tools.push({ id: t.id, name: t.name, blurb: t.blurb, icon: t.icon, category: t.category, addon: m.id, demo: IN_PAGE.has(m.id) });
  }
  const used = new Set(tools.map((t) => t.category));
  const ordered = [...categories.values()].filter((c) => used.has(c.id));
  // the home screen's order: by category, and within one in the order the addon declared them
  const rank = new Map(ordered.map((c, i) => [c.id, i]));
  tools.sort((a, b) => (rank.get(a.category) ?? 99) - (rank.get(b.category) ?? 99));
  return { categories: ordered, tools, actions, total: tools.length };
}

export function productVersion(): string {
  return JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version as string;
}
