import { describe, expect, it } from "vitest";
import { MIN_TEXT_SIZE, angleFromPointer, cornerPoint, hitText, layoutText, mirrorAngle, newText, normAngle, pickHandleSide, pinchText, rotateHandlePoint, scaleFromCorner, snapAngle, toLocal, toWorld, topmostHit } from "../src/lib/editor/text";

// every character is half the font size wide, which keeps the numbers round
const measure = (line: string, font: string) => line.length * Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]) * 0.5;
const base = newText({ id: "a", text: "abcd", x: 500, y: 300, size: 40, shadow: false });
const layout = (t = base) => layoutText(t, measure);

describe("text layout", () => {
  it("measures the widest line and counts lines for the height, with padding", () => {
    const l = layout(newText({ id: "a", text: "ab\nabcdef", x: 0, y: 0, size: 40 }));
    expect(l.lines).toHaveLength(2);
    expect(l.lineW).toEqual([40, 120]);
    expect(l.pad).toBeCloseTo(40 * 0.22);
    expect(l.w).toBeCloseTo(120 + 2 * l.pad);
    expect(l.h).toBeCloseTo(2 * 48 + 2 * l.pad);
  });
  it("scales with the font size", () => {
    const a = layout(base);
    const b = layout({ ...base, size: 80 });
    expect(b.w).toBeCloseTo(a.w * 2);
    expect(b.h).toBeCloseTo(a.h * 2);
  });
});

describe("angles", () => {
  it("normalises into -180..180", () => {
    expect(normAngle(190)).toBe(-170);
    expect(normAngle(-190)).toBe(170);
    expect(normAngle(360)).toBe(0);
    expect(normAngle(180)).toBe(180);
  });
  it("snaps near quarter and eighth turns, and to 15 degree steps with shift", () => {
    expect(snapAngle(2, false)).toBe(0);
    expect(snapAngle(88, false)).toBe(90);
    expect(snapAngle(43, false)).toBe(45);
    expect(snapAngle(20, false)).toBe(20); // not near anything
    expect(snapAngle(22, true)).toBe(15);
    expect(snapAngle(23, true)).toBe(30);
    expect(snapAngle(-178, false)).toBe(180);
  });
  it("mirroring a text across the vertical axis of an untilted picture negates its angle", () => {
    expect(mirrorAngle(30, 0, "h")).toBeCloseTo(-30);
    expect(mirrorAngle(30, 0, "v")).toBeCloseTo(-30);
    expect(mirrorAngle(0, 0, "h")).toBeCloseTo(0);
  });
  it("mirroring twice returns the angle, for any tilt", () => {
    for (const deg of [0, 90, 7, -23, 180]) for (const axis of ["h", "v"] as const) {
      expect(mirrorAngle(mirrorAngle(25, deg, axis), deg, axis)).toBeCloseTo(25);
    }
  });
});

describe("hit testing respects rotation", () => {
  const l = layout();
  const wide = newText({ id: "w", text: "abcdefghij", x: 500, y: 300, size: 40 }); // much wider than tall
  const lw = layout(wide);

  it("hits the centre and misses outside", () => {
    expect(hitText(base, l, 500, 300)).toBe(true);
    expect(hitText(base, l, 500 + l.w, 300)).toBe(false);
  });
  it("a wide text turned a quarter hits along the vertical, not the horizontal", () => {
    const x = lw.w / 2 - 4; // just inside the end of the unturned box
    expect(hitText(wide, lw, 500 + x, 300)).toBe(true);
    expect(hitText(wide, lw, 500, 300 + x)).toBe(false);
    const turned = { ...wide, rotation: 90 };
    expect(hitText(turned, lw, 500, 300 + x)).toBe(true);
    expect(hitText(turned, lw, 500 + x, 300)).toBe(false);
  });
  it("slop widens the box", () => {
    expect(hitText(base, l, 500 + l.w / 2 + 5, 300)).toBe(false);
    expect(hitText(base, l, 500 + l.w / 2 + 5, 300, 8)).toBe(true);
  });
  it("picks the text drawn last when they overlap", () => {
    const top = { ...base, id: "top" };
    expect(topmostHit([base, top], layout, 500, 300)?.id).toBe("top");
    expect(topmostHit([base, top], layout, 5000, 5000)).toBeNull();
  });
  it("local and world coordinates are inverses", () => {
    const t = { x: 100, y: 50, rotation: 37 };
    const [lx, ly] = toLocal(t, 160, 90);
    const [wx, wy] = toWorld(t, lx, ly);
    expect(wx).toBeCloseTo(160);
    expect(wy).toBeCloseTo(90);
  });
});

describe("handles", () => {
  const l = layout();
  it("corners turn with the text", () => {
    const [x, y] = cornerPoint({ ...base, rotation: 90 }, l, "se");
    // the south-east corner of a box turned a quarter clockwise is where the south-west one was
    expect(x).toBeCloseTo(500 - l.h / 2);
    expect(y).toBeCloseTo(300 + l.w / 2);
  });
  it("the turn handle sits above the top edge, and dragging to it gives back the angle", () => {
    for (const rot of [0, 30, -75, 135]) {
      const t = { ...base, rotation: rot };
      const [hx, hy] = rotateHandlePoint(t, l, 30);
      expect(angleFromPointer(t, hx, hy)).toBeCloseTo(normAngle(rot));
    }
  });
  it("a handle on any edge gives back the angle too", () => {
    for (const side of ["top", "right", "bottom", "left"] as const) {
      for (const rot of [0, 30, -75, 135]) {
        const t = { ...base, rotation: rot };
        const [hx, hy] = rotateHandlePoint(t, l, 30, side);
        expect(angleFromPointer(t, hx, hy, side)).toBeCloseTo(normAngle(rot));
      }
    }
  });
  it("the turn handle stays on top while it has room and moves to another edge when it has not", () => {
    const view = { x0: 0, y0: 0, x1: 1000, y1: 600 };
    expect(pickHandleSide({ ...base, x: 500, y: 300 }, l, 30, view, 16)).toBe("top");
    expect(pickHandleSide({ ...base, x: 500, y: 20 }, l, 30, view, 16)).toBe("bottom");
    // turned a quarter anticlockwise near the left edge, its top edge faces out of the picture
    expect(pickHandleSide({ ...base, x: 40, y: 300, rotation: -90 }, l, 30, view, 16)).toBe("bottom");
    // nothing fits at all: still answers, with the least clipped edge
    expect(["top", "bottom", "left", "right"]).toContain(pickHandleSide({ ...base, x: 5, y: 5 }, l, 30, { x0: 0, y0: 0, x1: 20, y1: 20 }, 16));
  });
  it("dragging a corner keeps the opposite corner fixed and the shape unchanged", () => {
    for (const rot of [0, 40]) {
      const t = { ...base, rotation: rot };
      const anchor = cornerPoint(t, l, "nw");
      const target = cornerPoint({ ...t }, l, "se");
      // drag the south-east corner to twice as far along the diagonal
      const px = anchor[0] + (target[0] - anchor[0]) * 2;
      const py = anchor[1] + (target[1] - anchor[1]) * 2;
      const r = scaleFromCorner(t, l, "se", px, py);
      expect(r.size).toBeCloseTo(t.size * 2);
      const after = { ...t, ...r };
      const l2 = layout(after);
      const a2 = cornerPoint(after, l2, "nw");
      expect(a2[0]).toBeCloseTo(anchor[0]);
      expect(a2[1]).toBeCloseTo(anchor[1]);
    }
  });
  it("never shrinks below the minimum size", () => {
    const anchor = cornerPoint(base, l, "nw");
    expect(scaleFromCorner(base, l, "se", anchor[0], anchor[1]).size).toBeCloseTo(MIN_TEXT_SIZE);
  });
});

describe("two-finger gesture", () => {
  const start = { x: 100, y: 100, size: 40, rotation: 10 };
  it("scales by the spread, turns by the swing and follows the middle", () => {
    const r = pinchText(start, [[0, 0], [100, 0]], [[10, 10], [10, 210]]);
    expect(r.size).toBeCloseTo(80);
    expect(r.rotation).toBeCloseTo(100);
    expect(r.x).toBeCloseTo(100 + (10 - 50));
    expect(r.y).toBeCloseTo(100 + (110 - 0));
  });
  it("fingers that haven't moved change nothing", () => {
    expect(pinchText(start, [[0, 0], [100, 0]], [[0, 0], [100, 0]])).toEqual(start);
  });
});
