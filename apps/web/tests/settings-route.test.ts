import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

let peer = "127.0.0.1";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-jimkit-peer": peer }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
// the registry is generated at build time; stand in one addon with settings
vi.mock("@/generated/manifests.json", () => ({
  default: [
    { id: "demo", name: "Demo", version: "1.0.0", description: "", tools: [], settings: [
      { key: "quality", label: "Quality", type: "number", default: 80, min: 1, max: 100 },
      { key: "unit", label: "Unit", type: "select", default: "mb", options: ["mb", "gb"] },
    ] },
    { id: "plain", name: "Plain", version: "1.0.0", description: "", tools: [] },
  ],
}));
vi.mock("@/generated/addons.server", () => ({ serverLoaders: {} }));

let dir = "";
let POST: (req: Request) => Promise<Response>;
let contextFor: typeof import("@/core/addons").contextFor;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "jimkit-settings-"));
  process.env.JIMKIT_DATA_DIR = dir;
  ({ POST } = await import("@/app/api/settings/route"));
  ({ contextFor } = await import("@/core/addons"));
});

const post = (body: unknown) =>
  POST(new Request("http://jimkit.test/api/settings", { method: "POST", headers: { origin: "http://jimkit.test", host: "jimkit.test", "content-type": "application/json" }, body: JSON.stringify(body) }));
const stored = () => JSON.parse(readFileSync(join(dir, "jimkit.config.json"), "utf8"));

describe("POST /api/settings with addonConfig", () => {
  it("saves valid values, clamps numbers, and the addon sees them (with defaults) as ctx.config", async () => {
    expect(contextFor("demo").config).toEqual({ quality: 80, unit: "mb" });
    const res = await post({ addonConfig: { demo: { quality: 500 } } });
    expect(res.status).toBe(200);
    expect((await res.json()).addonSettings).toEqual({ demo: { quality: 100, unit: "mb" } });
    expect(stored().addonConfig).toEqual({ demo: { quality: 100 } });
    expect(contextFor("demo").config).toEqual({ quality: 100, unit: "mb" });
  });
  it("refuses unknown keys, wrong kinds, unknown addons and addons without settings, and writes nothing", async () => {
    const before = readFileSync(join(dir, "jimkit.config.json"), "utf8");
    for (const body of [{ demo: { nope: 1 } }, { demo: { quality: "high" } }, { demo: { unit: "tb" } }, { ghost: { a: 1 } }, { plain: { a: 1 } }, { demo: { quality: 5 }, plain: { a: 1 } }]) {
      expect((await post({ addonConfig: body })).status).toBe(400);
    }
    expect(readFileSync(join(dir, "jimkit.config.json"), "utf8")).toBe(before);
  });
  it("is for trusted visitors only", async () => {
    peer = "203.0.113.9";
    expect((await post({ addonConfig: { demo: { quality: 5 } } })).status).toBe(403);
    peer = "127.0.0.1";
  });
});
