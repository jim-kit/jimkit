import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { validateBundle } from "@jimkit/sdk/bundle";
import { lintThemeCss, packKit } from "../src/pack.mjs";

const fixture = fileURLToPath(new URL("./fixtures/dusk-theme", import.meta.url));
const made: string[] = [];
const copy = () => { const d = mkdtempSync(join(tmpdir(), "jk-theme-")); made.push(d); cpSync(fixture, d, { recursive: true }); return d; };
afterAll(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

describe("packing a theme kit", () => {
  it("makes a bundle with a stylesheet and no code", async () => {
    const d = copy();
    const r = await packKit(d, { out: join(d, "out.json") });
    const bundle = JSON.parse(readFileSync(r.file, "utf8"));
    expect(Object.keys(bundle.files)).toEqual(["theme.css"]);
    expect(bundle.files["theme.css"]).toContain('[data-theme="dusk"]');
    expect(bundle.manifest).toMatchObject({ id: "dusk-theme", client: false, server: false, themes: [{ id: "dusk" }] });
    expect(validateBundle(bundle).ok).toBe(true);
  });

  it("refuses a rule that would restyle every theme", async () => {
    const d = copy();
    writeFileSync(join(d, "src", "theme.css"), `:root[data-theme="dusk"] { --color-bg: #000; }\n.jk-card { border-radius: 0; }\n`);
    await expect(packKit(d)).rejects.toThrow(/not scoped to your theme[\s\S]*\.jk-card/);
  });

  it("refuses @import", async () => {
    const d = copy();
    writeFileSync(join(d, "src", "theme.css"), `@import "https://example.org/x.css";\n:root[data-theme="dusk"] { --color-bg: #000; }\n`);
    await expect(packKit(d)).rejects.toThrow(/@import/);
  });

  it("wants a theme.css when themes are declared, and the other way round", async () => {
    const d = copy();
    rmSync(join(d, "src", "theme.css"));
    await expect(packKit(d)).rejects.toThrow(/none of client\.ts, server\.ts or theme\.css|no src\/theme\.css/);
    const e = copy();
    const pj = JSON.parse(readFileSync(join(e, "package.json"), "utf8"));
    delete pj.jimkit.themes;
    writeFileSync(join(e, "package.json"), JSON.stringify(pj));
    await expect(packKit(e)).rejects.toThrow(/no "themes"/);
  });
});

describe("lintThemeCss", () => {
  it("accepts rules from any of the kit's themes, in media queries, and keyframes", () => {
    expect(() => lintThemeCss(`@media (min-width: 1px) { :root[data-theme="a"] .x { color: red } } :root[data-theme="b"] y { color: blue } @keyframes k { from { opacity: 0 } }`, ["a", "b"])).not.toThrow();
  });
  it("accepts a selector list only when every part is scoped", () => {
    expect(() => lintThemeCss(`:root[data-theme="a"] .x, .y { color: red }`, ["a"])).toThrow(/\.y/);
  });
});
