import { describe, expect, it } from "vitest";
import { AttemptLimiter } from "@/core/ratelimit";

describe("AttemptLimiter", () => {
  const make = () => {
    let t = 0;
    const l = new AttemptLimiter({ maxFailures: 5, windowMs: 15 * 60_000, lockoutMs: 60 * 60_000, now: () => t });
    return { l, advance: (ms: number) => (t += ms) };
  };

  it("locks after five failures and reports retry time", () => {
    const { l } = make();
    for (let i = 0; i < 4; i++) expect(l.fail("a").allowed).toBe(true);
    const last = l.fail("a");
    expect(last.allowed).toBe(false);
    expect(last.retryAfterMs).toBe(60 * 60_000);
  });
  it("keeps clients separate", () => {
    const { l } = make();
    for (let i = 0; i < 5; i++) l.fail("a");
    expect(l.check("b").allowed).toBe(true);
  });
  it("releases after the lockout", () => {
    const { l, advance } = make();
    for (let i = 0; i < 5; i++) l.fail("a");
    advance(60 * 60_000 + 1);
    expect(l.check("a").allowed).toBe(true);
  });
  it("forgets old failures", () => {
    const { l, advance } = make();
    for (let i = 0; i < 4; i++) l.fail("a");
    advance(16 * 60_000);
    expect(l.check("a").attemptsLeft).toBe(5);
  });
  it("a success clears the counter", () => {
    const { l } = make();
    for (let i = 0; i < 4; i++) l.fail("a");
    l.success("a");
    expect(l.check("a").attemptsLeft).toBe(5);
  });
});
