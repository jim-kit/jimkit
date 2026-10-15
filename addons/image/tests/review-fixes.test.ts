import { describe, expect, it } from "vitest";
import { dragHandle, type Handle } from "../src/lib/editor/crop";

describe("a locked aspect ratio stays locked at the edge of the picture", () => {
  const bounds = { w: 2010, h: 1382 };
  const ratio = 9 / 16;
  it("keeps 9:16 when an edge handle is dragged to the limit", () => {
    const r = dragHandle({ x: 925, y: 53, w: 555, h: 987 }, "w", -783, 0, bounds, ratio);
    expect(r.w / r.h).toBeCloseTo(ratio, 2);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(bounds.w + 0.01);
    expect(r.y + r.h).toBeLessThanOrEqual(bounds.h + 0.01);
  });
  it("keeps the ratio and the bounds for every handle and a spread of drags", () => {
    const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    for (const ratioNow of [1, 16 / 9, 9 / 16, 3 / 2]) {
      const start = { x: 400, y: 300, w: 600 * Math.min(1, ratioNow), h: 600 / Math.max(1, ratioNow) };
      for (const h of handles) for (const dx of [-3000, -400, -20, 0, 20, 400, 3000]) for (const dy of [-3000, -400, 0, 400, 3000]) {
        const r = dragHandle(start, h, dx, dy, bounds, ratioNow);
        expect(r.x, `${h} ${dx},${dy}`).toBeGreaterThanOrEqual(-0.01);
        expect(r.y, `${h} ${dx},${dy}`).toBeGreaterThanOrEqual(-0.01);
        expect(r.x + r.w, `${h} ${dx},${dy}`).toBeLessThanOrEqual(bounds.w + 0.01);
        expect(r.y + r.h, `${h} ${dx},${dy}`).toBeLessThanOrEqual(bounds.h + 0.01);
        // the ratio holds unless the rectangle is as small as a crop may be
        if (r.w > 17 && r.h > 17) expect(r.w / r.h, `${h} ${dx},${dy}`).toBeCloseTo(ratioNow, 1);
      }
    }
  });
});
