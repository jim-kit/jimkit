import { mirrorAngle, normAngle } from "./text";
import type { Stroke, TextItem } from "./types";

/**
 * Annotations live in base space, so when the picture is rotated a quarter turn or mirrored they have to move with
 * it or they'd end up on the wrong part of the photo. Both operations are done about the base canvas centre.
 */
type Pt = [number, number];

function mapPoints<T extends { points: Pt[] } | { x: number; y: number }>(items: T[], fn: (x: number, y: number) => Pt): T[] {
  return items.map((it) => {
    if ("points" in it) return { ...it, points: it.points.map(([x, y]) => fn(x, y)) };
    const [x, y] = fn(it.x, it.y);
    return { ...it, x, y };
  });
}

/** Rotate by 90 degrees about the centre of a w x h canvas, which becomes h x w. Positive is clockwise. Text turns with the picture. */
export function rotateAnnotations(strokes: Stroke[], texts: TextItem[], w: number, h: number, dir: 1 | -1): { strokes: Stroke[]; texts: TextItem[] } {
  const fn = (x: number, y: number): Pt => (dir === 1 ? [h - y, x] : [y, w - x]);
  const moved = mapPoints(texts, fn).map((t) => ({ ...t, rotation: normAngle(t.rotation + 90 * dir) }));
  return { strokes: mapPoints(strokes, fn), texts: moved };
}

/**
 * Mirror across the axis the picture is mirrored over. The picture is flipped before it is turned by `degrees`, so the
 * axis is the turned vertical (flipH) or horizontal (flipV) line through the centre. Text moves and its baseline is
 * reflected; the glyphs themselves never mirror. `stretch` is the picture's squish: the mirror happens in the unsquished
 * picture, so coordinates are brought out of the squish and back in around it.
 */
export function flipAnnotations(strokes: Stroke[], texts: TextItem[], w: number, h: number, degrees: number, axis: "h" | "v", stretch = { x: 1, y: 1 }): { strokes: Stroke[]; texts: TextItem[] } {
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const cx = w / 2;
  const cy = h / 2;
  const fn = (x: number, y: number): Pt => {
    // into the picture's own frame, mirror, and back out
    const dx = (x - cx) / stretch.x;
    const dy = (y - cy) / stretch.y;
    let px = dx * c + dy * s;
    let py = -dx * s + dy * c;
    if (axis === "h") px = -px;
    else py = -py;
    return [cx + (px * c - py * s) * stretch.x, cy + (px * s + py * c) * stretch.y];
  };
  const moved = mapPoints(texts, fn).map((t) => ({ ...t, rotation: mirrorAngle(t.rotation, degrees, axis) }));
  return { strokes: mapPoints(strokes, fn), texts: moved };
}
