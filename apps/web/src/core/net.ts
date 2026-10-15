// Client-IP handling. The trust decision for the "trusted" tier rests on this file.

export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  if (ip.toLowerCase().startsWith("::ffff:")) ip = ip.slice(7);
  return ip || null;
}

export function parseIPv4(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export interface Cidr {
  base: number;
  mask: number;
}

export function parseCidr(text: string): Cidr | null {
  const parts = text.trim().split("/");
  if (parts.length > 2) return null;
  const [addr, bitsRaw] = parts;
  const base = parseIPv4(addr);
  if (base === null) return null;
  // the prefix is one or two digits or nothing at all: "10.0.0.0/" would otherwise read as /0, which is everyone
  if (bitsRaw !== undefined && !/^\d{1,2}$/.test(bitsRaw)) return null;
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (base & mask) >>> 0, mask };
}

export function parseCidrs(list: string | string[]): Cidr[] {
  const items = Array.isArray(list) ? list : list.split(/[\s,]+/);
  return items.filter(Boolean).map(parseCidr).filter((c): c is Cidr => c !== null);
}

export function isTrustedIp(ip: string | null, cidrs: Cidr[]): boolean {
  const n = normalizeIp(ip);
  if (!n) return false;
  const v = parseIPv4(n);
  if (v === null) return false; // IPv6 and anything unparseable is never trusted
  return cidrs.some((c) => ((v & c.mask) >>> 0) === c.base);
}

interface HeaderReader {
  get(name: string): string | null;
}

/**
 * The client address.
 *  - hops = 0 (default): nothing sits in front of Jimkit; the TCP peer is the client. The custom server records the peer in
 *    x-jimkit-peer after deleting any copy a client sent. Headers like X-Forwarded-For are ignored entirely.
 *  - hops = N: N reverse proxies sit in front. Each appends the address it saw to X-Forwarded-For, so the client is the
 *    Nth entry from the RIGHT; anything to its left was written by the client and is not believed.
 *    With fewer than N entries the request did not come through all of them (someone reached the port directly), so no
 *    header can be believed: not X-Forwarded-For, not X-Real-IP. The TCP peer is used instead. For a direct visitor that is
 *    their own address, so a stranger stays public and a LAN visitor stays trusted.
 *
 * One thing this cannot catch: a direct visitor who sends N forged entries. Only keeping the port unreachable except from the
 * proxy (JIMKIT_BIND, a firewall) closes that; docs/security.md.
 */
export function clientIp(headers: HeaderReader, hops = 0): string | null {
  if (hops > 0) {
    const parts = forwardedFor(headers);
    if (parts.length >= hops) return normalizeIp(parts[parts.length - hops]);
  }
  return normalizeIp(headers.get("x-jimkit-peer"));
}

function forwardedFor(headers: HeaderReader): string[] {
  return (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * A hint that JIMKIT_PROXY_HOPS doesn't match what is really in front of Jimkit, for `jimkit doctor`:
 *  - "unexpected": hops is 0 but forwarding headers arrive, so a proxy is there and every visitor looks like the proxy;
 *  - "missing": hops is above 0 but a request came without enough X-Forwarded-For entries (a direct connection, or a proxy
 *    that doesn't send the header).
 */
export function proxyMismatch(headers: HeaderReader, hops: number): "unexpected" | "missing" | null {
  if (hops === 0) {
    return ["x-forwarded-for", "x-real-ip", "forwarded"].some((n) => headers.get(n)) ? "unexpected" : null;
  }
  return forwardedFor(headers).length < hops ? "missing" : null;
}

/** The host name in a Host header: no port, no brackets, lower case, no trailing dot. */
export function hostName(header: string | null | undefined): string {
  let h = (header ?? "").trim().toLowerCase();
  if (h.startsWith("[")) h = h.slice(1, h.indexOf("]") === -1 ? undefined : h.indexOf("]"));
  else if (h.includes(":") && h.indexOf(":") === h.lastIndexOf(":")) h = h.slice(0, h.indexOf(":"));
  return h.replace(/\.$/, "");
}

// names only a private network resolves: no outsider can point one of these at your machine
const PRIVATE_SUFFIXES = [".local", ".lan", ".home", ".home.arpa", ".internal", ".localdomain", ".intranet", ".corp", ".ts.net"];

/**
 * Whether the Host header is a name this instance should answer to as itself. A page on some other site can make a browser on your
 * network send requests to your Jimkit by pointing its own name at your private address (DNS rebinding); the requests then carry
 * that other name in Host. The peer is on your network, so without this check they would count as "trusted".
 *  - An IP address or localhost is always fine: nobody else can make a browser put those in Host for a page of theirs.
 *  - With an allow-list (JIMKIT_ALLOWED_HOSTS) a name must be on it. `*.example.org` matches any name under example.org.
 *  - Without one, behind a reverse proxy (hops > 0) the proxy chooses what reaches us, so any name is accepted; when the port is
 *    reached directly, a name has to be a one-word name or end like a private one (.local, .lan, .home.arpa, .internal, .ts.net).
 */
export function hostAllowed(header: string | null | undefined, opts: { allowed: string[]; proxyHops: number }): boolean {
  const name = hostName(header);
  if (!name) return true; // HTTP/1.0 clients and tests send none; the peer address still decides
  if (name === "localhost" || name.endsWith(".localhost") || parseIPv4(name) !== null || name.includes(":")) return true;
  if (opts.allowed.length) return opts.allowed.some((a) => (a.startsWith("*.") ? name.endsWith(a.slice(1)) && name.length > a.length - 1 : name === a));
  if (opts.proxyHops > 0) return true;
  return !name.includes(".") || PRIVATE_SUFFIXES.some((x) => name.endsWith(x));
}

/** The key a limiter counts an address under. An IPv6 visitor owns a whole /64 (often more), so the address alone is no limit at all. */
export function limiterKey(ip: string | null): string {
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  const groups = ip.toLowerCase().split("::")[0].split(":").filter(Boolean);
  return `${groups.slice(0, 4).join(":")}::/64`;
}
