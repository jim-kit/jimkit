import { describe, expect, it } from "vitest";
import { accentVars, fitAccent, isAccent } from "@/ui/accent";

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
};
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

describe("accent colours", () => {
  it("knows the presets, ink and custom colours", () => {
    expect(isAccent("ink")).toBe(true);
    expect(isAccent("hex-0d6efd")).toBe(true);
    expect(isAccent("magenta")).toBe(false);
  });
  it("leaves a colour that stands out from the page alone", () => {
    expect(fitAccent("#0d6efd", "light")).toBe("#0d6efd");
    expect(fitAccent("#e8590c", "dark")).toBe("#e8590c");
  });
  it("moves a pale colour darker on a light page, keeping its hue", () => {
    const out = fitAccent("#fff3b0", "light");
    expect(out).not.toBe("#fff3b0");
    expect(contrast(lum(out), 0.85)).toBeGreaterThanOrEqual(2.1);
    expect(lum(out)).toBeLessThan(lum("#fff3b0"));
    // still yellowish: red and green well above blue
    const n = parseInt(out.slice(1), 16);
    expect((n >> 16) & 255).toBeGreaterThan(n & 255);
  });
  it("moves a dark colour lighter on a dark page", () => {
    const out = fitAccent("#0a0f3a", "dark");
    expect(lum(out)).toBeGreaterThan(lum("#0a0f3a"));
    expect(contrast(lum(out), 0.01)).toBeGreaterThanOrEqual(2.1);
  });
  it("sets the variables for a custom colour, and none for a preset", () => {
    expect(accentVars("blue")).toEqual({});
    expect(accentVars("ink")).toEqual({});
    expect(accentVars("hex-0d6efd", "dark")["--accent"]).toBe("#0d6efd");
  });
  it("makes a grey follow the page, like ink", () => {
    expect(accentVars("hex-999999", "light")["--accent"]).toBe("#212529");
    expect(accentVars("hex-999999", "dark")["--accent"]).toBe("#f1f3f5");
    expect(accentVars("hex-ffffff", "light")["--accent-fg"]).toBe("#ffffff");
  });
});
