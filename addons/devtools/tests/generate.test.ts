import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS, SETS, encodeBytes, passwordBits, passwordPools, password, randomBytes, randomString, ulidBatch, ulidFrom, ulidTime,
  uniformInt, uuid4, uuid7Batch, uuid7Layout, uuid7Time, type Fill,
} from "../src/lib/generate";

/** a fill that hands out the given bytes, then repeats the last one */
const feed = (...bytes: number[]): Fill => { let i = 0; return (buf) => { for (let k = 0; k < buf.length; k++) buf[k] = bytes[Math.min(i++, bytes.length - 1)]; return buf; }; };

describe("uuid", () => {
  it("v4 has the version and variant bits set", () => {
    const id = uuid4(feed(0xff));
    expect(id).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    for (let i = 0; i < 50; i++) expect(uuid4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("v7 follows the RFC 9562 example layout", () => {
    // RFC 9562 appendix A.6: 017F22E2-79B0-7CC3-98C4-DC0C0C07398F
    const rest = Uint8Array.from([0x18, 0xc4, 0xdc, 0x0c, 0x0c, 0x07, 0x39, 0x8f]);
    expect(uuid7Layout(0x017f22e279b0, 0xcc3, rest)).toBe("017f22e2-79b0-7cc3-98c4-dc0c0c07398f");
  });

  it("v7 batches sort in creation order and carry the time", () => {
    const now = 1_700_000_000_123;
    const ids = uuid7Batch(300, now);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(300);
    expect(uuid7Time(ids[0])?.getTime()).toBe(now);
    expect(uuid7Time(uuid4())).toBeNull();
  });

  it("v7 rolls into the next millisecond when the counter runs out", () => {
    const ids = uuid7Batch(5000, 1_700_000_000_000, feed(0)); // counter starts at 0
    expect(uuid7Time(ids[4095])?.getTime()).toBe(1_700_000_000_000);
    expect(uuid7Time(ids[4096])?.getTime()).toBe(1_700_000_000_001);
    expect(ids).toEqual([...ids].sort());
  });
});

describe("ulid", () => {
  it("encodes the timestamp the way the spec's example does", () => {
    expect(ulidFrom(1469918176385, new Uint8Array(10)).slice(0, 10)).toBe("01ARYZ6S41");
    expect(ulidFrom(0, new Uint8Array(10))).toBe("0".repeat(26));
    expect(ulidFrom(0xffffffffffff, new Uint8Array(10).fill(255))).toBe("7ZZZZZZZZZZZZZZZZZZZZZZZZZ");
  });

  it("is 26 Crockford characters, sorted and monotonic within a batch", () => {
    const ids = ulidBatch(200, 1_700_000_000_000);
    for (const id of ids) expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(ids).toEqual([...ids].sort());
    expect(ulidTime(ids[0])?.getTime()).toBe(1_700_000_000_000);
    expect(ulidTime("not a ulid")).toBeNull();
    expect(ulidTime("8" + "0".repeat(25))).toBeNull(); // past the 48-bit range
  });
});

describe("uniform picking", () => {
  it("throws away draws from the uneven tail", () => {
    // 2^32 mod 3 = 1, so only 0xFFFFFFFF is rejected. The first draw is ff ff ff ff, the second is 1 (little-endian).
    expect(uniformInt(3, feed(255, 255, 255, 255, 1, 0, 0, 0))).toBe(1);
    expect(uniformInt(3, feed(254, 255, 255, 255))).toBe(2); // 0xFFFFFFFE is below the limit: 4294967294 mod 3 = 2
  });

  it("spreads evenly over a non-power-of-two range", () => {
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 60000; i++) counts[uniformInt(6)]++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(500);
  });

  it("random strings only use the alphabet, once each character", () => {
    const s = randomString("aabbcc", 500);
    expect(s).toMatch(/^[abc]{500}$/);
    expect(() => randomString("aaa", 5)).toThrow();
  });
});

describe("passwords", () => {
  const all = { length: 24, sets: ["lower", "upper", "digits", "symbols"] as const, noAmbiguous: false };
  it("has the length and one character from each chosen set", () => {
    for (let i = 0; i < 100; i++) {
      const p = password({ ...all, sets: [...all.sets], length: 6 });
      expect(p).toHaveLength(6);
      for (const id of all.sets) expect([...p].some((c) => SETS[id].includes(c))).toBe(true);
    }
  });

  it("leaves out ambiguous characters when asked", () => {
    const o = { length: 64, sets: [...all.sets], noAmbiguous: true };
    for (let i = 0; i < 50; i++) for (const c of password(o)) expect(AMBIGUOUS).not.toContain(c);
    expect(passwordPools(o).join("")).not.toMatch(/[Il1|O0o]/);
  });

  it("refuses impossible requests and reports entropy", () => {
    expect(() => password({ length: 8, sets: [], noAmbiguous: false })).toThrow();
    expect(() => password({ length: 2, sets: ["lower", "upper", "digits"], noAmbiguous: false })).toThrow();
    expect(passwordBits({ length: 10, sets: ["digits"], noAmbiguous: false })).toBeCloseTo(10 * Math.log2(10));
  });
});

describe("bytes", () => {
  it("encodes", () => {
    const b = Uint8Array.from([0xfb, 0xff, 0x00, 0x10]);
    expect(encodeBytes(b, "hex")).toBe("fbff0010");
    expect(encodeBytes(b, "base64")).toBe("+/8AEA==");
    expect(encodeBytes(b, "base64url")).toBe("-_8AEA");
  });
  it("fills more than one getRandomValues call's worth", () => {
    expect(randomBytes(70000)).toHaveLength(70000);
  });
});
