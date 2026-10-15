import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import {
  dataCodewords, eccFor, encodeData, encodeQr, formatBits, interleave, pickMode, rawModules, toPixels, toSvg, versionBits, wifiPayload, type Ecc,
} from "../src/lib/qr";

/** what a phone does: render the code as an image and read it back */
function scan(text: string, ecc: Ecc = "M", minVersion = 1, quiet = 4) {
  const qr = encodeQr(text, { ecc, minVersion });
  const { data, width } = toPixels(qr, 4, quiet);
  const out = jsQR(data, width, width);
  return { qr, decoded: out?.data };
}

describe("tables", () => {
  it("holds the capacities of the standard", () => {
    // data codewords: ISO 18004 table 7
    expect([1, 2, 5, 10, 40].map((v) => dataCodewords(v, "L"))).toEqual([19, 34, 108, 274, 2956]);
    expect([1, 2, 5, 10, 40].map((v) => dataCodewords(v, "M"))).toEqual([16, 28, 86, 216, 2334]);
    expect([1, 2, 5, 10, 40].map((v) => dataCodewords(v, "Q"))).toEqual([13, 22, 62, 154, 1666]);
    expect([1, 2, 5, 10, 40].map((v) => dataCodewords(v, "H"))).toEqual([9, 16, 46, 122, 1276]);
    expect(rawModules(1)).toBe(208);
    expect(rawModules(40)).toBe(29648);
  });

  it("fits the published maximum lengths", () => {
    const fits = (text: string, v: number, e: Ecc) => encodeData(text, v, e) !== null;
    expect(fits("1".repeat(41), 1, "L")).toBe(true);
    expect(fits("1".repeat(42), 1, "L")).toBe(false);
    expect(fits("A".repeat(25), 1, "L")).toBe(true);
    expect(fits("A".repeat(26), 1, "L")).toBe(false);
    expect(fits("a".repeat(17), 1, "L")).toBe(true);
    expect(fits("a".repeat(18), 1, "L")).toBe(false);
    expect(fits("a".repeat(2953), 40, "L")).toBe(true);
    expect(fits("a".repeat(2954), 40, "L")).toBe(false);
    expect(fits("1".repeat(7089), 40, "L")).toBe(true);
    expect(fits("a".repeat(1273), 40, "H")).toBe(true);
    expect(fits("a".repeat(1274), 40, "H")).toBe(false);
    expect(fits("a".repeat(213), 10, "M")).toBe(true);
    expect(fits("a".repeat(214), 10, "M")).toBe(false);
  });

  it("picks the densest mode", () => {
    expect(pickMode("0123456789")).toBe("numeric");
    expect(pickMode("HELLO WORLD $%*+-./:")).toBe("alphanumeric");
    expect(pickMode("hello")).toBe("byte");
    expect(pickMode("")).toBe("numeric");
  });
});

describe("known vectors", () => {
  it("HELLO WORLD at 1-Q gives the codewords from the standard's worked example", () => {
    const data = encodeData("HELLO WORLD", 1, "Q")!;
    expect(Array.from(data)).toEqual([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236]);
    expect(Array.from(eccFor(data, 13))).toEqual([168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16]);
    expect(interleave(data, 1, "Q")).toHaveLength(26);
  });

  it("format and version information bits", () => {
    expect(formatBits("L", 0).toString(2).padStart(15, "0")).toBe("111011111000100");
    expect(formatBits("M", 0).toString(2).padStart(15, "0")).toBe("101010000010010");
    expect(versionBits(7).toString(2).padStart(18, "0")).toBe("000111110010010100");
    expect(versionBits(40).toString(2).padStart(18, "0")).toBe("101000110001101001");
  });

  it("has the fixed patterns where they belong", () => {
    const { modules, size } = encodeQr("hi");
    expect(size).toBe(21);
    // top-left finder, timing row, dark module
    expect(modules[0].slice(0, 7)).toEqual(Array(7).fill(true));
    expect(modules[3].slice(0, 7)).toEqual([true, false, true, true, true, false, true]);
    expect([8, 10, 12].map((x) => modules[6][x])).toEqual([true, true, true]);
    expect([9, 11].map((x) => modules[6][x])).toEqual([false, false]);
    expect(modules[size - 8][8]).toBe(true);
  });
});

describe("scans back", () => {
  it("every error-correction level", () => {
    for (const ecc of ["L", "M", "Q", "H"] as Ecc[]) expect(scan("https://example.com/a?b=c", ecc).decoded).toBe("https://example.com/a?b=c");
  });

  it("numeric, alphanumeric and byte modes, and UTF-8", () => {
    expect(scan("0123456789012345").decoded).toBe("0123456789012345");
    expect(scan("HELLO WORLD").decoded).toBe("HELLO WORLD");
    expect(scan("Hello, World").decoded).toBe("Hello, World");
    expect(scan("héllo wörld 日本語 ✓").decoded).toBe("héllo wörld 日本語 ✓");
  });

  it("Wi-Fi payloads", () => {
    const text = wifiPayload({ ssid: "My;Net", password: "pa:ss,w\\rd", security: "WPA", hidden: false });
    expect(text).toBe(String.raw`WIFI:T:WPA;S:My\;Net;P:pa\:ss\,w\\rd;;`);
    expect(scan(text).decoded).toBe(text);
    expect(wifiPayload({ ssid: "Open", password: "x", security: "nopass", hidden: true })).toBe("WIFI:T:nopass;S:Open;H:true;;");
  });

  it("each of the 40 versions, at a level that varies with the version", () => {
    const levels: Ecc[] = ["L", "M", "Q", "H"];
    for (let v = 1; v <= 40; v++) {
      const text = `v${v}:` + "x".repeat(3 + v);
      const { qr, decoded } = scan(text, levels[v % 4], v);
      expect(qr.version).toBe(v);
      expect(decoded).toBe(text);
    }
  }, 60000);

  it("a nearly full v40 symbol and a multi-block v10", () => {
    const big = Array.from({ length: 1200 }, (_, i) => String.fromCharCode(97 + ((i * 7) % 26))).join("");
    expect(scan(big, "H").decoded).toBe(big);
    const mid = Array.from({ length: 200 }, (_, i) => String.fromCharCode(48 + ((i * 11) % 75))).join("");
    expect(scan(mid, "M").qr.version).toBe(10);
    expect(scan(mid, "M").decoded).toBe(mid);
  });

  it("every mask gives a readable code", () => {
    for (let mask = 0; mask < 8; mask++) {
      const qr = encodeQr("mask test 123", { ecc: "Q", mask });
      const { data, width } = toPixels(qr, 4);
      expect(jsQR(data, width, width)?.data).toBe("mask test 123");
    }
  });

  it("the SVG path draws the same modules", () => {
    const qr = encodeQr("svg check");
    const svg = toSvg(qr, 2, "#000000", "#ffffff");
    expect(svg).toContain(`viewBox="0 0 ${qr.size + 4} ${qr.size + 4}"`);
    const dark = [...svg.matchAll(/M\d+ \d+h(\d+)v1/g)].reduce((n, m) => n + Number(m[1]), 0);
    expect(dark).toBe(qr.modules.flat().filter(Boolean).length);
  });
});

describe("limits", () => {
  it("throws when the text can't fit", () => {
    expect(() => encodeQr("a".repeat(3000), { ecc: "L" })).toThrow(/Too long/);
    expect(() => encodeQr("a".repeat(1300), { ecc: "H" })).toThrow(/Too long/);
  });
});
