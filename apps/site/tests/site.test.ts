import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accentVars } from "../src/lib/accent";
import { renderDoc } from "../src/lib/docs";
import { fileMatches, offersFor } from "../src/lib/offers";
import { loadBuiltInKits, normalizeKits } from "../src/lib/registry";
import { hasKitRelease, parseRepo, repoChoices, statusText, submitError } from "../src/lib/submit";
import { sha256Js } from "../src/lib/sha256";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("sha256 fallback (for pages served over plain http)", () => {
  it("agrees with the reference hashes", () => {
    expect(sha256Js(bytes(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Js(bytes("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Js(bytes("Jimkit"))).toBe("c1bb2c13499bb3c08d1eb0ab02bb0dc5a76aadf4592d828f03f7cf2b18b74a96");
  });
  it("matches the browser's own across block boundaries", async () => {
    for (const n of [55, 56, 63, 64, 65, 1000]) {
      const data = bytes("a".repeat(n));
      const native = [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map((b) => b.toString(16).padStart(2, "0")).join("");
      expect(sha256Js(data)).toBe(native);
    }
  });
});

describe("which tools take a file", () => {
  const actions = [
    { id: "convert", tool: "convert", label: "Convert", icon: "Shuffle", priority: 50, accept: { ext: ["*"] } },
    { id: "hash", tool: "hash", label: "Hash", icon: "Fingerprint", priority: -10, accept: { mime: ["*/*"], ext: ["*"] } },
    { id: "image", tool: "image-editor", label: "Edit image", icon: "Crop", priority: 40, accept: { ext: ["png", "jpg"], mime: ["image/png", "image/jpeg"] } },
    { id: "md", tool: "markdown", label: "Markdown", icon: "Heading", priority: 30, accept: { ext: ["md"] } },
  ];
  it("matches by extension, by MIME type and by wildcard", () => {
    expect(fileMatches({ name: "a.PNG", type: "" }, actions[2].accept)).toBe(true);
    expect(fileMatches({ name: "noext", type: "image/jpeg" }, actions[2].accept)).toBe(true);
    expect(fileMatches({ name: "a.zip", type: "application/zip" }, actions[2].accept)).toBe(false);
    expect(fileMatches({ name: "a.zip", type: "" }, actions[0].accept)).toBe(true);
  });
  it("lists the best offer first", () => {
    expect(offersFor({ name: "photo.png", type: "image/png" }, actions).map((a) => a.id)).toEqual(["convert", "image", "hash"]);
    expect(offersFor({ name: "notes.md", type: "" }, actions).map((a) => a.id)).toEqual(["convert", "md", "hash"]);
    expect(offersFor({ name: "backup.zip", type: "" }, actions).map((a) => a.id)).toEqual(["convert", "hash"]);
  });
});

describe("accent text colour", () => {
  it("picks whichever of ink and white reads better", () => {
    expect(accentVars("hex-ff4d1f")["--accent-fg"]).toBe("#1a1510"); // vermilion: ink is 5:1, white is 3.5:1
    expect(accentVars("hex-0f7a55")["--accent-fg"]).toBe("#ffffff"); // a deep green wants white
    expect(accentVars("hex-f2a900")["--accent-fg"]).toBe("#1a1510");
  });
  it("leaves the presets to the stylesheet", () => {
    expect(accentVars("orange")).toEqual({});
  });
});

describe("rendering a doc", () => {
  const render = (md: string) => {
    const file = join(mkdtempSync(join(tmpdir(), "jk-site-")), "x.md");
    writeFileSync(file, md);
    return renderDoc(file);
  };
  it("gives headings ids, in order and without clashes", () => {
    const { html, headings } = render("# T\n\n## Docker\n\n## Docker\n\n### Flags & more\n");
    expect(headings).toEqual([{ id: "docker", text: "Docker", level: 2 }, { id: "docker-1", text: "Docker", level: 2 }, { id: "flags-more", text: "Flags & more", level: 3 }]);
    expect(html).toContain('<h2 id="docker">');
  });
  it("turns links between docs into the site's addresses and keeps them in the same tab", () => {
    const { html } = render("See [kits](kits.md#trust) and [the web](https://example.com).\n");
    expect(html).toContain('<a href="/docs/kits/#trust">kits</a>');
    expect(html).toContain('target="_blank"'); // the external one still opens elsewhere
  });
  it("wraps code blocks with a copy button and tables so they scroll", () => {
    const { html } = render("```sh\necho hi\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
    expect(html).toContain('<div class="doc-code"><button type="button" data-copy');
    expect(html).toContain('<div class="doc-table"><table>');
  });
});

describe("the kit directory", () => {
  it("lists the built-in kits, tool kits first and the looks after them", () => {
    const kits = loadBuiltInKits();
    expect(kits.map((k) => k.id)).toEqual(expect.arrayContaining(["text", "convert", "theme-glass", "theme-metro", "theme-paper"]));
    const firstLook = kits.findIndex((k) => k.looks.length && !k.tools.length);
    expect(kits.slice(firstLook).every((k) => k.looks.length && !k.tools.length)).toBe(true);
  });
  it("reads the registry's index and drops what is malformed", () => {
    const kits = normalizeKits(JSON.parse(readFileSync(join(__dirname, "fixtures/registry-index.json"), "utf8")));
    expect(kits.map((k) => k.repo)).toEqual(["ada/word-count", "ada/dusk"]);
    expect(kits[0]).toMatchObject({ latest: "1.3.0", rating: { average: 4.5, count: 2 }, stars: 12 });
    expect(kits[0].versions[0].date).toBe("2026-10-10");
    expect(kits[1].looks[0].name).toBe("Dusk");
  });
  it("accepts nothing it can't make sense of", () => {
    expect(normalizeKits(null)).toEqual([]);
    expect(normalizeKits({ kits: "no" })).toEqual([]);
    expect(normalizeKits({ kits: [{ repo: "a/b", name: "x", versions: [{ version: 3 }] }] })).toEqual([]);
    expect(normalizeKits({ kits: [{ repo: "a/b", name: "x", homepage: "javascript:alert(1)", versions: [{ version: "1.0.0" }] }] })[0].homepage).toBeUndefined();
  });
});

describe("submitting a kit", () => {
  it("accepts your own repository, however it is written", () => {
    for (const input of ["ada/word-count", " Ada/Word-Count ", "https://github.com/Ada/word-count", "github.com/ada/word-count.git", "ada/word-count/"]) expect(parseRepo(input, "Ada")).toEqual({ repo: "ada/word-count" });
  });
  it("refuses someone else's repository, a bad name and nothing at all", () => {
    expect(parseRepo("grace/tool", "ada")).toMatchObject({ error: expect.stringContaining("own GitHub name") });
    expect(parseRepo("ada", "ada")).toHaveProperty("error");
    expect(parseRepo("ada/with space", "ada")).toHaveProperty("error");
    expect(parseRepo("  ", "ada")).toHaveProperty("error");
  });
  it("looks for a release that carries the kit file", () => {
    expect(hasKitRelease([{ assets: [{ name: "jimkit-kit.json" }] }])).toBe(true);
    expect(hasKitRelease([{ draft: true, assets: [{ name: "jimkit-kit.json" }] }, { assets: [{ name: "other.zip" }] }])).toBe(false);
    expect(hasKitRelease({ message: "rate limited" })).toBeNull();
  });
  it("offers the person's public repositories, newest push first, without archived or already submitted ones", () => {
    const api = [
      { full_name: "Ada/old", name: "old", pushed_at: "2025-01-01T00:00:00Z" },
      { full_name: "Ada/word-count", name: "word-count", description: "Counts words", pushed_at: "2026-10-01T00:00:00Z" },
      { full_name: "Ada/dusk", name: "dusk", fork: true, pushed_at: "2026-09-01T00:00:00Z" },
      { full_name: "Ada/archived", name: "archived", archived: true, pushed_at: "2026-10-05T00:00:00Z" },
      { full_name: "Ada/listed", name: "listed", pushed_at: "2026-10-02T00:00:00Z" },
      null, { nonsense: true },
    ];
    expect(repoChoices(api, ["ada/listed"]).map((c) => c.repo)).toEqual(["ada/word-count", "ada/dusk", "ada/old"]);
    expect(repoChoices(api)[0]).toMatchObject({ name: "listed" });
    expect(repoChoices({ message: "rate limited" })).toEqual([]);
  });
  it("says what happened in words", () => {
    expect(statusText("pending")).toBe("Waiting for approval");
    expect(submitError({ code: "23505" })).toMatch(/already/);
    expect(submitError({ message: 'new row violates row-level security policy for table "kits"' })).toMatch(/20 kits/);
  });
});
