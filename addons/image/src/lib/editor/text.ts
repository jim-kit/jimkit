import type { FontId, TextItem } from "./types";

/** A few stacks every system has something for. The first entry is what the editor starts with. */
export const FONTS: { id: FontId; label: string; stack: string }[] = [
  { id: "sans", label: "Sans", stack: '"Geist", ui-sans-serif, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  { id: "serif", label: "Serif", stack: 'Georgia, "Times New Roman", "Noto Serif", serif' },
  { id: "mono", label: "Mono", stack: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' },
  { id: "display", label: "Display", stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif' },
  { id: "hand", label: "Hand", stack: '"Segoe Script", "Bradley Hand", "Comic Sans MS", "Comic Neue", cursive' },
];

export const LINE_HEIGHT = 1.2;
/** room around the glyphs, as a share of the font size. It is the background box and the selection box. */
export const PAD = 0.22;
export const MIN_TEXT_SIZE = 6;
export const MAX_TEXT_SIZE = 20000;

export const fontCss = (t: Pick<TextItem, "font" | "bold" | "italic">, px: number): string => {
  const stack = (FONTS.find((f) => f.id === t.font) ?? FONTS[0]).stack;
  return `${t.italic ? "italic " : ""}${t.bold ? 700 : 400} ${px}px ${stack}`;
};

/** width of one line in the given CSS font. The browser supplies it (canvas measureText); tests pass a stand-in. */
export type Measure = (line: string, font: string) => number;

export interface Layout {
  lines: string[];
  lineW: number[];
  lineH: number;
  pad: number;
  /** the box, padding included */
  w: number;
  h: number;
}

const REF = 100;

export function layoutText(t: TextItem, measure: Measure): Layout {
  const lines = t.text.split("\n");
  const font = fontCss(t, REF);
  const k = t.size / REF;
  const lineW = lines.map((l) => measure(l || " ", font) * k);
  const lineH = t.size * LINE_HEIGHT;
  const pad = t.size * PAD;
  return { lines, lineW, lineH, pad, w: Math.max(...lineW) + pad * 2, h: lines.length * lineH + pad * 2 };
}

/* ───────── angles ───────── */

/** Into (-180, 180]. */
export function normAngle(deg: number): number {
  let d = ((deg % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/** Shift snaps to steps; otherwise a turn that lands near a quarter or an eighth of a turn is pulled onto it. */
export function snapAngle(deg: number, shift: boolean, near = 4, step = 15): number {
  const d = normAngle(deg);
  if (shift) return normAngle(Math.round(d / step) * step);
  const eighth = Math.round(d / 45) * 45;
  return Math.abs(d - eighth) <= near ? normAngle(eighth) : d;
}

/**
 * The angle a text should have after the picture is mirrored. `degrees` is the picture's turn (rotation + straighten) and
 * `axis` the mirror, as in flipAnnotations. The baseline is reflected, then the reading direction is kept: glyphs never mirror.
 */
export function mirrorAngle(theta: number, degrees: number, axis: "h" | "v"): number {
  const alpha = axis === "h" ? 90 + degrees : degrees;
  const line = 2 * alpha - theta;
  // the same line, read the other way round, is the other candidate: keep the one nearest to a plain left-right mirror
  const want = -theta;
  const a = normAngle(line);
  const b = normAngle(line + 180);
  const dist = (x: number) => Math.abs(normAngle(x - want));
  return dist(a) <= dist(b) ? a : b;
}

/* ───────── geometry ───────── */

const rad = (d: number) => (d * Math.PI) / 180;

/** a point in base space, relative to the text's centre and un-turned */
export function toLocal(t: Pick<TextItem, "x" | "y" | "rotation">, px: number, py: number): [number, number] {
  const a = rad(-t.rotation);
  const dx = px - t.x;
  const dy = py - t.y;
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}

export function toWorld(t: Pick<TextItem, "x" | "y" | "rotation">, lx: number, ly: number): [number, number] {
  const a = rad(t.rotation);
  return [t.x + lx * Math.cos(a) - ly * Math.sin(a), t.y + lx * Math.sin(a) + ly * Math.cos(a)];
}

/** Is the point inside the (turned) box? `slop` widens it, in base pixels, for fat fingers. */
export function hitText(t: TextItem, l: Pick<Layout, "w" | "h">, px: number, py: number, slop = 0): boolean {
  const [x, y] = toLocal(t, px, py);
  return Math.abs(x) <= l.w / 2 + slop && Math.abs(y) <= l.h / 2 + slop;
}

/** The text on top at that point (the last one drawn), or null. */
export function topmostHit(texts: TextItem[], layoutOf: (t: TextItem) => Pick<Layout, "w" | "h">, px: number, py: number, slop = 0): TextItem | null {
  for (let i = texts.length - 1; i >= 0; i--) if (hitText(texts[i], layoutOf(texts[i]), px, py, slop)) return texts[i];
  return null;
}

export type Corner = "nw" | "ne" | "se" | "sw";
const SIGN: Record<Corner, [number, number]> = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };
const OPPOSITE: Record<Corner, Corner> = { nw: "se", ne: "sw", se: "nw", sw: "ne" };

export function cornerPoint(t: TextItem, l: Pick<Layout, "w" | "h">, c: Corner): [number, number] {
  return toWorld(t, (SIGN[c][0] * l.w) / 2, (SIGN[c][1] * l.h) / 2);
}

export type HandleSide = "top" | "right" | "bottom" | "left";
/** which way each side points, in the text's own un-turned frame (degrees, y down) */
const SIDE_DEG: Record<HandleSide, number> = { top: -90, right: 0, bottom: 90, left: 180 };
const SIDES: HandleSide[] = ["top", "bottom", "right", "left"];

/** Where the turn handle sits: outside the middle of the given edge (the top one unless it has no room), `gap` base pixels clear of it. */
export function rotateHandlePoint(t: TextItem, l: Pick<Layout, "w" | "h">, gap: number, side: HandleSide = "top"): [number, number] {
  const a = rad(SIDE_DEG[side]);
  const reach = (side === "top" || side === "bottom" ? l.h : l.w) / 2 + gap;
  return toWorld(t, Math.cos(a) * reach, Math.sin(a) * reach);
}

/** The angle that puts the turn handle, wherever it sits, under the pointer. */
export function angleFromPointer(t: Pick<TextItem, "x" | "y">, px: number, py: number, side: HandleSide = "top"): number {
  return normAngle((Math.atan2(py - t.y, px - t.x) * 180) / Math.PI - SIDE_DEG[side]);
}

export interface Bounds { x0: number; y0: number; x1: number; y1: number }

/**
 * The edge to hang the turn handle on: the top one, unless it would fall outside `view` (same units as the text), then the
 * bottom, right and left. `margin` is how much room the handle itself needs. If nothing fits, the least clipped one.
 */
export function pickHandleSide(t: TextItem, l: Pick<Layout, "w" | "h">, gap: number, view: Bounds, margin: number): HandleSide {
  let best: HandleSide = "top";
  let least = Infinity;
  for (const side of SIDES) {
    const [x, y] = rotateHandlePoint(t, l, gap, side);
    const out = Math.max(0, view.x0 + margin - x) + Math.max(0, x - (view.x1 - margin)) + Math.max(0, view.y0 + margin - y) + Math.max(0, y - (view.y1 - margin));
    if (out === 0) return side;
    if (out < least) { least = out; best = side; }
  }
  return best;
}

/**
 * Drag a corner: the opposite corner stays where it is, and the text grows or shrinks along the diagonal so its shape never
 * changes. `start` and `l` are the text as it was when the drag began.
 */
export function scaleFromCorner(start: TextItem, l: Pick<Layout, "w" | "h">, corner: Corner, px: number, py: number): Pick<TextItem, "size" | "x" | "y"> {
  const [ox, oy] = SIGN[OPPOSITE[corner]];
  const anchorL: [number, number] = [(ox * l.w) / 2, (oy * l.h) / 2];
  const [ax, ay] = toWorld(start, anchorL[0], anchorL[1]);
  const [lx, ly] = toLocal(start, px, py);
  const vx = lx - anchorL[0];
  const vy = ly - anchorL[1];
  const dx = -anchorL[0] * 2;
  const dy = -anchorL[1] * 2;
  let k = (vx * dx + vy * dy) / (dx * dx + dy * dy);
  k = Math.min(Math.max(k, MIN_TEXT_SIZE / start.size), MAX_TEXT_SIZE / start.size);
  const [cx, cy] = toWorld({ x: 0, y: 0, rotation: start.rotation }, -anchorL[0] * k, -anchorL[1] * k);
  return { size: start.size * k, x: ax + cx, y: ay + cy };
}

/** Two fingers on a text: scale by how far apart they got, turn by how far they swung, follow the middle. */
export function pinchText(start: Pick<TextItem, "x" | "y" | "size" | "rotation">, from: [[number, number], [number, number]], to: [[number, number], [number, number]]): Pick<TextItem, "x" | "y" | "size" | "rotation"> {
  const d0 = Math.hypot(from[0][0] - from[1][0], from[0][1] - from[1][1]) || 1;
  const d1 = Math.hypot(to[0][0] - to[1][0], to[0][1] - to[1][1]) || 1;
  const a0 = Math.atan2(from[1][1] - from[0][1], from[1][0] - from[0][0]);
  const a1 = Math.atan2(to[1][1] - to[0][1], to[1][0] - to[0][0]);
  const m0: [number, number] = [(from[0][0] + from[1][0]) / 2, (from[0][1] + from[1][1]) / 2];
  const m1: [number, number] = [(to[0][0] + to[1][0]) / 2, (to[0][1] + to[1][1]) / 2];
  const size = Math.min(Math.max(start.size * (d1 / d0), MIN_TEXT_SIZE), MAX_TEXT_SIZE);
  return { size, rotation: normAngle(start.rotation + ((a1 - a0) * 180) / Math.PI), x: start.x + m1[0] - m0[0], y: start.y + m1[1] - m0[1] };
}

/** Text that is not on the picture any more (dragged away, or the crop moved) can still be picked up: keep its centre in range. */
export function keepInside(t: { x: number; y: number }, bounds: { w: number; h: number }): { x: number; y: number } {
  return { x: Math.min(Math.max(t.x, 0), bounds.w), y: Math.min(Math.max(t.y, 0), bounds.h) };
}

export function newText(over: Partial<TextItem> & Pick<TextItem, "id" | "x" | "y" | "size">): TextItem {
  return {
    text: "Your text", rotation: 0, color: "#ffffff", font: "sans", bold: true, italic: false, align: "center", opacity: 1,
    outline: 0, outlineColor: "#000000", shadow: true, bg: null, ...over,
  };
}
