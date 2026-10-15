import { describe, expect, it } from "vitest";
import { buildCatalog } from "@/ui/catalog";
import { matchTools } from "@/ui/search";
import type { AddonManifest } from "@jimkit/sdk";

const m: AddonManifest = {
  id: "t", name: "t", version: "1", tools: [
    { id: "hash", name: "Hashes", blurb: "MD5, SHA-256", icon: "Hash", category: "inspect", keywords: ["checksum", "sha"] },
    { id: "json", name: "JSON & YAML", blurb: "Format and convert", icon: "Braces", category: "write", keywords: ["format"] },
    { id: "diff", name: "Text diff", blurb: "Compare two texts", icon: "Diff", category: "write" },
  ],
} as never;

describe("matchTools", () => {
  const c = buildCatalog([m]);
  it("finds by name, keyword, category and blurb", () => {
    expect(matchTools(c, "hash", []).map((t) => t.id)).toEqual(["hash"]);
    expect(matchTools(c, "checksum", []).map((t) => t.id)).toEqual(["hash"]);
    expect(matchTools(c, "write", []).map((t) => t.id)).toEqual(["json", "diff"]);
    expect(matchTools(c, "compare", []).map((t) => t.id)).toEqual(["diff"]);
  });
  it("needs every word to match", () => {
    expect(matchTools(c, "text format", [])).toEqual([]);
    expect(matchTools(c, "json format", []).map((t) => t.id)).toEqual(["json"]);
  });
  it("puts stars first, then names that start with the query", () => {
    expect(matchTools(c, "t", ["diff"]).map((t) => t.id)[0]).toBe("diff");
    expect(matchTools(c, "te", []).map((t) => t.id)[0]).toBe("diff");
  });
  it("returns nothing for an empty query", () => {
    expect(matchTools(c, "  ", [])).toEqual([]);
  });
});
