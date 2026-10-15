import { describe, expect, it } from "vitest";
import {
  contrastRatio, hexToRgb, inGamut, oklchToRgb, parseColour, ramp, rgbToHsl, rgbToOklch, rotate, toHex, toHslString, toOklchString, toRgbString, verdicts,
  type Rgb,
} from "../src/lib/colour";

const hex = (s: string) => hexToRgb(s)!;

describe("OKLCH", () => {
  it("matches the CSS Color 4 values for the sRGB primaries", () => {
    const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);
    const red = rgbToOklch(hex("#ff0000"));
    near(red.l, 0.62796, 1e-4); near(red.c, 0.25768, 1e-4); near(red.h, 29.234, 0.01);
    const green = rgbToOklch(hex("#00ff00"));
    near(green.l, 0.86644, 1e-4); near(green.c, 0.29483, 1e-4); near(green.h, 142.495, 0.01);
    const blue = rgbToOklch(hex("#0000ff"));
    near(blue.l, 0.45201, 1e-4); near(blue.c, 0.31321, 1e-4); near(blue.h, 264.052, 0.01);
    const white = rgbToOklch(hex("#ffffff"));
    near(white.l, 1, 1e-4); near(white.c, 0, 1e-4);
    expect(rgbToOklch(hex("#000000")).l).toBeCloseTo(0, 6);
  });

  it("round-trips any hex colour through OKLCH", () => {
    for (let i = 0; i < 400; i++) {
      const h = "#" + ((i * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, "0");
      expect(toHex(oklchToRgb(rgbToOklch(hex(h))))).toBe(h);
    }
  });

  it("brings an out-of-gamut colour into gamut and leaves lightness and hue alone", () => {
    const wild = oklchToRgb({ l: 0.7, c: 0.4, h: 150, a: 1 });
    expect(inGamut(wild)).toBe(true);
    const back = rgbToOklch(wild);
    expect(back.l).toBeGreaterThan(0.65);
    expect(back.l).toBeLessThan(0.75);
    expect(Math.abs(back.h - 150)).toBeLessThan(6);
    expect(toHex(oklchToRgb({ l: 1.2, c: 0.3, h: 10, a: 1 }))).toBe("#ffffff");
    expect(toHex(oklchToRgb({ l: -0.1, c: 0.3, h: 10, a: 1 }))).toBe("#000000");
  });
});

describe("HSL and strings", () => {
  it("converts both ways", () => {
    expect(toHslString(hex("#3366cc"))).toBe("hsl(220 60% 50%)");
    expect(toHslString(hex("#ff0000"))).toBe("hsl(0 100% 50%)");
    expect(toHslString(hex("#808080"))).toBe("hsl(0 0% 50.2%)");
    expect(toHex(parseColour("hsl(220 60% 50%)")!)).toBe("#3366cc");
    expect(toHex(parseColour("hsl(120deg, 100%, 25%)")!)).toBe("#008000");
    expect(rgbToHsl(hex("#000")).s).toBe(0);
  });

  it("prints rgb, oklch and alpha", () => {
    expect(toRgbString(hex("#ff6347"))).toBe("rgb(255 99 71)");
    expect(toRgbString(hex("#ff634780"))).toBe("rgb(255 99 71 / 0.502)");
    expect(toHex(hex("#ff634780"))).toBe("#ff634780");
    expect(toOklchString(hex("#ff0000"))).toBe("oklch(62.8% 0.2577 29.23)");
    expect(toOklchString(hex("#ffffff"))).toBe("oklch(100% 0 0)");
  });
});

describe("parsing", () => {
  it("reads the common spellings", () => {
    expect(toHex(parseColour("#abc")!)).toBe("#aabbcc");
    expect(toHex(parseColour("ABCDEF")!)).toBe("#abcdef");
    expect(toHex(parseColour("rgb(255, 99, 71)")!)).toBe("#ff6347");
    expect(toHex(parseColour("rgb(255 99 71 / 50%)")!)).toBe("#ff634780");
    expect(toHex(parseColour("rgba(0,0,0,.5)")!)).toBe("#00000080");
    expect(toHex(parseColour("rgb(100% 0% 0%)")!)).toBe("#ff0000");
    expect(toHex(parseColour("tomato")!)).toBe("#ff6347");
    expect(toHex(parseColour("oklch(62.8% 0.2577 29.23)")!)).toBe("#ff0000");
    expect(toHex(parseColour("oklch(0.628 0.2577 0.0813turn)")!)).toBe("#ff0000");
  });
  it("rejects what it can't read", () => {
    for (const bad of ["", "#12", "#12345", "rgb(1 2)", "rgb(a b c)", "hsl(1 2% 3% / x)", "blurple", "oklch()"]) expect(parseColour(bad)).toBeNull();
  });
});

describe("contrast", () => {
  it("matches the WCAG reference ratios", () => {
    expect(contrastRatio(hex("#000"), hex("#fff"))).toBeCloseTo(21, 6);
    expect(contrastRatio(hex("#fff"), hex("#fff"))).toBeCloseTo(1, 6);
    expect(contrastRatio(hex("#767676"), hex("#fff"))).toBeCloseTo(4.54, 2); // the lightest grey that passes AA on white
    expect(contrastRatio(hex("#777777"), hex("#fff"))).toBeCloseTo(4.48, 2);
  });
  it("lays a transparent foreground over the background first", () => {
    const half: Rgb = { r: 0, g: 0, b: 0, a: 0.5 };
    expect(contrastRatio(half, hex("#fff"))).toBeCloseTo(contrastRatio(hex("#808080"), hex("#fff")), 1);
  });
  it("gives the AA and AAA verdicts", () => {
    expect(verdicts(4.5)).toEqual({ aaNormal: true, aaLarge: true, aaaNormal: false, aaaLarge: true, ui: true });
    expect(verdicts(4.49)).toMatchObject({ aaNormal: false, aaLarge: true, aaaLarge: false });
    expect(verdicts(2.9)).toMatchObject({ aaLarge: false, ui: false });
    expect(verdicts(7)).toMatchObject({ aaaNormal: true });
  });
});

describe("palette", () => {
  it("steps lighter and darker, in gamut, keeping the hue", () => {
    const base = hex("#3366cc");
    const light = ramp(base, "lighter", 5), dark = ramp(base, "darker", 5);
    const l = (c: Rgb) => rgbToOklch(c).l;
    for (let i = 1; i < 5; i++) { expect(l(light[i])).toBeGreaterThan(l(light[i - 1])); expect(l(dark[i])).toBeLessThan(l(dark[i - 1])); }
    expect(l(light[0])).toBeGreaterThan(l(base));
    expect(l(dark[0])).toBeLessThan(l(base));
    for (const c of [...light, ...dark]) expect(inGamut(c)).toBe(true);
    expect(Math.abs(rgbToOklch(dark[2]).h - rgbToOklch(base).h)).toBeLessThan(8);
  });
  it("rotates the hue by a half turn to the complement", () => {
    const base = rgbToOklch(hex("#3366cc"));
    const comp = rgbToOklch(rotate(hex("#3366cc"), 180));
    expect(Math.abs((((comp.h - base.h) % 360) + 360) % 360 - 180)).toBeLessThan(6);
  });
});
