import type { Adjust, FilterId } from "./types";

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function isNeutral(a: Adjust): boolean {
  return a.exposure === 0 && a.brightness === 0 && a.contrast === 0 && a.saturation === 0 && a.warmth === 0 && a.sharpen === 0 && a.vignette === 0;
}

/** 4x5 colour matrices (rows R, G, B, A; last column is an offset in 0..255 units). */
const M = (r: number[], g: number[], b: number[]) => [...r, ...g, ...b, 0, 0, 0, 1, 0];
const LUMA = [0.299, 0.587, 0.114];
const MONO = M([...LUMA, 0, 0], [...LUMA, 0, 0], [...LUMA, 0, 0]);

export const FILTER_MATRICES: Record<Exclude<FilterId, "none">, number[]> = {
  mono: MONO,
  noir: M([0.38, 0.75, 0.14, 0, -38], [0.38, 0.75, 0.14, 0, -38], [0.38, 0.75, 0.14, 0, -38]),
  sepia: M([0.393, 0.769, 0.189, 0, 0], [0.349, 0.686, 0.168, 0, 0], [0.272, 0.534, 0.131, 0, 0]),
  vivid: M([1.25, -0.12, -0.06, 0, -6], [-0.06, 1.22, -0.06, 0, -6], [-0.06, -0.12, 1.25, 0, -6]),
  fade: M([0.86, 0.1, 0.04, 0, 26], [0.04, 0.9, 0.06, 0, 24], [0.04, 0.1, 0.8, 0, 28]),
  warm: M([1.12, 0.04, 0, 0, 8], [0, 1.02, 0, 0, 2], [0, 0, 0.86, 0, -6]),
  cool: M([0.9, 0, 0.02, 0, -4], [0, 1.0, 0.04, 0, 0], [0.02, 0.06, 1.14, 0, 10]),
  dramatic: M([1.3, -0.2, 0, 0, -28], [-0.1, 1.2, -0.1, 0, -28], [0, -0.2, 1.3, 0, -28]),
  vintage: M([0.62, 0.42, 0.12, 0, 22], [0.22, 0.66, 0.1, 0, 16], [0.18, 0.3, 0.42, 0, 26]),
};

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: "none", label: "Original" }, { id: "vivid", label: "Vivid" }, { id: "warm", label: "Warm" }, { id: "cool", label: "Cool" },
  { id: "mono", label: "Mono" }, { id: "noir", label: "Noir" }, { id: "sepia", label: "Sepia" }, { id: "fade", label: "Fade" },
  { id: "vintage", label: "Vintage" }, { id: "dramatic", label: "Drama" },
];

/** Per-channel lookup for exposure, brightness and contrast (they only depend on the channel value). */
function tonalLut(a: Adjust): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const gain = Math.pow(2, a.exposure / 100);
  const add = a.brightness * 1.27;
  const c = a.contrast * 2.55;
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  for (let i = 0; i < 256; i++) lut[i] = clamp((i * gain + add - 128) * factor + 128);
  return lut;
}

/** Unsharp-style sharpen: out = in + amount * (in - neighbourhood average). */
function sharpen(px: Pixels, amount: number): void {
  const { data, width: w, height: h } = px;
  const src = new Uint8ClampedArray(data);
  const k = amount / 100;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const around = (src[i - 4 + ch] + src[i + 4 + ch] + src[i - w * 4 + ch] + src[i + w * 4 + ch]) / 4;
        data[i + ch] = clamp(src[i + ch] + k * 1.5 * (src[i + ch] - around));
      }
    }
  }
}

/** Applies the adjustments and then the filter, in place. Alpha is left alone. */
export function applyAdjust(px: Pixels, a: Adjust, filter: FilterId = "none", filterAmount = 100): void {
  const { data, width: w, height: h } = px;
  const tonal = a.exposure !== 0 || a.brightness !== 0 || a.contrast !== 0;
  const lut = tonal ? tonalLut(a) : null;
  const sat = 1 + a.saturation / 100;
  const warm = a.warmth * 0.3;
  const vig = a.vignette / 100;
  const m = filter !== "none" ? FILTER_MATRICES[filter] : null;
  const amt = Math.min(1, Math.max(0, filterAmount / 100));
  const cx = w / 2;
  const cy = h / 2;
  const maxD = Math.hypot(cx, cy) || 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      if (lut) { r = lut[r]; g = lut[g]; b = lut[b]; }
      if (a.saturation !== 0) {
        const gray = r * 0.299 + g * 0.587 + b * 0.114;
        r = clamp(gray + (r - gray) * sat);
        g = clamp(gray + (g - gray) * sat);
        b = clamp(gray + (b - gray) * sat);
      }
      if (warm !== 0) { r = clamp(r + warm); b = clamp(b - warm); }
      if (m) {
        const nr = m[0] * r + m[1] * g + m[2] * b + m[4];
        const ng = m[5] * r + m[6] * g + m[7] * b + m[9];
        const nb = m[10] * r + m[11] * g + m[12] * b + m[14];
        r = clamp(r + (nr - r) * amt);
        g = clamp(g + (ng - g) * amt);
        b = clamp(b + (nb - b) * amt);
      }
      if (vig > 0) {
        const d = Math.hypot(x - cx, y - cy) / maxD;
        const f = 1 - vig * Math.max(0, d - 0.35) * 1.5;
        r *= f; g *= f; b *= f;
      }
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }
  if (a.sharpen > 0) sharpen(px, a.sharpen);
}
