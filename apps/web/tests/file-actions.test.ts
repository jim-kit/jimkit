import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AddonManifest } from "@jimkit/sdk";
import { actionsFor, buildCatalog } from "@/ui/catalog";

// the real manifests, as the home screen's "What should happen to this?" list sees them
const addons = ["text", "hash", "image", "convert", "devtools"].map((id) => JSON.parse(readFileSync(join(__dirname, "../../../addons", id, "package.json"), "utf8")).jimkit as AddonManifest);
const catalog = buildCatalog(addons);
const tools = (name: string, type = "") => actionsFor([new File(["x"], name, { type })], catalog).map((a) => a.tool);

describe("which tools take a file", () => {
  it("offers the text editor for the text formats the converter produces", () => {
    for (const [name, type] of [["CHANGELOG.rst", ""], ["CHANGELOG.rst", "text/x-rst"], ["notes.org", ""], ["doc.adoc", ""], ["paper.tex", "application/x-tex"], ["a.md", "text/markdown"]]) {
      expect(tools(name, type), `${name} (${type})`).toContain("text-editor");
    }
  });
  it("offers the one text editor for Markdown and JSON, once", () => {
    expect(tools("a.md").filter((t) => t === "text-editor")).toHaveLength(1);
    expect(tools("a.json").filter((t) => t === "text-editor")).toHaveLength(1);
  });
  it("does not offer the text editor for a photo or a video", () => {
    expect(tools("a.png", "image/png")).not.toContain("text-editor");
    expect(tools("a.mp4", "video/mp4")).not.toContain("text-editor");
  });
  it("always offers the hash tool and the converter for any file", () => {
    expect(tools("CHANGELOG.rst")).toEqual(expect.arrayContaining(["hash", "convert"]));
  });
});
