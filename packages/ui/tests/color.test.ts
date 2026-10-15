import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, readableOn } from "../src/color";

describe("colour maths", () => {
  it("reads hex", () => {
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv("00ff00")?.h).toBeCloseTo(120);
    expect(hexToHsv("#0000ff")?.h).toBeCloseTo(240);
    expect(hexToHsv("#808080")).toMatchObject({ s: 0 });
    expect(hexToHsv("#12")).toBeNull();
  });
  it("round-trips every primary and a spread of colours", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#000000", "#ffffff", "#0d6efd", "#e5a00d", "#7950f2", "#198754", "#d63384"]) {
      expect(hsvToHex(hexToHsv(hex)!)).toBe(hex);
    }
  });
  it("covers the corners of the square", () => {
    expect(hsvToHex({ h: 215, s: 0, v: 1 })).toBe("#ffffff");
    expect(hsvToHex({ h: 215, s: 1, v: 0 })).toBe("#000000");
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#ff0000");
  });
});

describe("readable text colour", () => {
  it("picks black on light colours and white on dark ones", () => {
    expect(readableOn("#ffffff")).toBe("#10131a");
    expect(readableOn("#ffd54a")).toBe("#10131a");
    expect(readableOn("#102a6b")).toBe("#ffffff");
    expect(readableOn("#e5383b")).toBe("#ffffff");
    expect(readableOn("nonsense")).toBe("#ffffff");
  });
});

