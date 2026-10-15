import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// docs/layouts.md is what a theme author reads: every field of the layout API and every part has to be in it.
describe("docs/layouts.md", () => {
  const doc = readFileSync(join(__dirname, "../../../docs/layouts.md"), "utf8");
  const types = readFileSync(join(__dirname, "../src/layout.ts"), "utf8");
  const keys = (name: string) => {
    const body = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(types)?.[1] ?? "";
    return [...body.matchAll(/^  (\w+)[?(:]/gm)].map((m) => m[1]);
  };

  it("names every field of LayoutApi", () => {
    const fields = keys("LayoutApi");
    expect(fields.length).toBeGreaterThan(20);
    expect(fields.filter((k) => !doc.includes(k))).toEqual([]);
  });
  it("names every part", () => {
    const parts = keys("LayoutParts");
    expect(parts.length).toBe(7);
    expect(parts.filter((k) => !doc.includes(k))).toEqual([]);
  });
  it("names every field of a tool", () => {
    expect(keys("LayoutTool").filter((k) => !doc.includes(k))).toEqual([]);
  });
});
