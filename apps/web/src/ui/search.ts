import type { ToolInit } from "@jimkit/sdk";
import type { Catalog, ToolEntry } from "./catalog";

/**
 * Tools whose name, category, blurb or keywords contain every word of the query. Starred tools come first, then a name that
 * starts with the query, then the rest in catalog order.
 */
export function matchTools(catalog: Catalog, query: string, favourites: string[], limit = 7): ToolEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = catalog.tools.filter((t) => {
    const hay = `${t.name} ${catalog.category(t.category).name} ${t.blurb} ${(t.keywords ?? []).join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const score = (t: ToolEntry) => (favourites.includes(t.id) ? 0 : 2) + (t.name.toLowerCase().startsWith(words[0]) ? 0 : 1);
  return hits.map((t, i) => ({ t, i })).sort((a, b) => score(a.t) - score(b.t) || a.i - b.i).map((x) => x.t).slice(0, limit);
}

/** A way to start a tool that the visitor can search for: "New JSON document" on the text editor. */
export interface QuickMatch { tool: ToolEntry; label: string; init: ToolInit }

/** The quick actions whose label, keywords or tool name contain every word of the query. */
export function matchActions(catalog: Catalog, query: string, limit = 3): QuickMatch[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: QuickMatch[] = [];
  for (const t of catalog.tools) {
    if (t.status === "soon" || t.unavailable) continue;
    for (const q of t.quick ?? []) {
      const hay = `${q.label} ${t.name} ${(q.keywords ?? []).join(" ")}`.toLowerCase();
      if (words.every((w) => hay.includes(w))) out.push({ tool: t, label: q.label, init: q.init });
    }
  }
  return out.slice(0, limit);
}
