import { describe, expect, it } from "vitest";
import { compareVersions, manifestProblem, parseSource, validateBundle } from "../src/bundle.mjs";

const manifest = () => ({
  id: "word-count", name: "Word count", description: "Counts words.", version: "1.2.0", apiVersion: 1,
  tools: [{ id: "word-count-tool", category: "utilities", name: "Word count", blurb: "Counts words", icon: "PenLine", keywords: ["length"] }],
  fileActions: [{ id: "count", tool: "word-count-tool", label: "Count", icon: "PenLine", accept: { ext: ["txt"], mime: ["text/*"] }, priority: 5 }],
});
const bundle = (over: Record<string, unknown> = {}) => ({ format: 1, manifest: manifest(), files: { "client.js": "export default {}" }, ...over });

describe("validateBundle", () => {
  it("accepts a bundle and sets client/server from the files that are there", () => {
    const r = validateBundle(bundle({ files: { "client.js": "x", "server.js": "y" } }));
    expect(r.ok && r.bundle.manifest.client && r.bundle.manifest.server).toBe(true);
    const clientOnly = validateBundle(bundle());
    expect(clientOnly.ok && clientOnly.bundle.manifest.server).toBe(false);
  });

  it("ignores client/server flags claimed by the manifest itself", () => {
    const r = validateBundle(bundle({ manifest: { ...manifest(), server: true, client: false } }));
    expect(r.ok && r.bundle.manifest.server).toBe(false);
    expect(r.ok && r.bundle.manifest.client).toBe(true);
  });

  it.each([
    ["not an object", null],
    ["a newer format", bundle({ format: 2 })],
    ["no files", bundle({ files: undefined })],
    ["a file it may not hold", bundle({ files: { "client.js": "x", "../../etc/passwd": "x" } })],
    ["a file that isn't text", bundle({ files: { "client.js": 5 } })],
    ["nothing to run", bundle({ files: { "client.css": "a{}" } })],
    ["a file that is too large", bundle({ files: { "client.js": "x".repeat(4 * 1024 * 1024 + 1) } })],
    ["files together too large", bundle({ files: { "client.js": "x".repeat(3_500_000), "server.js": "x".repeat(3_500_000) } })],
  ])("refuses %s", (_name, value) => {
    expect(validateBundle(value).ok).toBe(false);
  });
});

describe("manifestProblem", () => {
  const bad = (change: (m: ReturnType<typeof manifest>) => void) => { const m = manifest(); change(m); return manifestProblem(m); };

  it("passes a good manifest", () => expect(manifestProblem(manifest())).toBeNull());
  it("wants a safe id", () => expect(bad((m) => { m.id = "../x"; })).toMatch(/id/));
  it("wants a version", () => expect(bad((m) => { m.version = "latest"; })).toMatch(/version/));
  it("refuses another API version", () => expect(bad((m) => { m.apiVersion = 2; })).toMatch(/API/));
  it("needs a tool", () => expect(bad((m) => { m.tools = []; })).toMatch(/tools/));
  it("refuses a duplicate tool id", () => expect(bad((m) => { m.tools.push({ ...m.tools[0] }); })).toMatch(/twice/));
  it("refuses an unknown category", () => expect(bad((m) => { m.tools[0].category = "nope"; })).toMatch(/category/));
  it("accepts a category the addon declares", () => {
    const m = manifest() as Record<string, unknown>;
    m.categories = [{ id: "mine", name: "Mine", blurb: "x", icon: "Puzzle", hue: 20 }];
    (m.tools as { category: string }[])[0].category = "mine";
    expect(manifestProblem(m)).toBeNull();
  });
  it("refuses a file action for a tool it doesn't have", () => expect(bad((m) => { m.fileActions[0].tool = "ghost"; })).toMatch(/ghost/));
  it("refuses odd Debian package names", () => expect(manifestProblem({ ...manifest(), system: { apt: ["ffmpeg; rm -rf /"] } })).toMatch(/apt/));
  it("checks the settings declaration", () => expect(manifestProblem({ ...manifest(), settings: [{ key: "a", label: "A", type: "number", default: "x" }] })).toMatch(/settings/));
  it("refuses a javascript: homepage", () => expect(manifestProblem({ ...manifest(), homepage: "javascript:alert(1)" })).toMatch(/homepage/));
});

describe("parseSource", () => {
  it("reads user/name", () => expect(parseSource("Ada/Word-Count")).toEqual({ user: "Ada", name: "Word-Count", key: "ada/word-count", version: undefined }));
  it("reads a version", () => expect(parseSource("ada/wc@v1.2.0")?.version).toBe("1.2.0"));
  it("reads a GitHub link", () => expect(parseSource("https://github.com/ada/wc")?.key).toBe("ada/wc"));
  it("reads a .git link", () => expect(parseSource("github.com/ada/wc.git")?.key).toBe("ada/wc"));
  it("reads a release link", () => expect(parseSource("https://github.com/ada/wc/releases/tag/v2.0.1")).toMatchObject({ key: "ada/wc", version: "2.0.1" }));
  it.each(["", "ada", "ada/", "/wc", "a/b/c", "-bad/wc", "ada/..", "ada/wc@latest", "ada/wc name", "https://evil.example/ada/wc"])("refuses %j", (s) => expect(parseSource(s)).toBeNull());
});

describe("compareVersions", () => {
  it("orders numerically", () => { expect(compareVersions("1.10.0", "1.9.0")).toBe(1); expect(compareVersions("1.0.0", "1.0.0")).toBe(0); expect(compareVersions("0.9.9", "1.0.0")).toBe(-1); });
  it("puts a prerelease before its release", () => { expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1); expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1); });
});

describe("theme kits", () => {
  const themeManifest = (over: Record<string, unknown> = {}) => ({ id: "dusk", name: "Dusk", description: "A dim look.", version: "1.0.0", apiVersion: 1, tools: [], themes: [{ id: "dusk", name: "Dusk", blurb: "Evening, mostly" }], ...over });
  const css = ':root[data-theme="dusk"] { --color-bg: #111; }';
  const themeBundle = (m: Record<string, unknown> = themeManifest(), files: Record<string, string> = { "theme.css": css }) => ({ format: 1, manifest: m, files });

  it("is a manifest with themes and a stylesheet, and no tools or code", () => {
    const r = validateBundle(themeBundle());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bundle.manifest).toMatchObject({ client: false, server: false });
  });
  it("needs a stylesheet when it declares themes, and themes when it has a stylesheet", () => {
    expect(validateBundle(themeBundle(themeManifest(), { "server.js": "export default {}" }))).toMatchObject({ ok: false, error: expect.stringContaining("no theme.css") });
    // a theme may be only a layout: client code and no stylesheet
    expect(validateBundle(themeBundle(themeManifest({ themes: [{ id: "dusk", name: "Dusk", blurb: "x", layout: "list" }] }), { "client.js": "export default {}" })).ok).toBe(true);
    expect(validateBundle(bundle({ files: { "client.js": "x", "theme.css": css } }))).toMatchObject({ ok: false, error: expect.stringContaining("brings no themes") });
  });
  it("still needs a tool when there are no themes", () => {
    expect(manifestProblem({ ...manifest(), tools: [] })).toMatch(/tools/);
  });
  it("takes plain CSS only: no @import, no url() that leaves the file", () => {
    expect(validateBundle(themeBundle(themeManifest(), { "theme.css": `@import "x.css"; ${css}` }))).toMatchObject({ ok: false, error: expect.stringContaining("@import") });
    expect(validateBundle(themeBundle(themeManifest(), { "theme.css": `:root[data-theme="dusk"] body { background: url(https://example.org/a.png); }` }))).toMatchObject({ ok: false, error: expect.stringContaining("url()") });
    expect(validateBundle(themeBundle(themeManifest(), { "theme.css": `:root[data-theme="dusk"] body { background: url("data:image/svg+xml,%3Csvg/%3E"); }` })).ok).toBe(true);
    // a comment may talk about it
    expect(validateBundle(themeBundle(themeManifest(), { "theme.css": `/* no @import here */ ${css}` })).ok).toBe(true);
  });
  it("checks the theme ids: not Basic, not twice, lowercase", () => {
    expect(manifestProblem(themeManifest({ themes: [{ id: "basic", name: "B", blurb: "b" }] }))).toMatch(/bad id/);
    expect(manifestProblem(themeManifest({ themes: [{ id: "Dusk", name: "B", blurb: "b" }] }))).toMatch(/bad id/);
    expect(manifestProblem(themeManifest({ themes: [{ id: "a1", name: "A", blurb: "a" }, { id: "a1", name: "A", blurb: "a" }] }))).toMatch(/twice/);
    expect(manifestProblem(themeManifest({ themes: [{ id: "a1", name: "A", blurb: "a", layout: "Tiles!" }] }))).toMatch(/layout/);
    expect(manifestProblem(themeManifest({ themes: [{ id: "a1", name: "A", blurb: "a", layout: "tiles", flat: "yes" }] }))).toMatch(/flat/);
    expect(manifestProblem(themeManifest({ themes: [{ id: "a1", name: "A", blurb: "a", layout: "tiles", flat: true }] }))).toBeNull();
    expect(manifestProblem(themeManifest({ themes: [] }))).toMatch(/themes/);
  });
});

describe("quick actions and aliases", () => {
  const withTool = (extra: Record<string, unknown>) => ({ ...manifest(), tools: [{ ...manifest().tools[0], ...extra }] });
  it("accepts them", () => {
    expect(manifestProblem(withTool({ quick: [{ label: "New one", init: { mode: "x" } }], aliases: { old: { mode: "x" } } }))).toBeNull();
  });
  it("refuses too many, a missing label, or an init that is not an object", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ label: `n${i}`, init: {} }));
    expect(manifestProblem(withTool({ quick: many }))).toMatch(/quick/);
    expect(manifestProblem(withTool({ quick: [{ init: {} }] }))).toMatch(/quick/);
    expect(manifestProblem(withTool({ quick: [{ label: "x", init: "mode" }] }))).toMatch(/quick/);
    expect(manifestProblem(withTool({ aliases: { "Bad Id": {} } }))).toMatch(/aliases/);
    expect(manifestProblem(withTool({ aliases: { old: "x" } }))).toMatch(/aliases/);
  });
});
