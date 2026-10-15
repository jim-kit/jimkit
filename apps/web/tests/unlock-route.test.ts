import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { hashCode, verifyCode } from "@/core/unlock";

// the route reads the caller's address and cookies through next/headers
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-jimkit-peer": "203.0.113.5" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

vi.mock("@/core/unlock", async (original) => {
  const real = await original<typeof import("@/core/unlock")>();
  return { ...real, verifyCode: vi.fn(real.verifyCode) };
});

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.JIMKIT_DATA_DIR = mkdtempSync(join(tmpdir(), "jimkit-unlock-"));
  process.env.JIMKIT_UNLOCK_HASH = hashCode("the right code");
  ({ POST } = await import("@/app/api/unlock/route"));
});

const guess = (code: string) =>
  POST(new Request("http://jimkit.test/api/unlock", {
    method: "POST",
    headers: { origin: "http://jimkit.test", "x-forwarded-host": "jimkit.test", "content-type": "application/json" },
    body: JSON.stringify({ code }),
  }));

describe("POST /api/unlock", () => {
  it("a burst of parallel guesses is cut off after the allowed number of misses", async () => {
    const res = await Promise.all(Array.from({ length: 12 }, (_, i) => guess(`wrong ${i}`)));
    expect(res.every((r) => r.status === 429)).toBe(true);
    // 5 misses lock the address. Before the limiter was checked after the body was read, every request in the burst got checked.
    expect(vi.mocked(verifyCode)).toHaveBeenCalledTimes(5);
    // and the right code is refused while locked out
    expect((await guess("the right code")).status).toBe(429);
    expect(vi.mocked(verifyCode)).toHaveBeenCalledTimes(5);
  });
});
