import type { Rect } from "./types";

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

export const MIN_CROP = 16;

export function clampRect(r: Rect, bounds: { w: number; h: number }): Rect {
  const w = Math.min(Math.max(r.w, Math.min(MIN_CROP, bounds.w)), bounds.w);
  const h = Math.min(Math.max(r.h, Math.min(MIN_CROP, bounds.h)), bounds.h);
  return { x: Math.min(Math.max(r.x, 0), bounds.w - w), y: Math.min(Math.max(r.y, 0), bounds.h - h), w, h };
}

/** The largest rectangle of this ratio, centred in the bounds. */
export function rectForAspect(bounds: { w: number; h: number }, ratio: number): Rect {
  let w = bounds.w;
  let h = w / ratio;
  if (h > bounds.h) {
    h = bounds.h;
    w = h * ratio;
  }
  return { x: (bounds.w - w) / 2, y: (bounds.h - h) / 2, w, h };
}

/**
 * Drag a handle by (dx, dy). With a ratio the rectangle keeps it: corners follow the drag, edges grow from the
 * middle of their side. Always stays inside the bounds and above the minimum size.
 */
export function dragHandle(start: Rect, handle: Handle, dx: number, dy: number, bounds: { w: number; h: number }, ratio: number | null): Rect {
  if (handle === "move") {
    return { ...start, x: Math.min(Math.max(start.x + dx, 0), bounds.w - start.w), y: Math.min(Math.max(start.y + dy, 0), bounds.h - start.h) };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  if (handle.includes("w")) left += dx;
  if (handle.includes("e")) right += dx;
  if (handle.includes("n")) top += dy;
  if (handle.includes("s")) bottom += dy;
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(bounds.w, right);
  bottom = Math.min(bounds.h, bottom);

  if (ratio) {
    const cx = (start.x + start.w / 2);
    const cy = (start.y + start.h / 2);
    let w = right - left;
    let h = bottom - top;
    const horizontalOnly = handle === "e" || handle === "w";
    const verticalOnly = handle === "n" || handle === "s";
    if (horizontalOnly) h = w / ratio;
    else if (verticalOnly) w = h * ratio;
    else if (w / h > ratio) w = h * ratio;
    else h = w / ratio;
    // the most room the rectangle has, from the side opposite the handle to the edge of the picture (both ways for a corner of the
    // other axis), and the biggest width that fits it at this ratio: shrink to that, both sides together
    const availW = handle.includes("w") ? start.x + start.w : handle.includes("e") ? bounds.w - start.x : 2 * Math.min(cx, bounds.w - cx);
    const availH = handle.includes("n") ? start.y + start.h : handle.includes("s") ? bounds.h - start.y : 2 * Math.min(cy, bounds.h - cy);
    const maxW = Math.min(availW, availH * ratio);
    if (w > maxW) { w = maxW; h = w / ratio; }
    // anchor on the side opposite the handle
    const anchorX = handle.includes("w") ? start.x + start.w : handle.includes("e") ? start.x : cx - w / 2;
    const anchorY = handle.includes("n") ? start.y + start.h : handle.includes("s") ? start.y : cy - h / 2;
    left = handle.includes("w") ? anchorX - w : anchorX;
    top = handle.includes("n") ? anchorY - h : anchorY;
    right = left + w;
    bottom = top + h;
  }
  const r = { x: left, y: top, w: Math.max(MIN_CROP, right - left), h: Math.max(MIN_CROP, bottom - top) };
  return clampRect(r, bounds);
}

/**
 * Largest rectangle with the same aspect as a w x h image that still fits inside that image rotated by `deg`.
 * A corner (cw/2, ch/2) rotated back must land inside the original: cw*cos + ch*sin <= w and cw*sin + ch*cos <= h.
 */
export function inscribedScale(w: number, h: number, deg: number): number {
  const t = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return Math.min(1, w / (w * c + h * s), h / (w * s + h * c));
}

/** Size of the canvas that holds a w x h image rotated by `deg`. */
export function rotatedBounds(w: number, h: number, deg: number): { w: number; h: number } {
  const t = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  return { w: w * c + h * s, h: w * s + h * c };
}
