import { describe, expect, it } from "vitest";
import { MAX_MATCHES, groupNames, runRegex } from "../src/lib/regex";

const run = (pattern: string, text: string, flags = "g", replacement = "") => runRegex({ pattern, flags, text, replacement });

describe("regex tester", () => {
  it("finds every match with positions and groups", () => {
    const r = run("(?<y>\\d{4})-(\\d{2})", "on 2024-05 and 1999-12");
    if (!r.ok) throw new Error(r.error);
    expect(r.matches.map((m) => [m.index, m.end, m.text])).toEqual([[3, 10, "2024-05"], [15, 22, "1999-12"]]);
    expect(r.matches[0].groups).toEqual([{ name: "y", value: "2024" }, { name: undefined, value: "05" }]);
  });

  it("stops after the first match without g", () => {
    const r = run("a", "aaa", "");
    expect(r.ok && r.matches.length).toBe(1);
  });

  it("walks past empty matches instead of looping", () => {
    const r = run("x*", "abc");
    expect(r.ok && r.matches.map((m) => m.index)).toEqual([0, 1, 2, 3]);
    // under /u an astral character is one step, not two
    const u = run("", "a😀b", "gu");
    expect(u.ok && u.matches.map((m) => m.index)).toEqual([0, 1, 3, 4]);
  });

  it("reports unmatched groups as undefined", () => {
    const r = run("(a)|(b)", "b");
    expect(r.ok && r.matches[0].groups.map((g) => g.value)).toEqual([undefined, "b"]);
  });

  it("previews the replacement", () => {
    const r = run("(\\w+)@(\\w+)", "ann@home bob@work", "g", "$2:$1");
    expect(r.ok && r.replaced).toBe("home:ann work:bob");
    const n = run("(?<n>\\d)", "a1b2", "g", "[$<n>]");
    expect(n.ok && n.replaced).toBe("a[1]b[2]");
  });

  it("returns the engine's message for a bad pattern", () => {
    const r = run("(", "x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Unterminated group/);
    expect(run("\\p{L}", "x", "").ok).toBe(true);
    expect(run("a{2,1}", "x", "u").ok).toBe(false);
  });

  it("caps the number of matches", () => {
    const r = run("a", "a".repeat(MAX_MATCHES + 50));
    expect(r.ok && r.matches.length).toBe(MAX_MATCHES);
    expect(r.ok && r.truncated).toBe(true);
  });

  it("names groups in order, skipping non-capturing ones and classes", () => {
    expect(groupNames("(a)(?:b)(?<x>c)(?=d)(?<!e)(?<y>f)[(]\\((g)")).toEqual([undefined, "x", "y", undefined]);
  });
});
