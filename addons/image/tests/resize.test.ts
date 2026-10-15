import { describe, expect, it } from "vitest";
import { MAX_SIDE, clampSide, percentOf, resizeState, sizeAfterEdit } from "../src/lib/editor/resize";
import { baseSize, outputSize } from "../src/lib/editor/render";
import { flipAnnotations, rotateAnnotations } from "../src/lib/editor/transform";
import { newText } from "../src/lib/editor/text";
import { INITIAL, type EditState } from "../src/lib/editor/types";
import { autoCrop } from "../src/useImageEditor";

const src = { width: 4000, height: 3000 };
const state: EditState = {
  ...INITIAL,
  strokes: [{ id: "s", kind: "pen", color: "#fff", size: 10, points: [[400, 300], [800, 600]] }],
  texts: [newText({ id: "t", x: 2000, y: 1500, size: 100, rotation: 20 })],
  crop: { x: 100, y: 200, w: 2000, h: 1000 },
};

describe("squish and stretch", () => {
  it("scales the base canvas and the output across and down independently", () => {
    const s = resizeState({ ...state, crop: null }, 0.5, 2);
    expect(baseSize(src, s)).toEqual({ w: 2000, h: 6000 });
    expect(outputSize(src, s)).toEqual({ w: 2000, h: 6000 });
  });
  it("carries the crop, strokes and text with the picture", () => {
    const s = resizeState(state, 0.5, 2);
    expect(s.crop).toEqual({ x: 50, y: 400, w: 1000, h: 2000 });
    expect(s.strokes[0].points).toEqual([[200, 600], [400, 1200]]);
    expect(s.texts[0]).toMatchObject({ x: 1000, y: 3000, rotation: 20 });
  });
  it("sizes text and brushes by the average scale, and exactly when the scale is uniform", () => {
    expect(resizeState(state, 2, 2).texts[0].size).toBeCloseTo(200);
    expect(resizeState(state, 2, 2).strokes[0].size).toBeCloseTo(20);
    expect(resizeState(state, 4, 1).texts[0].size).toBeCloseTo(200);
  });
  it("composes: two resizes equal one", () => {
    const a = resizeState(resizeState(state, 0.5, 2), 3, 0.25);
    const b = resizeState(state, 1.5, 0.5);
    expect(a.stretch.x).toBeCloseTo(b.stretch.x);
    expect(a.texts[0].x).toBeCloseTo(b.texts[0].x);
    expect(a.crop!.h).toBeCloseTo(b.crop!.h);
  });
  it("a resize that changes nothing returns the same state", () => {
    expect(resizeState(state, 1, 1)).toBe(state);
  });
  it("a quarter turn after a squish: the picture and the stretch swap together", () => {
    const squished = resizeState({ ...state, crop: null }, 2, 1);
    const b = baseSize(src, squished); // 8000 x 3000
    const turned: EditState = { ...squished, rotation: 90, stretch: { x: squished.stretch.y, y: squished.stretch.x }, ...rotateAnnotations(squished.strokes, squished.texts, b.w, b.h, 1) };
    expect(baseSize(src, turned)).toEqual({ w: b.h, h: b.w });
  });
  it("mirroring through a squish lands where the squished picture's own mirror does", () => {
    // squish across by 2, mirror about the vertical axis: x -> W - x in the squished space
    const W = 8000, H = 3000;
    const { strokes, texts } = flipAnnotations([{ ...state.strokes[0], points: [[1000, 500]] }], [state.texts[0]], W, H, 0, "h", { x: 2, y: 1 });
    expect(strokes[0].points[0][0]).toBeCloseTo(W - 1000);
    expect(strokes[0].points[0][1]).toBeCloseTo(500);
    expect(texts[0].rotation).toBeCloseTo(-20);
  });
});

describe("annotations turn with the picture", () => {
  it("a quarter turn turns text a quarter, four turns bring it back", () => {
    let t = [state.texts[0]], w = 4000, h = 3000;
    const r0 = t[0].rotation;
    ({ texts: t } = rotateAnnotations([], t, w, h, 1));
    expect(t[0].rotation).toBe(r0 + 90);
    [w, h] = [h, w];
    for (let i = 0; i < 3; i++) { ({ texts: t } = rotateAnnotations([], t, w, h, 1)); [w, h] = [h, w]; }
    expect(t[0].rotation).toBeCloseTo(r0);
  });
});

describe("aspect lock", () => {
  it("keeps the shape when locked, from either side", () => {
    expect(sizeAfterEdit("w", 2000, { w: 4000, h: 3000 }, true, 4 / 3)).toEqual({ w: 2000, h: 1500 });
    expect(sizeAfterEdit("h", 600, { w: 4000, h: 3000 }, true, 4 / 3)).toEqual({ w: 800, h: 600 });
  });
  it("leaves the other side alone when unlocked", () => {
    expect(sizeAfterEdit("w", 2000, { w: 4000, h: 3000 }, false, 4 / 3)).toEqual({ w: 2000, h: 3000 });
  });
  it("clamps to whole pixels, at least 1, and the lock never pushes a side past the limit", () => {
    expect(clampSide(0)).toBe(1);
    expect(clampSide(-5)).toBe(1);
    expect(clampSide(12.6)).toBe(13);
    expect(clampSide(Number.NaN)).toBe(1);
    expect(clampSide(1e9)).toBe(MAX_SIDE);
    const r = sizeAfterEdit("w", 60000, { w: 100, h: 10 }, true, 10); // height would be 6000, fine
    expect(r).toEqual({ w: 60000, h: 6000 });
    const r2 = sizeAfterEdit("h", 60000, { w: 100, h: 10 }, true, 10); // width would be 600000
    expect(r2.w).toBe(MAX_SIDE);
    expect(r2.h).toBeLessThan(60000);
    expect(r2.w / r2.h).toBeCloseTo(10, 1);
  });
  it("reports a stretch as a percentage", () => {
    expect(percentOf(1)).toBe(100);
    expect(percentOf(0.5)).toBe(50);
    expect(percentOf(1.234)).toBe(123.4);
  });
});

describe("straighten, crop and squish together", () => {
  it("the automatic crop of a straightened, squished picture stays inside it and keeps the squish", () => {
    for (const rotation of [0, 90] as const) {
      const tilted: EditState = { ...INITIAL, rotation, straighten: 7, stretch: { x: 1.5, y: 0.6 } };
      const b = baseSize(src, tilted);
      const c = autoCrop(src, tilted)!;
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(b.w + 1e-6);
      expect(c.y + c.h).toBeLessThanOrEqual(b.h + 1e-6);
      // squishing the unsquished crop gives the same rectangle
      const plain = autoCrop(src, { ...tilted, stretch: { x: 1, y: 1 } })!;
      expect(c.w).toBeCloseTo(plain.w * 1.5);
      expect(c.h).toBeCloseTo(plain.h * 0.6);
    }
  });
  it("resizing the cropped output to a size lands exactly on that size", () => {
    const base: EditState = { ...INITIAL, straighten: 5 };
    const cropped = { ...base, crop: autoCrop(src, base) };
    const o = outputSize(src, cropped);
    const s = resizeState(cropped, 800 / o.w, 600 / o.h);
    const out = outputSize(src, s);
    expect(out.w).toBeCloseTo(800);
    expect(out.h).toBeCloseTo(600);
  });
});
