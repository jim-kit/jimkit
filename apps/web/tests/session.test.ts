import { describe, expect, it } from "vitest";
import { loadConfig } from "@/core/config";
import { DEFAULT_LIMITS as LIMITS } from "@/core/limits";
import { resolveSession } from "@/core/resolve";
import { hashCode, signToken } from "@/core/unlock";

const SECRET = "s".repeat(40);
const cfg = loadConfig({ NODE_ENV: "production", JIMKIT_SESSION_SECRET: SECRET, JIMKIT_UNLOCK_HASH: hashCode("correct horse") } as NodeJS.ProcessEnv);
// the server records the TCP peer in x-jimkit-peer (hops = 0, the default)
const h = (peer: string) => ({ get: (k: string) => (k.toLowerCase() === "x-jimkit-peer" ? peer : null) });
const now = 5_000_000;
const token = (exp: number) => signToken({ v: 1, iat: now, exp }, SECRET);

describe("resolveSession", () => {
  it("LAN clients are trusted without anything", () => {
    const s = resolveSession(h("192.168.1.21"), undefined, cfg, now);
    expect(s.tier).toBe("trusted");
    expect(s.limits).toEqual(LIMITS.trusted);
  });
  it("tailnet clients are trusted", () => {
    expect(resolveSession(h("100.64.7.7"), undefined, cfg, now).tier).toBe("trusted");
  });
  it("strangers are public", () => {
    expect(resolveSession(h("203.0.113.66"), undefined, cfg, now).tier).toBe("public");
  });
  it("forwarding headers are ignored when nothing sits in front", () => {
    const headers = { get: (k: string) => ({ "x-jimkit-peer": "203.0.113.66", "x-forwarded-for": "192.168.1.5", "x-real-ip": "192.168.1.5" } as Record<string, string>)[k.toLowerCase()] ?? null };
    expect(resolveSession(headers, undefined, cfg, now).tier).toBe("public");
  });
  it("behind a proxy (hops 1) the rightmost X-Forwarded-For entry decides", () => {
    const behind = loadConfig({ NODE_ENV: "production", JIMKIT_PROXY_HOPS: "1" } as NodeJS.ProcessEnv);
    const hdr = (xff: string) => ({ get: (k: string) => (k.toLowerCase() === "x-forwarded-for" ? xff : null) });
    expect(resolveSession(hdr("192.168.1.5, 203.0.113.66"), undefined, behind, now).tier).toBe("public"); // forged left entry
    expect(resolveSession(hdr("192.168.1.5"), undefined, behind, now).tier).toBe("trusted");
  });
  it("behind a proxy, a direct hit with forged X-Real-IP or a short X-Forwarded-For is not trusted", () => {
    const behind = loadConfig({ NODE_ENV: "production", JIMKIT_PROXY_HOPS: "2" } as NodeJS.ProcessEnv);
    const hdr = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
    const peer = "x-jimkit-peer";
    expect(resolveSession(hdr({ [peer]: "203.0.113.66", "x-real-ip": "192.168.1.5" }), undefined, behind, now).tier).toBe("public");
    expect(resolveSession(hdr({ [peer]: "203.0.113.66", "x-forwarded-for": "192.168.1.5" }), undefined, behind, now).tier).toBe("public");
    expect(resolveSession(hdr({ [peer]: "203.0.113.66", "x-forwarded-for": "192.168.1.5" }), undefined, behind, now).ip).toBe("203.0.113.66");
  });
  it("a valid unlock cookie upgrades a stranger", () => {
    const s = resolveSession(h("203.0.113.66"), token(now + 60_000), cfg, now);
    expect(s.tier).toBe("unlocked");
    expect(s.expiresAt).toBe(now + 60_000);
    expect(s.limits.bandwidthMbit).toBe(30); // shaping stays on
  });
  it("an expired or forged cookie does nothing", () => {
    expect(resolveSession(h("203.0.113.66"), token(now - 1), cfg, now).tier).toBe("public");
    expect(resolveSession(h("203.0.113.66"), "a.b", cfg, now).tier).toBe("public");
  });
  it("unlock is off when not configured, even with a cookie", () => {
    const off = loadConfig({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(off.unlockEnabled).toBe(false);
    expect(resolveSession(h("203.0.113.66"), token(now + 60_000), off, now).tier).toBe("public");
  });
  it("public limits are strictly tighter", () => {
    expect(LIMITS.public.maxFileBytes).toBeLessThan(LIMITS.trusted.maxFileBytes);
    expect(LIMITS.public.concurrentJobs).toBeLessThanOrEqual(LIMITS.trusted.concurrentJobs);
    expect(LIMITS.public.dailyBytes).not.toBeNull();
  });
});
