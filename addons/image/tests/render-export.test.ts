import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compose } from "../src/lib/editor/render";
import { newText } from "../src/lib/editor/text";
import { INITIAL, type EditState, type Stroke, type TextItem } from "../src/lib/editor/types";

/**
 * A recording stand-in for a 2D canvas that tracks the transform matrix the way a real one does. It exists to catch one
 * class of bug: drawing annotations while a leftover transform (translate to centre, rotate) is still set on the context.
 */
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

interface Seen { kind: "move" | "arc" | "text"; x: number; y: number }

class FakeCtx {
  m: Matrix = [...IDENTITY];
  stack: Matrix[] = [];
  seen: Seen[] = [];
  globalAlpha = 1;
  save() { this.stack.push([...this.m]); }
  restore() { this.m = this.stack.pop() ?? [...IDENTITY]; }
  translate(x: number, y: number) { this.m = mul(this.m, [1, 0, 0, 1, x, y]); }
  rotate(a: number) { this.m = mul(this.m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); }
  scale(x: number, y: number) { this.m = mul(this.m, [x, 0, 0, y, 0, 0]); }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.m = [a, b, c, d, e, f]; }
  private dev(x: number, y: number) { return { x: this.m[0] * x + this.m[2] * y + this.m[4], y: this.m[1] * x + this.m[3] * y + this.m[5] }; }
  moveTo(x: number, y: number) { this.seen.push({ kind: "move", ...this.dev(x, y) }); }
  arc(x: number, y: number) { this.seen.push({ kind: "arc", ...this.dev(x, y) }); }
  fillText(_t: string, x: number, y: number) { this.seen.push({ kind: "text", ...this.dev(x, y) }); }
  strokeText() {}
  lineTo() {} quadraticCurveTo() {} beginPath() {} stroke() {} fill() {} drawImage() {} measureText() { return { width: 10 }; }
  getImageData(w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  putImageData() {}
  clearRect() {}
  imageSmoothingQuality = "high";
}

class FakeCanvas {
  width = 0; height = 0;
  private ctx = new FakeCtx();
  getContext() { return this.ctx; }
}

const created: FakeCanvas[] = [];
let saved: unknown;

beforeEach(() => {
  saved = (globalThis as { document?: unknown }).document;
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => { const c = new FakeCanvas(); created.push(c); return c; },
  };
});
afterEach(() => {
  (globalThis as unknown as { document: unknown }).document = saved;
  created.length = 0;
});

const src = { image: {} as never, width: 4000, height: 3000 };
const stroke: Stroke = { id: "s", kind: "pen", color: "#fff", size: 8, points: [[2000, 1500], [2100, 1500]] };
const text: TextItem = newText({ id: "t", text: "hi", x: 1800, y: 1400, size: 40, shadow: false });
const withAnnotations: EditState = { ...INITIAL, strokes: [stroke], texts: [text] };

/** device-space positions of everything drawn by annotations, across all canvases created */
const drawn = () => created.flatMap((c) => (c.getContext() as FakeCtx).seen);

describe("annotations land where they were drawn", () => {
  for (const inPlace of [false, true]) {
    it(`full-size render (${inPlace ? "in place, as export does" : "copying"}) draws strokes at their base coordinates and text about its centre`, () => {
      compose(src, withAnnotations, { scale: 1, crop: false, inPlace }, {});
      const pts = drawn();
      expect(pts.find((p) => p.kind === "move")).toMatchObject({ x: 2000, y: 1500 });
      expect(pts.find((p) => p.kind === "text")).toMatchObject({ x: 1800, y: 1400 });
    });
  }
  it("a half-size preview scales them to half", () => {
    compose(src, withAnnotations, { scale: 0.5, crop: false }, {});
    expect(drawn().find((p) => p.kind === "move")).toMatchObject({ x: 1000, y: 750 });
  });
  it("a single tap (a dot) is placed correctly too", () => {
    compose(src, { ...INITIAL, strokes: [{ ...stroke, points: [[2000, 1500]] }] }, { scale: 1, crop: false, inPlace: true }, {});
    expect(drawn().find((p) => p.kind === "arc")).toMatchObject({ x: 2000, y: 1500 });
  });
  it("still correct after a straighten and a crop", () => {
    const tilted: EditState = { ...withAnnotations, straighten: 6, crop: { x: 100, y: 100, w: 3000, h: 2000 } };
    compose(src, tilted, { scale: 1, crop: true, inPlace: true }, {});
    // the annotation is drawn in base space before cropping, so its device position is unchanged by the crop step
    expect(drawn().find((p) => p.kind === "move")).toMatchObject({ x: 2000, y: 1500 });
  });
});
