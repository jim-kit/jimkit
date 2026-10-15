import { describe, expect, it } from "vitest";
import { contrastRatio, hexToRgb, inGamut, oklabToRgb as rawOklab, oklchToRgb, passesAll, recommend, rgbToOklab, rgbToOklch, toHex, verdicts, type Rgb } from "../src/lib/colour";

const hex = (s: string) => hexToRgb(s)!;
const found = (fg: string, bg: string, side: "fg" | "bg") => {
  const r = recommend(hex(fg), hex(bg), side);
  if (r.kind !== "found") throw new Error(`${fg} on ${bg}: ${r.kind}`);
  return r;
};

/** every colour of this hue on a fine lightness and chroma grid that passes: the distance of the nearest one */
function brute(cur: Rgb, other: Rgb, side: "fg" | "bg"): number {
  const o = rgbToOklch(cur);
  const [L0, a0, b0] = rgbToOklab(cur);
  let best = Infinity;
  for (let l = 0; l <= 1.0001; l += 0.002) {
    for (let c = 0; c <= 0.4; c += 0.002) {
      const x = oklchToRgbRawLike(l, c, o.h);
      if (!inGamut(x)) continue;
      const ratio = side === "fg" ? contrastRatio(x, other) : contrastRatio(other, x);
      if (!passesAll(ratio)) continue;
      const [pl, pa, pb] = rgbToOklab(x);
      best = Math.min(best, Math.hypot(pl - L0, pa - a0, pb - b0));
    }
  }
  return best;
}
// oklchToRgb maps into gamut; the grid wants the raw value so it can skip what sRGB cannot show
function oklchToRgbRawLike(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
  return rawOklab(l, a, b);
}

describe("passesAll", () => {
  it("is the strictest test the tool shows", () => {
    expect(passesAll(7)).toBe(true);
    expect(passesAll(6.99)).toBe(false);
    expect(Object.values(verdicts(7)).every(Boolean)).toBe(true);
  });
});

describe("recommend", () => {
  it("leaves a colour alone when it already passes", () => {
    expect(recommend(hex("#000000"), hex("#ffffff"), "fg")).toEqual({ kind: "passes" });
    expect(recommend(hex("#ffffff"), hex("#000000"), "bg")).toEqual({ kind: "passes" });
    expect(recommend(hex("#1a1a1a"), hex("#fafafa"), "fg").kind).toBe("passes");
  });

  const pairs: [string, string, "fg" | "bg"][] = [
    ["#777777", "#ffffff", "fg"],
    ["#3366cc", "#ffffff", "fg"],
    ["#ff0000", "#ffffff", "fg"],
    ["#ffff00", "#ffffff", "fg"],
    ["#00ff00", "#ffffff", "fg"],
    ["#0000ff", "#000000", "fg"],
    ["#888888", "#000000", "fg"],
    ["#ffffff", "#3366cc", "bg"],
    ["#ffffff", "#ff8800", "bg"],
    ["#003399", "#99bbee", "bg"],
    ["#3366cc", "#99bbee", "fg"],
  ];
  for (const [fg, bg, side] of pairs) {
    it(`${fg} on ${bg}, changing the ${side === "fg" ? "text" : "background"}: passes everything and is the nearest that does`, () => {
      const r = found(fg, bg, side);
      const ratio = side === "fg" ? contrastRatio(r.colour, hex(bg)) : contrastRatio(hex(fg), r.colour);
      expect(passesAll(ratio)).toBe(true);
      expect(Object.values(verdicts(ratio)).every(Boolean)).toBe(true);
      expect(r.ratio).toBeCloseTo(ratio, 10);
      const want = brute(side === "fg" ? hex(fg) : hex(bg), side === "fg" ? hex(bg) : hex(fg), side);
      expect(Math.abs(r.distance - want)).toBeLessThan(0.006);
    });
  }

  it("keeps the hue of a saturated colour as far as the gamut allows", () => {
    for (const c of ["#ff0000", "#3366cc", "#00aa44"]) {
      const r = found(c, "#ffffff", "fg");
      const a = rgbToOklch(hex(c)), b = rgbToOklch(r.colour);
      expect(Math.abs(((a.h - b.h + 540) % 360) - 180)).toBeLessThan(6);
    }
  });

  it("moves lightness the shorter way", () => {
    const light = found("#ffffff", "#ffffff", "fg");
    expect(rgbToOklch(light.colour).l).toBeLessThan(0.5);
    const dark = found("#000000", "#000000", "fg");
    expect(rgbToOklch(dark.colour).l).toBeGreaterThan(0.5);
    // a mid-dark text on a light background: going darker is nearer than going lighter
    expect(rgbToOklch(found("#3366cc", "#99bbee", "fg").colour).l).toBeLessThan(rgbToOklch(hex("#3366cc")).l);
  });

  it("handles white on white and black on black from either side", () => {
    expect(toHex(found("#ffffff", "#ffffff", "bg").colour)).toBe(toHex(found("#ffffff", "#ffffff", "fg").colour));
    const r = found("#ffffff", "#ffffff", "fg");
    expect(r.ratio).toBeGreaterThanOrEqual(7);
    expect(r.ratio).toBeLessThan(7.2); // the nearest, not just any dark colour
  });

  it("says so when the other colour leaves no way to pass", () => {
    // mid grey: even black or white gives only about 4.6:1 to 5:1
    const r = recommend(hex("#777777"), hex("#777777"), "fg");
    expect(r.kind).toBe("impossible");
    if (r.kind === "impossible") { expect(r.best).toBeGreaterThan(4); expect(r.best).toBeLessThan(5.5); }
    expect(recommend(hex("#3366cc"), hex("#5588dd"), "bg").kind).toBe("impossible");
    expect(recommend(hex("#ff0000"), hex("#808080"), "fg").kind).toBe("impossible");
    expect(recommend(hex("#ff0000"), hex("#808080"), "bg").kind).toBe("impossible");
  });

  it("works against black and white backgrounds", () => {
    expect(found("#ff00ff", "#ffffff", "fg").ratio).toBeGreaterThanOrEqual(7);
    expect(found("#ff00ff", "#000000", "fg").colour).toBeDefined();
    expect(found("#222222", "#000000", "fg").ratio).toBeGreaterThanOrEqual(7);
    // the farthest case: against pure white the text can still be black
    expect(found("#ffffff", "#ffffff", "fg").ratio).toBeGreaterThanOrEqual(7);
  });

  it("keeps the alpha of the colour it changes", () => {
    const r = recommend({ r: 0.2, g: 0.4, b: 0.8, a: 0.9 }, hex("#ffffff"), "fg");
    if (r.kind === "found") expect(r.colour.a).toBeCloseTo(0.9, 1);
    else expect(r.kind).toBe("impossible");
  });

  it("gives a gamut-valid colour", () => {
    for (const [fg, bg] of [["#ff0000", "#ffffff"], ["#00ffff", "#ffffff"], ["#ffff00", "#ffffff"]]) {
      const c = found(fg, bg, "fg").colour;
      expect([c.r, c.g, c.b].every((x) => x >= 0 && x <= 1)).toBe(true);
    }
    expect(oklchToRgb({ l: 0.5, c: 0.1, h: 10, a: 1 })).toBeDefined();
  });
});
