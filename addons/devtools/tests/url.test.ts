import { describe, expect, it } from "vitest";
import { buildQuery, buildUrl, parseQuery, parseUrl } from "../src/lib/url";

describe("url parts", () => {
  it("splits a URL", () => {
    const r = parseUrl("https://user:pw@example.com:8443/a/b%20c?x=1&y=two%20words&x=3#frag");
    if (!r.ok) throw new Error(r.error);
    expect(r.parts).toMatchObject({ protocol: "https:", username: "user", password: "pw", hostname: "example.com", port: "8443", pathname: "/a/b%20c", hash: "#frag", origin: "https://example.com:8443" });
    expect(r.rows).toEqual([["x", "1"], ["y", "two words"], ["x", "3"]]);
  });
  it("adds https to a bare host and rejects nonsense", () => {
    expect(parseUrl("example.com/path")).toMatchObject({ ok: true, parts: { hostname: "example.com", protocol: "https:" } });
    expect(parseUrl("")).toMatchObject({ ok: false });
    expect(parseUrl("http://")).toMatchObject({ ok: false });
    expect(parseUrl("ftp://[::1")).toMatchObject({ ok: false });
  });
  it("puts a URL back together", () => {
    const r = parseUrl("https://user:pw@example.com:8443/a?x=1#f");
    if (!r.ok) throw new Error();
    expect(buildUrl(r.parts, r.rows)).toBe("https://user:pw@example.com:8443/a?x=1#f");
    expect(buildUrl({ ...r.parts, port: "", hash: "" }, [["q", "a b&c"], ["flag", ""]])).toBe("https://user:pw@example.com/a?q=a%20b%26c&flag");
  });
});

describe("query strings", () => {
  it("decodes + and %XX, keeps order and duplicates, tolerates bad escapes", () => {
    expect(parseQuery("?a=1&a=2&b=x+y&c&d=%E2%9C%93&e=100%")).toEqual([["a", "1"], ["a", "2"], ["b", "x y"], ["c", ""], ["d", "✓"], ["e", "100%"]]);
    expect(parseQuery("")).toEqual([]);
    expect(parseQuery("?&&a=1&")).toEqual([["a", "1"]]);
  });
  it("encodes with %20 and escapes the characters URLSearchParams would leave", () => {
    expect(buildQuery([["a b", "c=d"], ["é", "(x)"], ["", ""]])).toBe("?a%20b=c%3Dd&%C3%A9=%28x%29");
    expect(buildQuery([])).toBe("");
  });
  it("round-trips", () => {
    const rows = [["k", "v w"], ["k", "ü&"], ["empty", ""]] as [string, string][];
    expect(parseQuery(buildQuery(rows))).toEqual(rows);
  });
});
