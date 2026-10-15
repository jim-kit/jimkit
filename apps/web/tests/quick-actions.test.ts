import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AddonManifest } from "@jimkit/sdk";
import { buildCatalog } from "@/ui/catalog";
import { matchActions, matchTools } from "@/ui/search";

const text = JSON.parse(readFileSync(join(__dirname, "../../../addons/text/package.json"), "utf8")).jimkit as AddonManifest;
const catalog = buildCatalog([text]);

describe("one text editor", () => {
  it("is a single tool, with the ways to start it as quick actions", () => {
    expect(catalog.tools.map((t) => t.id).sort()).toEqual(["diff", "encode", "text-editor"]);
    expect(catalog.byId.get("text-editor")?.quick?.map((q) => q.label)).toEqual(["New Markdown document", "New JSON document", "New YAML document"]);
  });
  it("answers to the ids the Markdown and JSON & YAML tools had, started their old way", () => {
    expect(catalog.resolve("markdown")).toMatchObject({ tool: { id: "text-editor" }, init: { mode: "markdown" } });
    expect(catalog.resolve("data")).toMatchObject({ tool: { id: "text-editor" }, init: { mode: "json" } });
    expect(catalog.resolve("text-editor")).toMatchObject({ tool: { id: "text-editor" } });
    expect(catalog.resolve("nope")).toBeUndefined();
  });
  it("turns old ids in favourites and recents into the tool that took over, once", () => {
    expect(catalog.canonical(["markdown", "hash", "data", "text-editor"])).toEqual(["text-editor", "hash"]);
    expect(catalog.canonical([])).toEqual([]);
  });
  it("is found by what the old tools were called", () => {
    for (const q of ["markdown", "json", "yaml", "prettify"]) expect(matchTools(catalog, q, []).map((t) => t.id), q).toContain("text-editor");
  });
  it("offers the matching ways to start it in search", () => {
    expect(matchActions(catalog, "json").map((m) => m.label)).toEqual(["New JSON document"]);
    expect(matchActions(catalog, "json")[0].init).toEqual({ mode: "json" });
    expect(matchActions(catalog, "new").map((m) => m.label)).toHaveLength(3);
    expect(matchActions(catalog, "markdown yaml")).toEqual([]);
    expect(matchActions(catalog, "")).toEqual([]);
  });
});
