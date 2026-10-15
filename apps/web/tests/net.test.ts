import { describe, expect, it } from "vitest";
import { clientIp, isTrustedIp, normalizeIp, parseCidrs, proxyMismatch } from "@/core/net";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
const trusted = parseCidrs("192.168.0.0/16,100.64.0.0/10,127.0.0.0/8");

describe("normalizeIp", () => {
  it("strips ports, brackets and ::ffff:", () => {
    expect(normalizeIp("1.2.3.4:5555")).toBe("1.2.3.4");
    expect(normalizeIp("[::1]")).toBe("::1");
    expect(normalizeIp("::ffff:10.0.0.1")).toBe("10.0.0.1");
    expect(normalizeIp("")).toBeNull();
  });
});

describe("isTrustedIp", () => {
  it("trusts LAN, tailnet and loopback", () => {
    expect(isTrustedIp("192.168.1.21", trusted)).toBe(true);
    expect(isTrustedIp("192.168.1.9", trusted)).toBe(true);
    expect(isTrustedIp("100.64.7.7", trusted)).toBe(true);
    expect(isTrustedIp("127.0.0.1", trusted)).toBe(true);
  });
  it("does not trust anything else", () => {
    expect(isTrustedIp("203.0.113.66", trusted)).toBe(false);
    expect(isTrustedIp("172.32.0.1", trusted)).toBe(false);
    expect(isTrustedIp("100.128.0.1", trusted)).toBe(false); // just outside 100.64/10
    expect(isTrustedIp("10.0.1.1", trusted)).toBe(false); // docker gateway is not a client
  });
  it("never trusts IPv6 or garbage", () => {
    expect(isTrustedIp("::1", trusted)).toBe(false);
    expect(isTrustedIp("fe80::1", trusted)).toBe(false);
    expect(isTrustedIp("999.1.1.1", trusted)).toBe(false);
    expect(isTrustedIp(null, trusted)).toBe(false);
  });
});

describe("clientIp", () => {
  it("with no proxy in front (hops 0) the TCP peer is the client and forwarding headers are ignored", () => {
    expect(clientIp(h({ "x-jimkit-peer": "203.0.113.66" }))).toBe("203.0.113.66");
    // a stranger sending X-Forwarded-For: 192.168.1.5 must not become a LAN client
    expect(clientIp(h({ "x-jimkit-peer": "203.0.113.66", "x-forwarded-for": "192.168.1.5", "x-real-ip": "192.168.1.5" }))).toBe("203.0.113.66");
    expect(clientIp(h({}))).toBeNull();
  });
  it("behind one proxy (hops 1) the client is the rightmost X-Forwarded-For entry", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.66" }), 1)).toBe("203.0.113.66");
    // attacker sends "X-Forwarded-For: 192.168.1.5", the proxy appends the real address
    expect(clientIp(h({ "x-forwarded-for": "192.168.1.5, 203.0.113.9" }), 1)).toBe("203.0.113.9");
  });
  it("behind two proxies (hops 2) it is the second from the right", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 172.18.0.2" }), 2)).toBe("203.0.113.9");
  });
  it("with too few entries (hops 1, none) the request didn't come through the proxy: only the TCP peer counts", () => {
    // a direct visitor claims to be a LAN address in the only two headers they control
    const direct = h({ "x-jimkit-peer": "203.0.113.66", "x-real-ip": "192.168.1.5" });
    expect(clientIp(direct, 1)).toBe("203.0.113.66");
    expect(isTrustedIp(clientIp(direct, 1), trusted)).toBe(false);
    // before: x-real-ip was believed, so this was 192.168.1.5 and trusted
    expect(clientIp(h({ "x-real-ip": "1.1.1.1" }), 1)).toBeNull();
    expect(clientIp(h({ "x-jimkit-peer": "172.18.0.2" }), 1)).toBe("172.18.0.2");
  });
  it("with too few entries for several hops (hops 2, one forged entry) it uses the peer, not the forged entry", () => {
    const direct = h({ "x-jimkit-peer": "203.0.113.66", "x-forwarded-for": "192.168.1.5" });
    expect(clientIp(direct, 2)).toBe("203.0.113.66");
    // the same entry is fine once a second proxy has appended its own
    expect(clientIp(h({ "x-jimkit-peer": "172.18.0.2", "x-forwarded-for": "192.168.1.5, 100.64.0.9" }), 2)).toBe("192.168.1.5");
  });
  it("a repeated X-Forwarded-For header counts like one comma-separated list", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), 1)).toBe("203.0.113.9");
  });
});

describe("proxyMismatch", () => {
  it("hops 0 with forwarding headers means an unannounced proxy", () => {
    expect(proxyMismatch(h({ "x-forwarded-for": "203.0.113.9" }), 0)).toBe("unexpected");
    expect(proxyMismatch(h({ "x-real-ip": "203.0.113.9" }), 0)).toBe("unexpected");
    expect(proxyMismatch(h({ "x-jimkit-peer": "192.168.1.5" }), 0)).toBeNull();
  });
  it("hops above 0 without enough entries means the proxy was bypassed or doesn't send the header", () => {
    expect(proxyMismatch(h({ "x-jimkit-peer": "192.168.1.5" }), 1)).toBe("missing");
    expect(proxyMismatch(h({ "x-forwarded-for": "203.0.113.9" }), 2)).toBe("missing");
    expect(proxyMismatch(h({ "x-forwarded-for": "203.0.113.9" }), 1)).toBeNull();
  });
});
