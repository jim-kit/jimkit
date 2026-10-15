import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { accentVars } from "../src/lib/accent";
import { renderDoc } from "../src/lib/docs";
import { fileMatches, offersFor } from "../src/lib/offers";
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
