import { describe, expect, it } from "vitest";
import { applyAdjust, isNeutral, type Pixels } from "../src/lib/editor/adjust";
import { clampRect, dragHandle, inscribedScale, rectForAspect, rotatedBounds } from "../src/lib/editor/crop";
import { canRedo, canUndo, commit, createHistory, redo, reset, undo } from "../src/lib/editor/history";
import { newText } from "../src/lib/editor/text";
import { INITIAL, NEUTRAL, type Adjust } from "../src/lib/editor/types";

const px = (r: number, g: number, b: number, w = 1, h = 1): Pixels => ({ width: w, height: h, data: new Uint8ClampedArray(Array.from({ length: w * h }, () => [r, g, b, 255]).flat()) });
const adj = (over: Partial<Adjust>): Adjust => ({ ...NEUTRAL, ...over });

describe("adjustments", () => {
  it("neutral settings change nothing", () => {
    const p = px(120, 80, 200, 3, 3);
    const before = Array.from(p.data);
    applyAdjust(p, NEUTRAL);
    expect(Array.from(p.data)).toEqual(before);
    expect(isNeutral(NEUTRAL)).toBe(true);
    expect(isNeutral(adj({ contrast: 1 }))).toBe(false);
  });
  it("brightness and exposure lighten, negative values darken", () => {
    const up = px(100, 100, 100); applyAdjust(up, adj({ brightness: 50 }));
    const down = px(100, 100, 100); applyAdjust(down, adj({ brightness: -50 }));
    const exp = px(100, 100, 100); applyAdjust(exp, adj({ exposure: 100 }));
    expect(up.data[0]).toBeGreaterThan(100);
    expect(down.data[0]).toBeLessThan(100);
    expect(exp.data[0]).toBe(200); // one stop doubles
  });
  it("contrast pushes away from mid grey and leaves mid grey alone", () => {
    const hi = px(200, 200, 200); applyAdjust(hi, adj({ contrast: 50 }));
    const lo = px(60, 60, 60); applyAdjust(lo, adj({ contrast: 50 }));
    const mid = px(128, 128, 128); applyAdjust(mid, adj({ contrast: 50 }));
    expect(hi.data[0]).toBeGreaterThan(200);
    expect(lo.data[0]).toBeLessThan(60);
    expect(mid.data[0]).toBe(128);
  });
  it("saturation -100 is grey; +100 pulls channels apart", () => {
    const grey = px(200, 100, 50); applyAdjust(grey, adj({ saturation: -100 }));
    expect(grey.data[0]).toBe(grey.data[1]);
    expect(grey.data[1]).toBe(grey.data[2]);
    const vivid = px(200, 100, 50); applyAdjust(vivid, adj({ saturation: 100 }));
    expect(vivid.data[0] - vivid.data[2]).toBeGreaterThan(150);
  });
  it("warmth moves red up and blue down", () => {
    const p = px(100, 100, 100); applyAdjust(p, adj({ warmth: 50 }));
    expect(p.data[0]).toBeGreaterThan(100);
    expect(p.data[2]).toBeLessThan(100);
  });
  it("never leaves the 0..255 range and keeps alpha", () => {
    const p = px(250, 5, 128, 2, 2); p.data[3] = 77;
    applyAdjust(p, adj({ exposure: 100, brightness: 100, contrast: 100, saturation: 100, warmth: 100 }), "dramatic");
    for (const v of p.data) expect(v >= 0 && v <= 255).toBe(true);
    expect(p.data[3]).toBe(77);
  });
  it("mono makes channels equal; filter amount 0 is a no-op; 50 is in between", () => {
    const m = px(200, 40, 90); applyAdjust(m, NEUTRAL, "mono", 100);
    expect(m.data[0]).toBe(m.data[1]);
    const none = px(200, 40, 90); applyAdjust(none, NEUTRAL, "mono", 0);
    expect(Array.from(none.data.slice(0, 3))).toEqual([200, 40, 90]);
    const half = px(200, 40, 90); applyAdjust(half, NEUTRAL, "mono", 50);
    expect(half.data[0]).toBeLessThan(200);
    expect(half.data[0]).toBeGreaterThan(m.data[0]);
  });
  it("vignette darkens corners more than the centre", () => {
    const p = px(200, 200, 200, 9, 9); applyAdjust(p, adj({ vignette: 100 }));
    const centre = p.data[(4 * 9 + 4) * 4];
    const corner = p.data[0];
    expect(corner).toBeLessThan(centre);
  });
  it("sharpen raises local contrast at an edge and leaves flat areas", () => {
    const w = 5;
    const p = px(100, 100, 100, w, 3);
    for (let y = 0; y < 3; y++) for (let x = 3; x < w; x++) { const i = (y * w + x) * 4; p.data[i] = p.data[i + 1] = p.data[i + 2] = 200; }
    applyAdjust(p, adj({ sharpen: 100 }));
    const at = (x: number) => p.data[(1 * w + x) * 4];
    expect(at(2)).toBeLessThan(100); // dark side of the edge gets darker
    expect(at(3)).toBeGreaterThan(200); // bright side gets brighter
    expect(at(1)).toBe(100); // flat area unchanged
  });
});

describe("crop geometry", () => {
  const bounds = { w: 400, h: 300 };
  it("clamps into the image and above the minimum size", () => {
    expect(clampRect({ x: -20, y: 290, w: 500, h: 50 }, bounds)).toEqual({ x: 0, y: 250, w: 400, h: 50 });
    expect(clampRect({ x: 10, y: 10, w: 2, h: 2 }, bounds).w).toBe(16);
  });
  it("makes the largest centred rect for a ratio", () => {
    const r = rectForAspect(bounds, 1);
    expect(r).toEqual({ x: 50, y: 0, w: 300, h: 300 });
    const wide = rectForAspect(bounds, 16 / 9);
    expect(wide.w).toBe(400);
    expect(wide.w / wide.h).toBeCloseTo(16 / 9);
  });
  it("moves a rect without leaving the image", () => {
    const r = dragHandle({ x: 100, y: 100, w: 100, h: 100 }, "move", 999, -999, bounds, null);
    expect(r).toEqual({ x: 300, y: 0, w: 100, h: 100 });
  });
  it("resizes freely from a corner", () => {
    const r = dragHandle({ x: 100, y: 100, w: 100, h: 100 }, "se", 50, 20, bounds, null);
    expect(r).toEqual({ x: 100, y: 100, w: 150, h: 120 });
  });
  it("keeps the ratio when one is locked", () => {
    for (const handle of ["nw", "ne", "se", "sw", "n", "e", "s", "w"] as const) {
      const r = dragHandle({ x: 100, y: 100, w: 160, h: 90 }, handle, 30, 25, bounds, 16 / 9);
      expect(r.w / r.h, handle).toBeCloseTo(16 / 9, 1);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(400.001);
      expect(r.y + r.h).toBeLessThanOrEqual(300.001);
    }
  });
  it("never escapes the bounds however far you drag", () => {
    for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w", "move"] as const) {
      for (const [dx, dy] of [[-900, -900], [900, 900], [900, -900], [-900, 900]]) {
        for (const ratio of [null, 1, 16 / 9]) {
          const r = dragHandle({ x: 100, y: 80, w: 120, h: 90 }, handle, dx, dy, bounds, ratio);
          expect(r.x, `${handle} ${dx},${dy} ${ratio}`).toBeGreaterThanOrEqual(-0.001);
          expect(r.y).toBeGreaterThanOrEqual(-0.001);
          expect(r.x + r.w).toBeLessThanOrEqual(400.001);
          expect(r.y + r.h).toBeLessThanOrEqual(300.001);
          expect(r.w).toBeGreaterThan(0);
          expect(r.h).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("straightening", () => {
  it("no rotation keeps everything", () => {
    expect(inscribedScale(400, 300, 0)).toBe(1);
  });
  it("shrinks the crop as the angle grows, and the crop really fits inside the rotated image", () => {
    let last = 1;
    for (const deg of [1, 5, 10, 20, 30, 45]) {
      const k = inscribedScale(400, 300, deg);
      expect(k).toBeLessThan(last);
      last = k;
      // verify geometrically: corners of the k-scaled rect, rotated back, lie inside the original
      const t = (deg * Math.PI) / 180;
      const cw = 400 * k, ch = 300 * k;
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const x = (sx * cw) / 2, y = (sy * ch) / 2;
        const rx = x * Math.cos(t) + y * Math.sin(t);
        const ry = -x * Math.sin(t) + y * Math.cos(t);
        expect(Math.abs(rx)).toBeLessThanOrEqual(200.0001);
        expect(Math.abs(ry)).toBeLessThanOrEqual(150.0001);
      }
    }
  });
  it("computes the canvas that holds a rotated image", () => {
    const b = rotatedBounds(400, 300, 90);
    expect(b.w).toBeCloseTo(300);
    expect(b.h).toBeCloseTo(400);
    const c = rotatedBounds(400, 300, 0);
    expect(c).toEqual({ w: 400, h: 300 });
  });
});

describe("history", () => {
  const a = { ...INITIAL, straighten: 5 };
  const b = { ...INITIAL, straighten: 9 };
  it("undoes and redoes in order", () => {
    let h = createHistory();
    h = commit(commit(h, a), b);
    expect(h.present).toBe(b);
    h = undo(h); expect(h.present).toBe(a);
    h = undo(h); expect(h.present).toBe(INITIAL);
    expect(canUndo(h)).toBe(false);
    h = redo(h); expect(h.present).toBe(a);
    expect(canRedo(h)).toBe(true);
  });
  it("a new edit after undo drops the redo branch", () => {
    let h = commit(commit(createHistory(), a), b);
    h = undo(h);
    h = commit(h, { ...INITIAL, flipH: true });
    expect(canRedo(h)).toBe(false);
  });
  it("ignores a commit that changes nothing, and bounds its size", () => {
    let h = commit(createHistory(), a);
    expect(commit(h, h.present)).toBe(h);
    for (let i = 0; i < 200; i++) h = commit(h, { ...INITIAL, straighten: i });
    expect(h.past.length).toBeLessThanOrEqual(60);
  });
  it("reset is itself undoable", () => {
    let h = commit(createHistory(), a);
    h = reset(h);
    expect(h.present).toBe(INITIAL);
    h = undo(h);
    expect(h.present).toBe(a);
  });
});

import { flipAnnotations, rotateAnnotations } from "../src/lib/editor/transform";
import type { Stroke, TextItem } from "../src/lib/editor/types";

describe("annotations follow rotation and mirroring", () => {
  const stroke: Stroke = { id: "s", kind: "pen", color: "#fff", size: 4, points: [[10, 20], [30, 40], [100, 50]] };
  const text: TextItem = newText({ id: "t", text: "hi", x: 60, y: 10, size: 20, bold: false, shadow: false });
  const W = 200, H = 120;
  const close = (a: [number, number][], b: [number, number][]) => a.forEach((p, i) => { expect(p[0]).toBeCloseTo(b[i][0]); expect(p[1]).toBeCloseTo(b[i][1]); });

  it("four clockwise turns bring everything back", () => {
    let s = [stroke], t = [text], w = W, h = H;
    for (let i = 0; i < 4; i++) { ({ strokes: s, texts: t } = rotateAnnotations(s, t, w, h, 1)); [w, h] = [h, w]; }
    close(s[0].points, stroke.points);
    expect([t[0].x, t[1 - 1].y]).toEqual([text.x, text.y]);
  });
  it("clockwise then counter-clockwise is a no-op", () => {
    const a = rotateAnnotations([stroke], [text], W, H, 1);
    const b = rotateAnnotations(a.strokes, a.texts, H, W, -1);
    close(b.strokes[0].points, stroke.points);
  });
  it("a point at the top-left goes to the top-right after a clockwise turn", () => {
    const { strokes } = rotateAnnotations([{ ...stroke, points: [[0, 0]] }], [], W, H, 1);
    expect(strokes[0].points[0]).toEqual([H, 0]);
  });
  it("mirroring twice is a no-op, for any tilt", () => {
    for (const deg of [0, 90, 7, -23]) {
      for (const axis of ["h", "v"] as const) {
        const a = flipAnnotations([stroke], [text], W, H, deg, axis);
        const b = flipAnnotations(a.strokes, a.texts, W, H, deg, axis);
        close(b.strokes[0].points, stroke.points);
        expect(b.texts[0].x).toBeCloseTo(text.x);
        expect(b.texts[0].y).toBeCloseTo(text.y);
      }
    }
  });
  it("a horizontal mirror of an untilted picture flips x about the centre only", () => {
    const { strokes } = flipAnnotations([stroke], [], W, H, 0, "h");
    close(strokes[0].points, stroke.points.map(([x, y]) => [W - x, y] as [number, number]));
  });
});
