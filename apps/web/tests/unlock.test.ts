import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { hashCode, signToken, verifyCode, verifyToken } from "@/core/unlock";

const SECRET = "x".repeat(40);

describe("code hashing", () => {
  it("accepts the right code and rejects others", () => {
    const stored = hashCode("correct horse");
    expect(verifyCode("correct horse", stored)).toBe(true);
    expect(verifyCode("correct horsf", stored)).toBe(false);
    expect(verifyCode("", stored)).toBe(false);
  });
  it("fails closed without a stored hash or with a malformed one", () => {
    expect(verifyCode("correct horse", undefined)).toBe(false);
    expect(verifyCode("correct horse", "nonsense")).toBe(false);
    expect(verifyCode("correct horse", "md5$a$b")).toBe(false);
    expect(verifyCode("correct horse", "scrypt$c2FsdA$=")).toBe(false);
  });
  it("uses a fresh salt every time", () => {
    expect(hashCode("a")).not.toBe(hashCode("a"));
  });
  it("matches what scripts/hash-code.mjs produces", () => {
    const out = execFileSync("node", ["scripts/hash-code.mjs", "correct horse"], { encoding: "utf8" }).trim();
    const hash = out.replace("JIMKIT_UNLOCK_HASH=", "").replace(/^'|'$/g, "");
    expect(verifyCode("correct horse", hash)).toBe(true);
    expect(verifyCode("nope", hash)).toBe(false);
  });
});

describe("tokens", () => {
  const now = 1_000_000;
  const good = signToken({ v: 1, iat: now, exp: now + 60_000 }, SECRET);
  it("verifies a fresh token", () => {
    expect(verifyToken(good, SECRET, now + 1)?.exp).toBe(now + 60_000);
  });
  it("rejects an expired token", () => {
    expect(verifyToken(good, SECRET, now + 60_000)).toBeNull();
  });
  it("rejects a token signed with another secret", () => {
    expect(verifyToken(good, "y".repeat(40), now + 1)).toBeNull();
  });
  it("rejects tampering with the payload", () => {
    const [, sig] = good.split(".");
    const forged = Buffer.from(JSON.stringify({ v: 1, iat: now, exp: now + 99_999_999 })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`, SECRET, now + 1)).toBeNull();
  });
  it("rejects junk", () => {
    expect(verifyToken(undefined, SECRET)).toBeNull();
    expect(verifyToken("abc", SECRET)).toBeNull();
    expect(verifyToken("a.b", SECRET)).toBeNull();
  });
});
