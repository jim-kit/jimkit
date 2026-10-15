import type { EditState, Stroke, TextItem } from "./types";

/** Longest side the tools accept. The canvas limit for actually saving it is checked on export. */
export const MAX_SIDE = 65535;

export interface Size {
  w: number;
  h: number;
}

/**
 * Scale the whole picture by kx across and ky down: the stretch, the crop, and everything drawn on it, so a drawing or a
 * label stays on the same part of the photo. Text and brush sizes follow the average of the two, since glyphs are not squished.
 */
export function resizeState(s: EditState, kx: number, ky: number): EditState {
  if (kx === 1 && ky === 1) return s;
  const k = Math.sqrt(kx * ky);
  const strokes: Stroke[] = s.strokes.map((st) => ({ ...st, size: st.size * k, points: st.points.map(([x, y]) => [x * kx, y * ky] as [number, number]) }));
  const texts: TextItem[] = s.texts.map((t) => ({ ...t, x: t.x * kx, y: t.y * ky, size: t.size * k }));
  const crop = s.crop && { x: s.crop.x * kx, y: s.crop.y * ky, w: s.crop.w * kx, h: s.crop.h * ky };
  return { ...s, stretch: { x: s.stretch.x * kx, y: s.stretch.y * ky }, crop, strokes, texts };
}

/** Round to whole pixels, at least 1 and at most MAX_SIDE. */
export const clampSide = (v: number): number => Math.min(MAX_SIDE, Math.max(1, Math.round(Number.isFinite(v) ? v : 1)));

/**
 * What the other side becomes when one is typed. With the lock on, `ratio` (width over height) is kept; with it off the
 * other side stays. Both are clamped, and if the lock would push the other side past the limit the typed one gives way.
 */
export function sizeAfterEdit(side: "w" | "h", value: number, current: Size, lock: boolean, ratio: number): Size {
  let v = clampSide(value);
  if (!lock || !(ratio > 0)) return side === "w" ? { w: v, h: current.h } : { w: current.w, h: v };
  let other = side === "w" ? v / ratio : v * ratio;
  if (other > MAX_SIDE) {
    v = Math.round(v * (MAX_SIDE / other));
    other = MAX_SIDE;
  }
  const o = clampSide(other);
  return side === "w" ? { w: v, h: o } : { w: o, h: v };
}

/** The size as a share of the picture before it was stretched (100 is how it started). */
export const percentOf = (stretch: number): number => Math.round(stretch * 1000) / 10;
