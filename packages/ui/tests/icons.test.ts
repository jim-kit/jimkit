import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ICON_MOTION, hasBuiltInIcon } from "../src/icons";
import { ICON_ANIMATIONS } from "../../sdk/src/index";

// Every icon an addon names in its manifest must be one the UI can draw, or the tool shows a plain file icon.
describe("addon icons", () => {
  const root = join(__dirname, "../../../addons");
  const names = new Set<string>();
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const text = readFileSync(join(root, dir.name, "package.json"), "utf8");
    for (const m of text.matchAll(/"icon":\s*"([A-Za-z0-9]+)"/g)) names.add(m[1]);
  }

  it("finds the manifests", () => {
    expect(names.size).toBeGreaterThan(10);
  });

  it("are all in the built-in set", () => {
    expect([...names].filter((n) => !hasBuiltInIcon(n))).toEqual([]);
  });
});

// docs/icons.md is what a kit author reads to pick an icon: it must list every icon the host can draw, and every motion that exists.
describe("docs/icons.md", () => {
  const doc = readFileSync(join(__dirname, "../../../docs/icons.md"), "utf8");
  const src = readFileSync(join(__dirname, "../src/icons.tsx"), "utf8");
  const built = [...(/const BUILT_IN[^{]*\{([^}]*)\}/.exec(src)?.[1] ?? "").matchAll(/\b([A-Z][A-Za-z0-9]+)\b/g)].map((m) => m[1]);

  it("lists every built-in icon", () => {
    expect(built.length).toBeGreaterThan(40);
    expect(built.filter((n) => !doc.includes(`\`${n}\``))).toEqual([]);
  });
  it("names every motion", () => {
    expect(ICON_ANIMATIONS.filter((a) => !doc.includes(`\`${a}\``))).toEqual([]);
  });
  it("only gives motions to icons that exist, using motions that exist", () => {
    for (const [name, motion] of Object.entries(ICON_MOTION)) {
      expect(hasBuiltInIcon(name), name).toBe(true);
      expect(ICON_ANIMATIONS as readonly string[], `${name}: ${motion}`).toContain(motion);
    }
  });
});
