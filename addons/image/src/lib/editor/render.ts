import { applyAdjust, isNeutral } from "./adjust";
import { rotatedBounds } from "./crop";
import { halveOnce } from "./export-size";
import { clampSide, resizeState } from "./resize";
import { drawText } from "./text-draw";
import type { EditState, Rect, Stroke } from "./types";

export type Drawable = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

export interface Source {
  image: Drawable;
  width: number;
  height: number;
}

/** The picture after rotation and straightening, before it is squished. */
export function turnedSize(src: { width: number; height: number }, s: Pick<EditState, "rotation" | "straighten">): { w: number; h: number } {
  const quarter = s.rotation === 90 || s.rotation === 270;
  const w = quarter ? src.height : src.width;
  const h = quarter ? src.width : src.height;
  return s.straighten === 0 ? { w, h } : rotatedBounds(w, h, s.straighten);
}

/** Size of the working canvas ("base space") after rotation, flipping, straightening and stretching. */
export function baseSize(src: { width: number; height: number }, s: Pick<EditState, "rotation" | "straighten" | "stretch">): { w: number; h: number } {
  const t = turnedSize(src, s);
  return { w: t.w * s.stretch.x, h: t.h * s.stretch.y };
}

export function outputSize(src: { width: number; height: number }, s: EditState): { w: number; h: number } {
  return s.crop ? { w: s.crop.w, h: s.crop.h } : baseSize(src, s);
}

const canvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

/** Cached stages, so dragging an adjustment slider doesn't redo the rotation and annotations don't redo the pixels. */
export interface RenderCache {
  /** the source shrunk by whole halvings, when the target is much smaller */
  shrunk?: { key: string; canvas: HTMLCanvasElement };
  transformed?: { key: string; canvas: HTMLCanvasElement };
  adjusted?: { key: string; canvas: HTMLCanvasElement };
}

/** The source, halved as many times as it takes to be within a factor of two of the size it is drawn at. */
function sourceFor(src: Source, s: EditState, scale: number, cache: RenderCache): Drawable {
  const quarter = s.rotation === 90 || s.rotation === 270;
  const to = { w: src.width * (quarter ? s.stretch.y : s.stretch.x) * scale, h: src.height * (quarter ? s.stretch.x : s.stretch.y) * scale };
  let size = { w: src.width, h: src.height };
  let next = halveOnce(size, to);
  if (!next) return src.image;
  const key = `${to.w.toFixed(1)}x${to.h.toFixed(1)}`;
  if (cache.shrunk?.key === key) return cache.shrunk.canvas;
  let cur: Drawable = src.image;
  while (next) {
    const c = canvas(next.w, next.h);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, size.w, size.h, 0, 0, c.width, c.height);
    if (cur !== src.image) (cur as HTMLCanvasElement).width = 0; // let go of the step before
    cur = c;
    size = next;
    next = halveOnce(size, to);
  }
  cache.shrunk = { key, canvas: cur as HTMLCanvasElement };
  return cur;
}

function transformed(src: Source, s: EditState, scale: number, flatten: boolean, cache: RenderCache): HTMLCanvasElement {
  const key = `${s.rotation}|${s.flipH}|${s.flipV}|${s.straighten}|${s.stretch.x}|${s.stretch.y}|${scale}|${flatten}`;
  if (cache.transformed?.key === key) return cache.transformed.canvas;
  const b = baseSize(src, s);
  const c = canvas(b.w * scale, b.h * scale);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  // JPEG has no transparency: put the picture on white so straightened corners don't turn black
  if (flatten) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  const image = sourceFor(src, s, scale, cache);
  // The rotation is set up inside save/restore so the context is left clean. Export draws the annotations straight onto
  // this canvas, and a leftover "translate to the centre" would shift every stroke and text by half the picture.
  ctx.save();
  ctx.translate(c.width / 2, c.height / 2);
  ctx.scale(s.stretch.x, s.stretch.y);
  ctx.rotate(((s.rotation + s.straighten) * Math.PI) / 180);
  ctx.scale(s.flipH ? -1 : 1, s.flipV ? -1 : 1);
  ctx.drawImage(image, (-src.width / 2) * scale, (-src.height / 2) * scale, src.width * scale, src.height * scale);
  ctx.restore();
  cache.transformed = { key, canvas: c };
  cache.adjusted = undefined;
  return c;
}

function adjusted(src: Source, s: EditState, scale: number, flatten: boolean, cache: RenderCache): HTMLCanvasElement {
  const t = transformed(src, s, scale, flatten, cache);
  if (isNeutral(s.adjust) && s.filter === "none") return t;
  const key = `${cache.transformed!.key}|${JSON.stringify(s.adjust)}|${s.filter}|${s.filterAmount}`;
  if (cache.adjusted?.key === key) return cache.adjusted.canvas;
  const c = canvas(t.width, t.height);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(t, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  applyAdjust(img, s.adjust, s.filter, s.filterAmount);
  ctx.putImageData(img, 0, 0);
  cache.adjusted = { key, canvas: c };
  return c;
}

export function drawStroke(ctx: CanvasRenderingContext2D, st: Stroke, scale: number): void {
  if (!st.points.length) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = st.color;
  ctx.fillStyle = st.color;
  ctx.lineWidth = st.size * scale;
  ctx.globalAlpha = st.kind === "marker" ? 0.4 : 1;
  const pts = st.points;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0] * scale, pts[0][1] * scale, (st.size * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // one path, smoothed through midpoints, so a translucent marker doesn't darken where it overlaps itself
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * scale, pts[0][1] * scale);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = ((pts[i][0] + pts[i + 1][0]) / 2) * scale;
      const my = ((pts[i][1] + pts[i + 1][1]) / 2) * scale;
      ctx.quadraticCurveTo(pts[i][0] * scale, pts[i][1] * scale, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0] * scale, last[1] * scale);
    ctx.stroke();
  }
  ctx.restore();
}

export interface ComposeOptions {
  scale: number;
  /** draw annotations straight onto the working canvas instead of a copy. Only safe when the cache is thrown away (export). */
  inPlace?: boolean;
  /** apply the crop; false shows the whole working canvas (used while cropping) */
  crop: boolean;
  /** strokes still being drawn */
  liveStroke?: Stroke | null;
  /** hide one text item (it is being edited as a DOM overlay) */
  skipText?: string | null;
  /** paint the picture on white first (JPEG has no transparency) */
  flatten?: boolean;
}

/** Draws the finished picture at `scale` (1 = full resolution). */
export function compose(src: Source, s: EditState, o: ComposeOptions, cache: RenderCache): HTMLCanvasElement {
  const base = adjusted(src, s, o.scale, !!o.flatten, cache);
  const full = o.inPlace ? base : canvas(base.width, base.height);
  const ctx = full.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0); // annotations are placed in plain canvas pixels, whatever this context did before
  if (!o.inPlace) ctx.drawImage(base, 0, 0);
  for (const st of s.strokes) drawStroke(ctx, st, o.scale);
  if (o.liveStroke) drawStroke(ctx, o.liveStroke, o.scale);
  for (const t of s.texts) if (t.id !== o.skipText) drawText(ctx, t, o.scale);
  if (!o.crop || !s.crop) return full;
  return cropCanvas(full, s.crop, o.scale);
}

function cropCanvas(full: HTMLCanvasElement, r: Rect, scale: number): HTMLCanvasElement {
  const out = canvas(r.w * scale, r.h * scale);
  out.getContext("2d")!.drawImage(full, Math.round(r.x * scale), Math.round(r.y * scale), out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export interface ExportOptions {
  type: "image/png" | "image/jpeg" | "image/webp" | "image/avif";
  /** 0..1 */
  quality: number;
  /** the picture's size in pixels */
  width: number;
  height: number;
}

/** Can this browser really hold a canvas of this size? Asks for one and touches the far corner. */
export function canvasWorks(w: number, h: number): boolean {
  try {
    const c = canvas(w, h);
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    ctx.fillStyle = "#000";
    ctx.fillRect(c.width - 1, c.height - 1, 1, 1);
    const ok = ctx.getImageData(c.width - 1, c.height - 1, 1, 1).data[3] === 255;
    c.width = 0;
    return ok;
  } catch {
    return false;
  }
}

/** The state as it should be drawn at exactly width x height: stretched, with the crop and everything on it carried along. */
export function stateForSize(src: Source, s: EditState, width: number, height: number): EditState {
  const out = outputSize(src, s);
  return resizeState(s, clampSide(width) / out.w, clampSide(height) / out.h);
}

/** Renders at the requested size and encodes it. */
export async function exportImage(src: Source, s: EditState, o: ExportOptions): Promise<Blob> {
  const st = stateForSize(src, s, o.width, o.height);
  const work = baseSize(src, st);
  if (!canvasWorks(work.w, work.h)) throw new Error("Not enough memory for this size. Try a smaller one.");
  const c = compose(src, st, { scale: 1, crop: true, inPlace: true, flatten: o.type === "image/jpeg" }, {});
  try {
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, o.type, o.quality));
    if (!blob) throw new Error("Couldn't save the picture. Try a smaller size or another format.");
    if (blob.type && blob.type !== o.type) throw new Error("This browser can't save that format. Pick another.");
    return blob;
  } finally {
    c.width = 0;
  }
}

/**
 * A small encoded sample at the export's own pixel density, for estimating the file size. Returns the bytes and the sample's pixel count.
 */
export async function sampleExport(src: Source, s: EditState, o: ExportOptions, longest = 900): Promise<{ bytes: number; pixels: number }> {
  const k = Math.min(1, longest / Math.max(o.width, o.height));
  const st = stateForSize(src, s, o.width * k, o.height * k);
  const c = compose(src, st, { scale: 1, crop: true, inPlace: true, flatten: o.type === "image/jpeg" }, {});
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, o.type, o.quality));
  return { bytes: blob?.size ?? 0, pixels: c.width * c.height };
}

/** Best-effort decode. HEIC and other formats the browser can't read fail here with a clear error. */
export async function loadSource(file: File): Promise<Source> {
  try {
    const bmp = await createImageBitmap(file);
    return { image: bmp, width: bmp.width, height: bmp.height };
  } catch {
    throw new Error("This browser can't open that image type. Convert it to JPG or PNG first.");
  }
}
