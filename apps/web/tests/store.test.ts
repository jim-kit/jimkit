import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { reloadConfig } from "@/core/config";

vi.mock("@/generated/manifests.json", () => ({ default: [{ id: "demo", name: "Demo", version: "1.0.0", description: "", tools: [{ id: "demo-tool", category: "utilities", name: "Demo", blurb: "x", icon: "Puzzle" }] }] }));
vi.mock("@/generated/addons.server", () => ({ serverLoaders: {} }));

const SERVER = (word: string) => `const m = globalThis.__jimkit.modules["@jimkit/sdk"];\nexport default m.defineServer({ routes: { "GET hello": ({ client }, ctx) => ctx.reply(client, { word: ${JSON.stringify(word)} }) } });\n`;
const bundle = (over: { version?: string; id?: string; toolId?: string; word?: string; server?: boolean } = {}) =>
  JSON.stringify({
    format: 1,
    manifest: {
      id: over.id ?? "word-count", name: "Word count", description: "Counts words.", version: over.version ?? "1.0.0", apiVersion: 1,
      tools: [{ id: over.toolId ?? "word-count-tool", category: "utilities", name: "Word count", blurb: "Counts words", icon: "PenLine" }],
    },
    files: { "client.js": "export default { tools: {} };", "client.css": ".x{}", ...(over.server === false ? {} : { "server.js": SERVER(over.word ?? "v1") }) },
  });
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** A stand-in for GitHub: release assets by tag, behind the redirect GitHub really does, and the registry's index.json. */
function fakeGitHub(releases: Record<string, string>, index?: unknown) {
  const calls: string[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    if (u.hostname === "raw.githubusercontent.com") return index ? new Response(JSON.stringify(index)) : new Response("", { status: 404 });
    const m = /^\/([^/]+\/[^/]+)\/releases\/(latest\/download|download\/([^/]+))\/jimkit-kit\.json$/.exec(u.pathname);
    if (u.hostname === "github.com" && m) {
      const key = `${m[1].toLowerCase()}@${m[3] ?? "latest"}`; // GitHub ignores case
      return releases[key] !== undefined ? new Response(null, { status: 302, headers: { location: `https://release-assets.githubusercontent.com/blob/${encodeURIComponent(key)}` } }) : new Response("", { status: 404 });
    }
    if (u.hostname === "release-assets.githubusercontent.com") {
      const key = decodeURIComponent(u.pathname.split("/").pop()!);
      return new Response(releases[key]);
    }
    return new Response("", { status: 404 });
  };
  return { fetchFn, calls };
}

let dir = "";
let svc: typeof import("@/core/store/service");
let kits: typeof import("@/core/store/kits");
let addons: typeof import("@/core/addons");
let registry: typeof import("@/core/store/registry");
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "jimkit-store-"));
  process.env.JIMKIT_DATA_DIR = dir;
  process.env.JIMKIT_REGISTRY = "acme/registry";
  reloadConfig();
  svc = await import("@/core/store/service");
  kits = await import("@/core/store/kits");
  addons = await import("@/core/addons");
  registry = await import("@/core/store/registry");
});
beforeEach(() => registry.forgetRegistry());

const listing = (b: string, over: Record<string, unknown> = {}) => ({
  format: 1,
  kits: [{ repo: "ada/word-count", name: "Word count", description: "Counts words.", latest: "1.0.0", tools: [], rating: { average: 4.5, count: 2 }, reviews: [], versions: [{ version: "1.0.0", tag: "v1.0.0", sha256: sha(b), size: b.length, date: "2026-10-01", server: true }], ...over }],
});

describe("installing from a GitHub link", () => {
  it("looks first, then installs exactly what it looked at", async () => {
    const b = bundle();
    const { fetchFn } = fakeGitHub({ "ada/word-count@latest": b });
    const p = await svc.inspect("https://github.com/Ada/Word-Count", { fetchFn });
    expect(p).toMatchObject({ repo: "ada/word-count", id: "word-count", version: "1.0.0", trust: "unlisted", change: "new", server: true, sha256: sha(b) });
    expect(kits.installedKits()).toEqual([]); // looking installs nothing
    await expect(svc.commit(p.sha256)).rejects.toThrow(/trust this kit/); // nobody vouched for it: say so first
    const { record, warning } = await svc.commit(p.sha256, true);
    expect(warning).toBeUndefined();
    expect(record).toMatchObject({ id: "word-count", repo: "ada/word-count", version: "1.0.0" });
    expect(addons.enabledManifests().map((m) => m.id)).toEqual(["demo", "word-count"]);
    expect(addons.enabledManifests()[1].source).toMatchObject({ repo: "ada/word-count", sha256: sha(b) });
  });

  it("runs the kit's server routes, with the host's SDK", async () => {
    const res = await addons.dispatch(new Request("http://jimkit.test/api/a/word-count/hello", { headers: { host: "jimkit.test" } }), "word-count", ["hello"]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ word: "v1" });
  });

  it("serves the browser files by hash, and never server.js", () => {
    const k = kits.installedKits()[0];
    expect(kits.kitFile("word-count", k.sha256, "client.js")).toMatch(/client\.js$/);
    expect(kits.kitFile("word-count", k.sha256, "client.css")).toMatch(/client\.css$/);
    expect(kits.kitFile("word-count", k.sha256, "server.js")).toBeNull();
    expect(kits.kitFile("word-count", "0".repeat(64), "client.js")).toBeNull();
    expect(kits.kitFile("../word-count", k.sha256, "client.js")).toBeNull();
    expect(kits.kitFile("word-count", `${k.sha256}/../x`, "client.js")).toBeNull();
  });

  it("updates: the new version replaces the old one and its server code is loaded afresh", async () => {
    const b2 = bundle({ version: "1.1.0", word: "v2" });
    const { fetchFn } = fakeGitHub({ "ada/word-count@latest": b2 });
    const p = await svc.inspect("ada/word-count", { fetchFn });
    expect(p).toMatchObject({ change: "update", installed: "1.0.0", version: "1.1.0" });
    const old = kits.installedKits()[0].sha256;
    await svc.commit(p.sha256, true);
    expect(kits.installedKits()).toHaveLength(1);
    expect(existsSync(join(dir, "kits", "word-count", old))).toBe(false);
    const res = await addons.dispatch(new Request("http://jimkit.test/api/a/word-count/hello", { headers: { host: "jimkit.test" } }), "word-count", ["hello"]);
    expect(await res.json()).toEqual({ word: "v2" });
  });

  it("asks for an exact older version by tag, with or without the v", async () => {
    const b1 = bundle();
    const { fetchFn, calls } = fakeGitHub({ "ada/word-count@1.0.0": b1 });
    const p = await svc.inspect("ada/word-count@1.0.0", { fetchFn });
    expect(p).toMatchObject({ version: "1.0.0", change: "older" });
    expect(calls.some((c) => c.includes("/download/v1.0.0/"))).toBe(true);
  });

  it("removes a kit: files gone, routes gone, tools gone", async () => {
    svc.uninstall("word-count");
    expect(kits.installedKits()).toEqual([]);
    expect(readdirSync(join(dir, "kits")).filter((n) => n !== "installed.json")).toEqual([]);
    expect(addons.enabledManifests().map((m) => m.id)).toEqual(["demo"]);
    const res = await addons.dispatch(new Request("http://jimkit.test/api/a/word-count/hello"), "word-count", ["hello"]);
    expect(res.status).toBe(404);
    expect(() => svc.uninstall("word-count")).toThrow(/isn't installed/);
  });
});

describe("what the registry knows", () => {
  it("vouches for a file it recorded, and then no acknowledgement is needed", async () => {
    const b = bundle();
    const { fetchFn } = fakeGitHub({ "ada/word-count@v1.0.0": b }, listing(b));
    const p = await svc.inspect("ada/word-count", { fetchFn });
    expect(p.trust).toBe("verified");
    await svc.commit(p.sha256);
    svc.uninstall("word-count");
  });

  it("refuses a release that changed after it was listed", async () => {
    const listed = bundle();
    const { fetchFn } = fakeGitHub({ "ada/word-count@v1.0.0": bundle({ word: "tampered" }) }, listing(listed));
    await expect(svc.inspect("ada/word-count", { fetchFn })).rejects.toThrow(/isn't the one the registry recorded/);
  });

  it("flags a newer version the registry hasn't seen yet", async () => {
    const b1 = bundle();
    const b2 = bundle({ version: "1.2.0" });
    const { fetchFn } = fakeGitHub({ "ada/word-count@1.2.0": b2 }, listing(b1));
    expect((await svc.inspect("ada/word-count@1.2.0", { fetchFn })).trust).toBe("unrecorded");
  });

  it("falls back to the last good copy when GitHub can't be reached", async () => {
    const b = bundle();
    const good = await registry.loadRegistry({ fetchFn: fakeGitHub({}, listing(b)).fetchFn, refresh: true });
    expect(good.kits).toHaveLength(1);
    const down = await registry.loadRegistry({ fetchFn: async () => { throw new Error("offline"); }, refresh: true });
    expect(down).toMatchObject({ ok: true, stale: true });
    expect(down.kits).toHaveLength(1);
  });

  it("says so plainly when there is no registry to read", async () => {
    const r = await registry.loadRegistry({ fetchFn: fakeGitHub({}).fetchFn, refresh: true });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/GitHub link/);
  });

  it("drops malformed entries instead of failing on them", () => {
    const kitsList = registry.normalizeIndex({ kits: [null, { repo: "no-slash" }, { repo: "a/b", name: "B", versions: [{ version: "1.0.0", sha256: "zz" }] }, listing(bundle()).kits[0]] });
    expect(kitsList.map((k) => k.repo)).toEqual(["ada/word-count"]);
  });

  it("reads where the registry lives from JIMKIT_REGISTRY", () => {
    expect(registry.registryLocation({ JIMKIT_REGISTRY: "acme/kits" })).toMatchObject({ repo: "acme/kits", url: "https://raw.githubusercontent.com/acme/kits/main/index.json" });
    expect(registry.registryLocation({ JIMKIT_REGISTRY: "https://example.com/index.json" })).toMatchObject({ repo: null, host: "example.com" });
    expect(registry.registryLocation({ JIMKIT_REGISTRY: "off" })).toBeNull();
    expect(registry.registryLocation({})?.repo).toBe("jim-kit/registry");
  });
});

describe("refusals", () => {
  const look = (releases: Record<string, string>, source = "ada/word-count") => svc.inspect(source, { fetchFn: fakeGitHub(releases).fetchFn });

  it("won't take an id or a tool that another addon already has", async () => {
    expect((await look({ "ada/word-count@latest": bundle({ id: "demo" }) })).conflict).toMatch(/already used by Demo/);
    expect((await look({ "ada/word-count@latest": bundle({ toolId: "demo-tool" }) })).conflict).toMatch(/clashes with a tool in Demo/);
    const p = await look({ "ada/word-count@latest": bundle({ id: "demo" }) });
    await expect(svc.commit(p.sha256, true)).rejects.toThrow(/already used/);
  });

  it("explains a repository that has no release", async () => {
    await expect(look({})).rejects.toThrow(/No release/);
  });

  it("refuses a file that isn't a kit", async () => {
    await expect(look({ "ada/word-count@latest": "<html>not json" })).rejects.toThrow(/valid JSON/);
    await expect(look({ "ada/word-count@latest": JSON.stringify({ format: 1, manifest: {}, files: {} }) })).rejects.toThrow(/manifest/);
    await expect(look({ "ada/word-count@latest": JSON.stringify({ format: 1, manifest: JSON.parse(bundle()).manifest, files: { "../../evil.js": "x", "client.js": "x" } }) })).rejects.toThrow(/may not/);
  });

  it("refuses a release whose file says another version", async () => {
    await expect(svc.inspect("ada/word-count@2.0.0", { fetchFn: fakeGitHub({ "ada/word-count@2.0.0": bundle({ version: "1.9.0" }) }).fetchFn })).rejects.toThrow(/says 1\.9\.0/);
  });

  it("only talks to GitHub: a redirect elsewhere is refused", async () => {
    const fetchFn = async (url: string) => new URL(url).hostname === "github.com" ? new Response(null, { status: 302, headers: { location: "https://evil.example/kit.json" } }) : new Response(bundle());
    await expect(svc.inspect("ada/word-count", { fetchFn })).rejects.toThrow(/Won't download from evil\.example/);
    const http = async () => new Response(null, { status: 302, headers: { location: "http://github.com/x" } });
    await expect(svc.inspect("ada/word-count", { fetchFn: http })).rejects.toThrow(/Won't download/);
  });

  it("stops reading a file that is too large", async () => {
    const fetchFn = async (url: string) => new URL(url).hostname === "github.com" ? new Response(null, { status: 302, headers: { location: "https://objects.githubusercontent.com/x" } }) : new Response("x".repeat(7 * 1024 * 1024));
    await expect(svc.inspect("ada/word-count", { fetchFn })).rejects.toThrow(/too large/);
  });

  it("refuses something that isn't a GitHub source", async () => {
    await expect(svc.inspect("https://evil.example/ada/word-count")).rejects.toThrow(/GitHub link/);
  });
});

describe("JIMKIT_KITS=off", () => {
  it("is read from the environment", () => {
    expect(kits.kitsLocked({ JIMKIT_KITS: "off" })).toBe(true);
    expect(kits.kitsLocked({ JIMKIT_KITS: "OFF " })).toBe(true);
    expect(kits.kitsLocked({ JIMKIT_KITS: "on" })).toBe(false);
    expect(kits.kitsLocked({})).toBe(false);
  });
  it("leaves the registry alone and says so in the view", async () => {
    process.env.JIMKIT_KITS = "off";
    try {
      const v = await svc.storeView();
      expect(v.locked).toBe(true);
      expect(v.registry.kits).toEqual([]);
    } finally {
      delete process.env.JIMKIT_KITS;
    }
  });
});

describe("what a registry reviewer can put on screen", () => {
  it("keeps reviews from real GitHub usernames and drops the rest", () => {
    const entry = listing(bundle()).kits[0];
    const out = registry.normalizeIndex({ kits: [{ ...entry, reviews: [
      { user: "grace", rating: 5, text: "ok", date: "2026-10-01" },
      { user: "evil.example/phish", rating: 5, text: "x", date: "2026-10-01" },
      { user: "<img src=x>", rating: 5, text: "x", date: "2026-10-01" },
      { user: "linus", rating: 9, text: "x", date: "2026-10-01" },
    ] }] });
    expect(out[0].reviews.map((r) => r.user)).toEqual(["grace"]);
  });
});

describe("the index the registry repository writes", () => {
  // apps/web/tests/fixtures/registry-index.json was produced by the registry's own index builder (jimkit-registry, scripts/build-index.mjs)
  it("is read in full by the app", async () => {
    const { readFileSync } = await import("node:fs");
    const json = JSON.parse(readFileSync(new URL("./fixtures/registry-index.json", import.meta.url), "utf8"));
    const [k] = registry.normalizeIndex(json);
    expect(k).toMatchObject({ repo: "ada/word-count", name: "Word count", author: "Ada Lovelace", homepage: "https://example.com/word-count", latest: "1.1.0", stars: 12, rating: { average: 4.5, count: 2 } });
    expect(k.versions.map((v) => [v.version, v.tag, v.server])).toEqual([["1.1.0", "v1.1.0", true], ["1.0.0", "v1.0.0", false]]);
    expect(k.versions[0].apt).toEqual(["ffmpeg"]);
    expect(k.versions.every((v) => /^[0-9a-f]{64}$/.test(v.sha256))).toBe(true);
    expect(k.reviews.map((r) => r.user).sort()).toEqual(["grace", "linus"]);
    expect(k.tools).toEqual([{ name: "Word count", blurb: "Counts", icon: "PenLine" }]);
  });
});

describe("theme kits", () => {
  const themeBundle = (id: string, theme: string) => JSON.stringify({
    format: 1,
    manifest: { id, name: "Dusk", description: "A dim look.", version: "1.0.0", apiVersion: 1, tools: [], themes: [{ id: theme, name: "Dusk", blurb: "Evening" }] },
    files: { "theme.css": `:root[data-theme="${theme}"] { --color-bg: #111; }` },
  });

  it("installs a stylesheet-only kit, serves its theme.css, and reports it", async () => {
    const kits = await import("@/core/store/kits");
    const record = kits.installBundle(themeBundle("dusk-kit", "dusk"), "ada/dusk", []);
    expect(record.themeCss).toBe(true);
    expect(kits.kitFile("dusk-kit", record.sha256, "theme.css")).toMatch(/theme\.css$/);
    expect(kits.kitFile("dusk-kit", record.sha256, "server.js")).toBeNull();
    const m = kits.kitManifests().find((x) => x.id === "dusk-kit");
    expect(m?.source).toMatchObject({ themeCss: true });
    expect(m?.themes?.[0].id).toBe("dusk");
    kits.removeKit("dusk-kit");
    expect(kits.kitManifests().some((x) => x.id === "dusk-kit")).toBe(false);
  });

  it("won't take a theme id another addon already brings", async () => {
    const kits = await import("@/core/store/kits");
    const other = { id: "theme-paper", name: "Paper theme", description: "", version: "1.0.0", apiVersion: 1, tools: [], themes: [{ id: "paper", name: "Paper", blurb: "" }] };
    expect(() => kits.installBundle(themeBundle("my-paper", "paper"), "ada/paper", [other])).toThrow(/theme "paper" clashes/);
  });
});
