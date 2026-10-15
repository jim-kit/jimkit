import { describe, expect, it } from "vitest";
import { bitOps, bitsOf, flipBit, formatSize, group, parseInteger, parseSize, signed, toBase, wrap } from "../src/lib/numbers";

const int = (s: string, base?: number) => { const r = parseInteger(s, base); if (!r.ok) throw new Error(r.error); return r.value; };
const size = (s: string) => { const r = parseSize(s); if (!r.ok) throw new Error(r.error); return r.value; };

describe("base conversion", () => {
  it("converts between 2 and 36", () => {
    expect(int("ff", 16)).toBe(255n);
    expect(int("zz", 36)).toBe(1295n);
    expect(toBase(1295n, 36)).toBe("zz");
    expect(toBase(255n, 2)).toBe("11111111");
    expect(toBase(255n, 8)).toBe("377");
    expect(int("-1010", 2)).toBe(-10n);
    expect(toBase(-255n, 16)).toBe("-ff");
  });
  it("is exact past 2^53 and 2^64", () => {
    expect(int("18446744073709551616")).toBe(2n ** 64n);
    expect(toBase(2n ** 64n, 16)).toBe("10000000000000000");
    expect(int("ffffffffffffffffffffffffffffffff", 16)).toBe(2n ** 128n - 1n);
    expect(String(Number("9007199254740993"))).toBe("9007199254740992"); // what plain numbers would do
    expect(toBase(int("9007199254740993"), 10)).toBe("9007199254740993");
  });
  it("takes prefixes and separators", () => {
    expect(int("0xFF")).toBe(255n);
    expect(int("0b1010", 16)).toBe(10n);
    expect(int("0o17")).toBe(15n);
    expect(int("1_000 000,000")).toBe(1_000_000_000n);
    expect(int("+7")).toBe(7n);
  });
  it("names the bad digit", () => {
    expect(parseInteger("12", 2)).toEqual({ ok: false, error: '"2" is not a base 2 digit' });
    expect(parseInteger("g", 16)).toMatchObject({ ok: false });
    expect(parseInteger("", 10)).toMatchObject({ ok: false });
    expect(parseInteger("0x", 10)).toMatchObject({ ok: false });
  });
  it("groups digits", () => {
    expect(group("1234567", 3, ",")).toBe("1,234,567");
    expect(group("-1234", 3, ",")).toBe("-1,234");
    expect(group("11111111", 4)).toBe("1111 1111");
  });
});

describe("byte sizes", () => {
  it("reads SI and IEC units", () => {
    expect(size("512")).toBe(512n);
    expect(size("1 KiB")).toBe(1024n);
    expect(size("1kB")).toBe(1000n);
    expect(size("1.5 GB")).toBe(1_500_000_000n);
    expect(size("1.5 GiB")).toBe(1_610_612_736n);
    expect(size("2 tib")).toBe(2n * 1024n ** 4n);
    expect(size("3m")).toBe(3_000_000n);
    expect(size("1,024 B")).toBe(1024n);
    expect(size("0.0004 kB")).toBe(0n); // 0.4 bytes rounds down
    expect(size("0.0005 kB")).toBe(1n);
    expect(size("1 YiB")).toBe(1024n ** 8n);
  });
  it("rejects what it can't read", () => {
    expect(parseSize("abc")).toMatchObject({ ok: false });
    expect(parseSize("5 parsecs")).toMatchObject({ ok: false });
    expect(parseSize("-5 MB")).toMatchObject({ ok: false });
  });
  it("formats with the right unit", () => {
    expect(formatSize(999n, "si")).toBe("999 B");
    expect(formatSize(1000n, "si")).toBe("1 kB");
    expect(formatSize(1023n, "iec")).toBe("1023 B");
    expect(formatSize(1536n, "iec")).toBe("1.5 KiB");
    expect(formatSize(1_610_612_736n, "iec")).toBe("1.5 GiB");
    expect(formatSize(1_610_612_736n, "si")).toBe("1.61 GB");
    expect(formatSize(1024n ** 8n * 3n, "iec")).toBe("3 YiB");
    expect(formatSize(1024n ** 9n, "iec")).toBe("1024 YiB");
    expect(formatSize(1_999_999n, "si", 2)).toBe("2 MB");
  });
});

describe("fixed-width bits", () => {
  it("wraps and reads two's complement", () => {
    expect(wrap(-1n, 8)).toBe(255n);
    expect(wrap(256n, 8)).toBe(0n);
    expect(signed(255n, 8)).toBe(-1n);
    expect(signed(128n, 8)).toBe(-128n);
    expect(signed(2n ** 63n, 64)).toBe(-(2n ** 63n));
    expect(wrap(-1n, 64)).toBe(2n ** 64n - 1n);
  });
  it("lists bits from the top and flips them", () => {
    expect(bitsOf(0b10100001n, 8)).toEqual([1, 0, 1, 0, 0, 0, 0, 1]);
    expect(flipBit(0n, 8, 7)).toBe(128n);
    expect(flipBit(255n, 8, 0)).toBe(254n);
    expect(bitsOf(1n, 64)).toHaveLength(64);
  });
  it("applies the operators", () => {
    const o = bitOps(0b1100n, 0b1010n, 8, 2);
    expect(o).toMatchObject({ and: 0b1000n, or: 0b1110n, xor: 0b0110n, not: 0b11110011n, shl: 0b110000n, shr: 0b11n, popcount: 2 });
    expect(bitOps(0x80n, 0n, 8, 1)).toMatchObject({ shl: 0n, shr: 0x40n, sar: 0xc0n });
    expect(bitOps(1n, 0n, 8, 99).shl).toBe(0n); // shifts stop at the width
  });
});
