import { describe, expect, it } from "vitest";
import { loadConfig } from "@/core/config";
import { readJson } from "@/core/http";
import { hostAllowed, hostName, limiterKey, parseCidr, parseCidrs, isTrustedIp } from "@/core/net";
import { resolveSession } from "@/core/resolve";

const env = (extra: Record<string, string> = {}) => ({ NODE_ENV: "production", ...extra }) as NodeJS.ProcessEnv;
const headers = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe("a CIDR needs a real prefix", () => {
  it("rejects an empty or non-numeric prefix instead of reading it as /0 (everyone)", () => {
    for (const bad of ["10.0.0.0/", "10.0.0.0/ 24", "10.0.0.0/x", "10.0.0.0/-1", "10.0.0.0/33", "10.0.0.0/8/8", "10.0.0.0/024"]) expect(parseCidr(bad), bad).toBeNull();
  });
  it("still reads the good ones", () => {
    expect(parseCidr("10.0.0.0/8")).not.toBeNull();
    expect(parseCidr("192.168.1.5")).toMatchObject({ mask: 0xffffffff }); // a single address
    expect(parseCidr("0.0.0.0/0")).toMatchObject({ mask: 0 }); // /0 is allowed when it is written out
  });
  it("a stray space in the list no longer trusts the world", () => {
    const cidrs = parseCidrs("192.168.1.0/ 24");
    expect(isTrustedIp("203.0.113.9", cidrs)).toBe(false);
    expect(isTrustedIp("8.8.8.8", cidrs)).toBe(false);
  });
});

describe("the Host header", () => {
  const direct = { allowed: [] as string[], proxyHops: 0 };
  it("reads the name out of a Host header", () => {
    expect(hostName("Jimkit.LAN:3000")).toBe("jimkit.lan");
    expect(hostName("[::1]:3000")).toBe("::1");
    expect(hostName("example.org.")).toBe("example.org");
    expect(hostName(null)).toBe("");
  });
  it("accepts addresses, localhost and private-looking names when reached directly", () => {
    for (const h of ["192.168.1.10:3000", "10.0.0.2", "localhost:3000", "[::1]:3000", "nas", "nas:3000", "jimkit.lan", "box.home.arpa", "x.internal", "host.tail1234.ts.net", "pi.local"]) expect(hostAllowed(h, direct), h).toBe(true);
  });
  it("refuses a public name that someone pointed at this machine (DNS rebinding)", () => {
    for (const h of ["evil.example", "evil.example:3000", "a.b.evil.org", "jimkit.com"]) expect(hostAllowed(h, direct), h).toBe(false);
  });
  it("behind a proxy any name is accepted unless the owner listed names", () => {
    expect(hostAllowed("jimkit.example.org", { allowed: [], proxyHops: 1 })).toBe(true);
    expect(hostAllowed("evil.example", { allowed: ["jimkit.example.org"], proxyHops: 1 })).toBe(false);
  });
  it("an allow-list wins, with wildcards, and addresses are always fine", () => {
    const o = { allowed: ["jimkit.example.org", "*.lab.example.org"], proxyHops: 0 };
    expect(hostAllowed("jimkit.example.org:443", o)).toBe(true);
    expect(hostAllowed("a.lab.example.org", o)).toBe(true);
    expect(hostAllowed("lab.example.org", o)).toBe(false);
    expect(hostAllowed("evil.example", o)).toBe(false);
    expect(hostAllowed("nas.lan", o)).toBe(false); // a list means a list
    expect(hostAllowed("192.168.1.10:3000", o)).toBe(true);
  });
  it("is read from JIMKIT_ALLOWED_HOSTS", () => {
    expect(loadConfig(env({ JIMKIT_ALLOWED_HOSTS: "Jimkit.Example.org, *.lab.example.org " })).allowedHosts).toEqual(["jimkit.example.org", "*.lab.example.org"]);
    expect(loadConfig(env()).allowedHosts).toEqual([]);
  });
  it("a request that carries a name we don't answer to is never trusted, whatever the peer address says", () => {
    const cfg = loadConfig(env());
    const peer = { "x-jimkit-peer": "192.168.1.21" };
    expect(resolveSession(headers({ ...peer, host: "192.168.1.10:3000" }), undefined, cfg).tier).toBe("trusted");
    expect(resolveSession(headers({ ...peer, host: "jimkit.lan:3000" }), undefined, cfg).tier).toBe("trusted");
    const rebound = resolveSession(headers({ ...peer, host: "evil.example:3000" }), undefined, cfg);
    expect(rebound.tier).toBe("public");
    expect(rebound.hostRefused).toBe(true);
  });
  it("behind a proxy the forwarded host is the one that counts", () => {
    const cfg = loadConfig(env({ JIMKIT_PROXY_HOPS: "1", JIMKIT_ALLOWED_HOSTS: "jimkit.example.org" }));
    const h = (host: string) => headers({ "x-forwarded-for": "192.168.1.21", "x-forwarded-host": host, host: "jimkit:3000" });
    expect(resolveSession(h("jimkit.example.org"), undefined, cfg).tier).toBe("trusted");
    expect(resolveSession(h("evil.example"), undefined, cfg).tier).toBe("public");
  });
});

describe("rate-limit keys", () => {
  it("count an IPv6 visitor by its /64, so a whole prefix is one visitor", () => {
    expect(limiterKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(limiterKey("2001:db8:1:2:1::9"));
    expect(limiterKey("2001:db8:1:2:aaaa::1")).not.toBe(limiterKey("2001:db8:1:3:aaaa::1"));
    expect(limiterKey("2001:DB8:1:2::1")).toBe(limiterKey("2001:db8:1:2::2"));
  });
  it("leave IPv4 and unknown addresses alone", () => {
    expect(limiterKey("203.0.113.7")).toBe("203.0.113.7");
    expect(limiterKey(null)).toBe("unknown");
  });
});

describe("readJson", () => {
  const post = (body: string, headersInit: Record<string, string> = {}) => new Request("http://x/", { method: "POST", body, headers: headersInit });
  it("reads a small JSON body", async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 });
  });
  it("gives null for a body that is not JSON, or is empty", async () => {
    expect(await readJson(post("nope"))).toBeNull();
    expect(await readJson(new Request("http://x/", { method: "POST" }))).toBeNull();
  });
  it("refuses a body over the limit, whether it says so or not", async () => {
    const big = JSON.stringify({ code: "x".repeat(5000) });
    expect(await readJson(post(big), 1024)).toBeNull();
    // a request that lies about its length (or has none) is cut off while it is read
    const stream = new ReadableStream({ start(c) { for (let i = 0; i < 100; i++) c.enqueue(new TextEncoder().encode("x".repeat(100))); c.close(); } });
    expect(await readJson(new Request("http://x/", { method: "POST", body: stream, duplex: "half" } as RequestInit), 1024)).toBeNull();
  });
});
