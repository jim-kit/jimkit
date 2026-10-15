import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as jsxRuntime from "react/jsx-runtime";
import * as React from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateBundle } from "@jimkit/sdk/bundle";
import { packKit } from "../src/pack.mjs";

const fixture = fileURLToPath(new URL("./fixtures/word-count", import.meta.url));
let work: string;
let packed: Awaited<ReturnType<typeof packKit>>;
let bundle: { manifest: Record<string, unknown>; files: Record<string, string> };

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "jk-pack-"));
  packed = await packKit(fixture, { out: join(work, "jimkit-kit.json") });
  bundle = JSON.parse(readFileSync(packed.file, "utf8"));
}, 60_000);
afterAll(() => rmSync(work, { recursive: true, force: true }));

describe("packKit", () => {
  it("writes a bundle the host accepts", () => {
    expect(validateBundle(bundle).ok).toBe(true);
    expect(bundle.manifest).toMatchObject({ id: "word-count", version: "1.2.0", author: "Ada Lovelace", apiVersion: 1, client: true, server: true });
  });

  it("leaves the host's modules out of the browser code", () => {
    const js = bundle.files["client.js"];
    expect(js).not.toMatch(/from\s*["']react["']/);
    expect(js).not.toMatch(/from\s*["']@jimkit/);
    expect(js).toContain("__jimkit"); // reads them from the page
    expect(js).toContain("words"); // the kit's own code is in there, including the lazily imported tool
  });

  it("ships only the utilities the kit uses, in terms of the host's theme variables", () => {
    const css = bundle.files["client.css"];
    expect(css.startsWith("@layer kit{")).toBe(true); // below the host's utilities, so it can't undo the host's responsive rules
    expect(css).toContain(".bg-surface");
    expect(css).toContain("var(--color-surface)");
    expect(css).not.toContain(".bg-accent"); // nothing in the kit uses it
    expect(css).not.toMatch(/--color-surface\s*:/); // the host defines its tokens; the kit must not redefine them
  });

  it("runs in a page: the default export lists the tool's loader", async () => {
    const g = globalThis as Record<string, unknown>;
    g.__jimkit = { modules: { react: React, "react/jsx-runtime": jsxRuntime, "@jimkit/ui": new Proxy({}, { get: () => () => null }), "@jimkit/sdk": { defineClient: (m: unknown) => m }, "@jimkit/sdk/react": { useHost: () => ({ session: { tier: "public" } }) } } };
    try {
      const mod = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(bundle.files["client.js"]).toString("base64")}`);
      expect(Object.keys(mod.default.tools)).toEqual(["word-count-tool"]);
      const tool = await mod.default.tools["word-count-tool"]();
      expect(typeof tool.default).toBe("function");
    } finally {
      delete g.__jimkit;
    }
  });

  it("runs on the server: routes come from the kit, node modules stay node's", async () => {
    const g = globalThis as Record<string, unknown>;
    g.__jimkit = { modules: { "@jimkit/sdk": { defineServer: (m: unknown) => m }, "@jimkit/sdk/server": { throttle: () => 1 } } };
    try {
      const file = join(work, "server.mjs"); // the host imports it from disk, and import.meta.url must be a file
      writeFileSync(file, bundle.files["server.js"]);
      const mod = await import(/* @vite-ignore */ pathToFileURL(file).href);
      expect(Object.keys(mod.default.routes)).toEqual(["GET hello"]);
    } finally {
      delete g.__jimkit;
    }
  });

  it("explains what is wrong when there is nothing to pack", async () => {
    await expect(packKit(work)).rejects.toThrow(/package\.json/);
  });
});
