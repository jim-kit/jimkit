import { clampSide, type Size } from "./resize";

/** What one canvas can hold. Browsers differ and none of them says, so this is a safe figure per kind of device. */
export interface Limits {
  maxSide: number;
  maxArea: number;
}

export const DESKTOP_LIMITS: Limits = { maxSide: 32767, maxArea: 134_217_728 };
export const PHONE_LIMITS: Limits = { maxSide: 16384, maxArea: 33_554_432 };

export function limitsFor(env: { userAgent: string; coarsePointer: boolean }): Limits {
  const phone = /iphone|ipad|ipod|android/i.test(env.userAgent) || env.coarsePointer;
  return phone ? PHONE_LIMITS : DESKTOP_LIMITS;
}

export const fits = (s: Size, l: Limits): boolean => s.w <= l.maxSide && s.h <= l.maxSide && s.w * s.h <= l.maxArea;

/** The biggest size with this shape that fits, rounded down so it really does. */
export function largestFit(s: Size, l: Limits): Size {
  if (fits(s, l)) return s;
  const k = Math.min(l.maxSide / s.w, l.maxSide / s.h, Math.sqrt(l.maxArea / (s.w * s.h)));
  let w = Math.max(1, Math.floor(s.w * k));
  let h = Math.max(1, Math.floor(s.h * k));
  while (!fits({ w, h }, l) && (w > 1 || h > 1)) {
    w = Math.max(1, w - 1);
    h = Math.max(1, Math.round((w * s.h) / s.w));
  }
  return { w, h };
}

export interface ExportPlan {
  ok: boolean;
  /** the biggest output of this shape the browser can make */
  max: Size;
  message: string | null;
}

/**
 * Can the browser make an output of this size? `work` is the full picture at that scale: a crop is cut from it, so it has to
 * fit too. When it does not, `max` is the largest output with the same shape that does.
 */
export function planExport(out: Size, work: Size, l: Limits): ExportPlan {
  if (fits(out, l) && fits(work, l)) return { ok: true, max: out, message: null };
  const k = Math.min(1, largestFit(work, l).w / work.w, largestFit(out, l).w / out.w);
  const max = { w: Math.max(1, Math.floor(out.w * k)), h: Math.max(1, Math.floor(out.h * k)) };
  const mp = Math.round(l.maxArea / 1e6);
  return {
    ok: false, max,
    message: `Too large for this browser. The limit is about ${mp} megapixels and ${l.maxSide} px on a side.`,
  };
}

/** Preset buttons: a percentage of the picture's own size, or a longest side. Never a zero side. */
export function presetSize(out: Size, preset: { percent: number } | { longest: number }): Size {
  if ("percent" in preset) return { w: clampSide((out.w * preset.percent) / 100), h: clampSide((out.h * preset.percent) / 100) };
  const k = preset.longest / Math.max(out.w, out.h);
  return { w: clampSide(out.w * k), h: clampSide(out.h * k) };
}

/** One halving step toward `to`, or null when the picture is already within a factor of two of it. */
export function halveOnce(from: Size, to: Size): Size | null {
  const w = from.w / 2 >= to.w && from.w > 1 ? Math.max(1, Math.round(from.w / 2)) : from.w;
  const h = from.h / 2 >= to.h && from.h > 1 ? Math.max(1, Math.round(from.h / 2)) : from.h;
  return w === from.w && h === from.h ? null : { w, h };
}

/**
 * Whole halvings from `from` down to within a factor of two of `to`. One big step down (say 6000 to 600) skips pixels
 * and looks rough; halving until it is close averages them properly.
 */
export function halvingPlan(from: Size, to: Size): Size[] {
  const steps: Size[] = [];
  for (let cur = halveOnce(from, to); cur; cur = halveOnce(cur, to)) steps.push(cur);
  return steps;
}

/** File size from a small encoded sample: the same picture, so the bytes per pixel carry over. */
export const estimateBytes = (sampleBytes: number, samplePixels: number, targetPixels: number): number =>
  samplePixels > 0 ? Math.round((sampleBytes / samplePixels) * targetPixels) : 0;
