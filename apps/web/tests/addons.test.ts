import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { reloadConfig, writeFileConfig } from "@/core/config";

// the registry is generated at build time; stand in a tiny addon
vi.mock("@/generated/manifests.json", () => ({ default: [{ id: "demo", name: "Demo", version: "1.0.0", description: "", tools: [] }] }));
vi.mock("@/generated/addons.server", () => ({
  serverLoaders: {
    demo: async () => ({
      default: {
        routes: {
          "GET hello": ({ client }: { client: { tier: string } }, ctx: { reply: Function }) => ctx.reply(client, { hello: true }, { headers: { "x-demo": "1" } }),
        },
      },
    }),
  },
}));

let dir = "";
let mod: typeof import("@/core/addons");
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "jimkit-addons-"));
  process.env.JIMKIT_DATA_DIR = dir;
  reloadConfig();
  mod = await import("@/core/addons");
});

const call = (method: string) => mod.dispatch(new Request("http://jimkit.test/api/a/demo/hello", { method, headers: { host: "jimkit.test" } }), "demo", ["hello"]);

describe("addon dispatch", () => {
  it("answers HEAD from the GET route: same status and headers, no body", async () => {
    const get = await call("GET");
    expect(get.status).toBe(200);
    expect(await get.text()).toContain("hello");
    const head = await call("HEAD");
    expect(head.status).toBe(200);
    expect(head.headers.get("x-demo")).toBe("1");
    expect(await head.text()).toBe("");
  });
  it("still 404s a route that doesn't exist", async () => {
    const res = await mod.dispatch(new Request("http://jimkit.test/api/a/demo/nope", { method: "HEAD" }), "demo", ["nope"]);
    expect(res.status).toBe(404);
  });
});

describe("addon context", () => {
  it("config and retentionMs follow a Settings save", () => {
    const ctx = mod.contextFor("demo");
    expect(ctx.config).toEqual({});
    writeFileConfig(dir, { addonConfig: { demo: { quality: 7 } } });
    reloadConfig();
    expect(ctx.config).toEqual({ quality: 7 }); // before: the object captured when the addon loaded
    const before = ctx.retentionMs;
    process.env.JIMKIT_RETENTION_HOURS = "1";
    reloadConfig();
    expect(ctx.retentionMs).toBe(3_600_000);
    expect(before).not.toBe(3_600_000);
    delete process.env.JIMKIT_RETENTION_HOURS;
  });
});
