import { describe, expect, it } from "vitest";
import { DESKTOP_LIMITS, PHONE_LIMITS, estimateBytes, fits, halveOnce, halvingPlan, largestFit, limitsFor, planExport, presetSize } from "../src/lib/editor/export-size";

describe("canvas limits", () => {
  it("picks phone limits for phones and touch screens, desktop otherwise", () => {
    expect(limitsFor({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", coarsePointer: true })).toBe(PHONE_LIMITS);
    expect(limitsFor({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/130", coarsePointer: false })).toBe(DESKTOP_LIMITS);
    expect(limitsFor({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/130", coarsePointer: true })).toBe(PHONE_LIMITS);
  });
  it("checks each side and the area", () => {
    expect(fits({ w: 10000, h: 10000 }, DESKTOP_LIMITS)).toBe(true);
    expect(fits({ w: 40000, h: 100 }, DESKTOP_LIMITS)).toBe(false); // too long
    expect(fits({ w: 20000, h: 20000 }, DESKTOP_LIMITS)).toBe(false); // too many pixels
    expect(fits({ w: 8000, h: 5000 }, PHONE_LIMITS)).toBe(false); // 40 MP on a phone
  });
  it("finds the largest size of the same shape that fits, and it really fits", () => {
    for (const s of [{ w: 40000, h: 100 }, { w: 20000, h: 20000 }, { w: 9000, h: 6000 }, { w: 1, h: 90000 }]) {
      for (const l of [DESKTOP_LIMITS, PHONE_LIMITS]) {
        const b = largestFit(s, l);
        expect(fits(b, l)).toBe(true);
        expect(b.w).toBeGreaterThanOrEqual(1);
        expect(b.h).toBeGreaterThanOrEqual(1);
      }
    }
    expect(largestFit({ w: 4000, h: 3000 }, DESKTOP_LIMITS)).toEqual({ w: 4000, h: 3000 });
    const b = largestFit({ w: 20000, h: 20000 }, DESKTOP_LIMITS);
    expect(b.w).toBe(b.h);
    expect(b.w * b.h).toBeGreaterThan(DESKTOP_LIMITS.maxArea * 0.99);
  });
});

describe("export plan", () => {
  it("is fine when the output and the picture it is cut from both fit", () => {
    expect(planExport({ w: 4000, h: 3000 }, { w: 4000, h: 3000 }, DESKTOP_LIMITS)).toMatchObject({ ok: true, message: null });
  });
  it("explains a size that is too big and offers one that works", () => {
    const p = planExport({ w: 30000, h: 20000 }, { w: 30000, h: 20000 }, DESKTOP_LIMITS);
    expect(p.ok).toBe(false);
    expect(p.message).toMatch(/Too large/);
    expect(p.message).toContain("134 megapixels");
    expect(fits(p.max, DESKTOP_LIMITS)).toBe(true);
    expect(p.max.w / p.max.h).toBeCloseTo(1.5, 1);
  });
  it("also counts the full picture a crop is cut from", () => {
    // a small crop, but the whole picture at that scale would be 40000 px wide
    const p = planExport({ w: 1000, h: 1000 }, { w: 40000, h: 3000 }, DESKTOP_LIMITS);
    expect(p.ok).toBe(false);
    expect(p.max.w).toBeLessThan(1000);
  });
});

describe("presets", () => {
  it("scales by a percentage and never makes a side zero", () => {
    expect(presetSize({ w: 4000, h: 3000 }, { percent: 50 })).toEqual({ w: 2000, h: 1500 });
    expect(presetSize({ w: 4000, h: 3000 }, { percent: 200 })).toEqual({ w: 8000, h: 6000 });
    expect(presetSize({ w: 10, h: 1 }, { percent: 25 })).toEqual({ w: 3, h: 1 });
  });
  it("sets the longest side, whichever it is, keeping the shape", () => {
    expect(presetSize({ w: 4000, h: 3000 }, { longest: 1000 })).toEqual({ w: 1000, h: 750 });
    expect(presetSize({ w: 3000, h: 4000 }, { longest: 1000 })).toEqual({ w: 750, h: 1000 });
  });
});

describe("step-down resampling", () => {
  it("halves until within a factor of two of the target", () => {
    expect(halvingPlan({ w: 6000, h: 4000 }, { w: 600, h: 400 })).toEqual([{ w: 3000, h: 2000 }, { w: 1500, h: 1000 }, { w: 750, h: 500 }]);
  });
  it("does nothing for a small reduction, an enlargement or the same size", () => {
    expect(halvingPlan({ w: 4000, h: 3000 }, { w: 2500, h: 1900 })).toEqual([]);
    expect(halvingPlan({ w: 4000, h: 3000 }, { w: 8000, h: 6000 })).toEqual([]);
    expect(halveOnce({ w: 4000, h: 3000 }, { w: 4000, h: 3000 })).toBeNull();
  });
  it("squashes each axis on its own and stops at one pixel", () => {
    expect(halvingPlan({ w: 4000, h: 3000 }, { w: 500, h: 3000 }).at(-1)).toEqual({ w: 500, h: 3000 });
    const last = halvingPlan({ w: 64, h: 64 }, { w: 0.1, h: 0.1 }).at(-1)!;
    expect(last).toEqual({ w: 1, h: 1 });
  });
});

describe("file size estimate", () => {
  it("scales the sample's bytes per pixel to the target", () => {
    expect(estimateBytes(100_000, 1_000_000, 4_000_000)).toBe(400_000);
    expect(estimateBytes(0, 0, 100)).toBe(0);
  });
});
