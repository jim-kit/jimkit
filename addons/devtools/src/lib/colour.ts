/** Colour parsing, conversion (CSS Color 4: sRGB, HSL, OKLab/OKLCH), WCAG contrast and palette steps. */

/** sRGB with 0..1 channels (gamma-encoded, as in CSS), alpha 0..1 */
export interface Rgb { r: number; g: number; b: number; a: number }
export interface Oklch { l: number; c: number; h: number; a: number }

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mod360 = (h: number) => ((h % 360) + 360) % 360;

/* ───────── sRGB <-> linear <-> OKLab ───────── */

const toLinear = (c: number) => (Math.abs(c) <= 0.04045 ? c / 12.92 : Math.sign(c) * ((Math.abs(c) + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (Math.abs(c) <= 0.0031308 ? c * 12.92 : Math.sign(c) * (1.055 * Math.abs(c) ** (1 / 2.4) - 0.055));

export function rgbToOklab({ r, g, b }: Rgb): [number, number, number] {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** Not clipped: channels can fall outside 0..1 when the colour is outside the sRGB gamut */
export function oklabToRgb(L: number, a: number, b: number, alpha = 1): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    a: alpha,
  };
}

export function rgbToOklch(c: Rgb): Oklch {
  const [l, a, b] = rgbToOklab(c);
  const chroma = Math.hypot(a, b);
  return { l, c: chroma, h: chroma < 1e-4 ? 0 : mod360((Math.atan2(b, a) * 180) / Math.PI), a: c.a };
}

const oklchToRgbRaw = ({ l, c, h, a }: Oklch): Rgb => oklabToRgb(l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180), a);

const EPS = 1e-6;
export const inGamut = ({ r, g, b }: Rgb) => [r, g, b].every((x) => x >= -EPS && x <= 1 + EPS);
export const clip = (c: Rgb): Rgb => ({ r: clamp01(c.r), g: clamp01(c.g), b: clamp01(c.b), a: clamp01(c.a) });

const deltaEOK = (x: Rgb, y: Rgb) => { const p = rgbToOklab(x), q = rgbToOklab(y); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

/** CSS Color 4 gamut mapping: keep lightness and hue, shrink the chroma until the clipped colour is within a just-noticeable difference (0.02) of the original. */
export function oklchToRgb(c: Oklch): Rgb {
  if (c.l >= 1) return { r: 1, g: 1, b: 1, a: c.a };
  if (c.l <= 0) return { r: 0, g: 0, b: 0, a: c.a };
  const first = oklchToRgbRaw(c);
  if (inGamut(first)) return clip(first);
  const JND = 0.02, eps = 0.0001;
  let min = 0, max = c.c, minInGamut = true;
  let current = { ...c };
  let clipped = clip(first);
  if (deltaEOK(clipped, first) < JND) return clipped;
  while (max - min > eps) {
    current = { ...c, c: (min + max) / 2 };
    const raw = oklchToRgbRaw(current);
    if (minInGamut && inGamut(raw)) { min = current.c; continue; }
    clipped = clip(raw);
    const e = deltaEOK(clipped, raw);
    if (e < JND) {
      if (JND - e < eps) return clipped;
      minInGamut = false;
      min = current.c;
    } else max = current.c;
  }
  return clipped;
}

/* ───────── HSL ───────── */

export function rgbToHsl({ r, g, b, a }: Rgb): { h: number; s: number; l: number; a: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l, a };
}

export function hslToRgb(h: number, s: number, l: number, a = 1): Rgb {
  const k = (n: number) => (n + mod360(h) / 30) % 12;
  const f = (n: number) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0), g: f(8), b: f(4), a };
}

/* ───────── parsing ───────── */

const NAMED: Record<string, string> = {
  black: "000000", white: "ffffff", red: "ff0000", lime: "00ff00", blue: "0000ff", yellow: "ffff00", cyan: "00ffff", aqua: "00ffff", magenta: "ff00ff", fuchsia: "ff00ff",
  gray: "808080", grey: "808080", silver: "c0c0c0", maroon: "800000", olive: "808000", green: "008000", purple: "800080", teal: "008080", navy: "000080",
  orange: "ffa500", pink: "ffc0cb", brown: "a52a2a", gold: "ffd700", indigo: "4b0082", violet: "ee82ee", tomato: "ff6347", coral: "ff7f50", salmon: "fa8072",
  crimson: "dc143c", turquoise: "40e0d0", skyblue: "87ceeb", rebeccapurple: "663399", transparent: "00000000",
};

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length <= 4) h = Array.from(h, (c) => c + c).join("");
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
}

const NUM = "[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?";
const ARG = new RegExp(`^(${NUM})(%|deg|turn|rad|grad)?$`, "i");

function arg(s: string): { v: number; unit: string } | null {
  const m = ARG.exec(s);
  return m ? { v: Number(m[1]), unit: (m[2] ?? "").toLowerCase() } : null;
}

const hueDeg = (a: { v: number; unit: string }) => (a.unit === "turn" ? a.v * 360 : a.unit === "rad" ? (a.v * 180) / Math.PI : a.unit === "grad" ? a.v * 0.9 : a.v);
const alphaOf = (s: string | undefined) => { if (s === undefined) return 1; const a = arg(s); return a ? clamp01(a.unit === "%" ? a.v / 100 : a.v) : NaN; };

/** hex, rgb()/rgba(), hsl()/hsla(), oklch(), and a few colour names; the comma and the space syntax both work */
export function parseColour(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const named = NAMED[s];
  if (named) return hexToRgb(named);
  const hex = hexToRgb(s);
  if (hex) return hex;
  const fn = /^(rgba?|hsla?|oklch)\(\s*(.*?)\s*\)$/.exec(s);
  if (!fn) return null;
  const [, name, body] = fn;
  const [main, slashAlpha] = body.split("/").map((x) => x.trim());
  let parts = main.split(/[\s,]+/).filter(Boolean);
  let alpha = slashAlpha;
  if (alpha === undefined && parts.length === 4) { alpha = parts[3]; parts = parts.slice(0, 3); }
  if (parts.length !== 3) return null;
  const a = alphaOf(alpha);
  if (Number.isNaN(a)) return null;
  const v = parts.map(arg);
  if (v.some((x) => !x)) return null;
  const [p, q, r] = v as { v: number; unit: string }[];
  if (name.startsWith("rgb")) {
    const ch = (x: { v: number; unit: string }) => clamp01(x.unit === "%" ? x.v / 100 : x.v / 255);
    return { r: ch(p), g: ch(q), b: ch(r), a };
  }
  if (name.startsWith("hsl")) return hslToRgb(hueDeg(p), clamp01(q.v / 100), clamp01(r.v / 100), a);
  const L = p.unit === "%" ? p.v / 100 : p.v;
  const C = q.unit === "%" ? (q.v / 100) * 0.4 : q.v;
  return oklchToRgb({ l: Math.min(1, Math.max(0, L)), c: Math.max(0, C), h: mod360(hueDeg(r)), a });
}

/* ───────── output ───────── */

const to255 = (x: number) => Math.round(clamp01(x) * 255);
const round = (x: number, d: number) => { const k = 10 ** d; return String(Math.round(x * k) / k).replace(/^-0$/, "0"); };
const alphaPart = (a: number, pct = false) => (a >= 1 ? "" : ` / ${pct ? `${round(a * 100, 1)}%` : round(a, 3)}`);

export function toHex(c: Rgb): string {
  const h = (x: number) => to255(x).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${c.a < 1 ? h(c.a) : ""}`;
}
export const toRgbString = (c: Rgb) => `rgb(${to255(c.r)} ${to255(c.g)} ${to255(c.b)}${alphaPart(c.a)})`;
export function toHslString(c: Rgb): string {
  const { h, s, l, a } = rgbToHsl({ r: clamp01(c.r), g: clamp01(c.g), b: clamp01(c.b), a: c.a });
  return `hsl(${round(h, 1)} ${round(s * 100, 1)}% ${round(l * 100, 1)}%${alphaPart(a)})`;
}
export function toOklchString(c: Rgb): string {
  const o = rgbToOklch(c);
  return `oklch(${round(o.l * 100, 2)}% ${round(o.c, 4)} ${round(o.c < 1e-4 ? 0 : o.h, 2)}${alphaPart(o.a)})`;
}

/* ───────── contrast (WCAG 2.x) ───────── */

export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(clamp01(r)) + 0.7152 * toLinear(clamp01(g)) + 0.0722 * toLinear(clamp01(b));
}

/** a colour with transparency, laid over an opaque background */
export const over = (fg: Rgb, bg: Rgb): Rgb => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });

export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = luminance(over(fg, bg)), b = luminance({ ...bg, a: 1 });
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function verdicts(ratio: number) {
  return { aaNormal: ratio >= 4.5, aaLarge: ratio >= 3, aaaNormal: ratio >= 7, aaaLarge: ratio >= 4.5, ui: ratio >= 3 };
}

/* ───────── palette ───────── */

/** `steps` colours from the original towards white (or black): lightness moves in equal steps in OKLCH, hue stays, chroma is gamut-mapped. */
export function ramp(c: Rgb, dir: "lighter" | "darker", steps: number): Rgb[] {
  const o = rgbToOklch(c);
  const target = dir === "lighter" ? 0.98 : 0.12;
  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / (steps + 1);
    const l = o.l + (target - o.l) * t;
    // near-white and near-black can't carry the full chroma, so ease it off along the way
    return oklchToRgb({ l, c: o.c * (1 - 0.6 * t * t), h: o.h, a: c.a });
  });
}

/** The same lightness and chroma at other hues */
export function rotate(c: Rgb, degrees: number): Rgb {
  const o = rgbToOklch(c);
  return oklchToRgb({ ...o, h: mod360(o.h + degrees) });
}

/* ───────── recommended contrast ───────── */

/** Passes every test the tool shows (the strictest one, AAA for normal text, decides). */
export const passesAll = (ratio: number) => Object.values(verdicts(ratio)).every(Boolean);

export type Recommendation =
  | { kind: "passes" }
  | { kind: "found"; colour: Rgb; ratio: number; distance: number }
  | { kind: "impossible"; best: number };

/**
 * The colour nearest to the current one (distance in OKLab) that passes every test against the other colour.
 * `side` is the one that may change. The hue stays; lightness moves whichever way is nearer, and chroma gives way where the
 * sRGB gamut or the lightness leaves no room for it. The result is a real 8-bit colour, so what is checked is what gets used.
 */
export function recommend(fg: Rgb, bg: Rgb, side: "fg" | "bg"): Recommendation {
  const cur = side === "fg" ? fg : bg;
  const ratioOf = (x: Rgb) => (side === "fg" ? contrastRatio(x, bg) : contrastRatio(fg, x));
  if (passesAll(ratioOf(cur))) return { kind: "passes" };

  const stored = (x: Rgb) => hexToRgb(toHex(x))!; // through hex and back: what "Use" will really put in the box
  const grey = (v: number): Rgb => stored({ r: v, g: v, b: v, a: cur.a });
  const extremes = [grey(0), grey(1)];
  if (!extremes.some((x) => passesAll(ratioOf(x)))) return { kind: "impossible", best: Math.max(...extremes.map(ratioOf)) };

  const o = rgbToOklch(cur);
  const raw = (l: number, c: number) => oklchToRgbRaw({ l, c, h: o.h, a: cur.a });
  /** the widest chroma that stays inside sRGB at this lightness, up to the colour's own */
  const room = (l: number) => {
    if (o.c === 0 || inGamut(raw(l, o.c))) return o.c;
    let lo = 0, hi = o.c;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (inGamut(raw(l, m))) lo = m; else hi = m; }
    return lo;
  };

  // on a line of constant hue the distance is plain geometry: lightness difference and chroma difference
  let best: { l: number; c: number; d: number } | null = null;
  const scan = (l0: number, l1: number, nl: number, c0: number, c1: number, nc: number) => {
    for (let i = 0; i <= nl; i++) {
      const l = Math.min(1, Math.max(0, l0 + ((l1 - l0) * i) / nl));
      const top = room(l);
      const lo = Math.max(0, c0), hi = Math.min(top, c1);
      if (hi < lo) continue;
      for (let j = 0; j <= nc; j++) {
        const c = lo + ((hi - lo) * j) / nc;
        const d = Math.hypot(l - o.l, c - o.c);
        if ((!best || d < best.d) && passesAll(ratioOf(clip(raw(l, c))))) best = { l, c, d };
      }
    }
  };
  scan(0, 1, 200, 0, Infinity, 40);
  let dl = 1 / 200, dc = Math.max(o.c / 40, 1e-3);
  for (let i = 0; i < 5 && best; i++) {
    const b: { l: number; c: number } = best;
    scan(b.l - dl, b.l + dl, 20, b.c - dc, b.c + dc, 20);
    dl *= 0.2; dc *= 0.2;
  }

  // the best point is real-valued; pick the 8-bit colour around it that still passes and is nearest to where we started
  const [L0, a0, b0] = rgbToOklab(cur);
  const near = (x: Rgb) => { const [l, a, b] = rgbToOklab(x); return Math.hypot(l - L0, a - a0, b - b0); };
  const centre = clip(raw((best as { l: number } | null)?.l ?? o.l, (best as { c: number } | null)?.c ?? 0));
  for (const reach of [2, 8]) {
    let pick: { colour: Rgb; d: number } | null = null;
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) for (let k = -reach; k <= reach; k++) {
      const colour = stored({ r: Math.round(centre.r * 255 + i) / 255, g: Math.round(centre.g * 255 + j) / 255, b: Math.round(centre.b * 255 + k) / 255, a: cur.a });
      if (colour.r < 0 || colour.g < 0 || colour.b < 0 || colour.r > 1 || colour.g > 1 || colour.b > 1) continue;
      if (!passesAll(ratioOf(colour))) continue;
      const d = near(colour);
      if (!pick || d < pick.d) pick = { colour, d };
    }
    if (pick) return { kind: "found", colour: pick.colour, ratio: ratioOf(pick.colour), distance: pick.d };
  }
  // cannot happen with a grid this fine, but never leave the caller without an answer that passes
  const colour = extremes.filter((x) => passesAll(ratioOf(x))).sort((p, q) => near(p) - near(q))[0];
  return { kind: "found", colour, ratio: ratioOf(colour), distance: near(colour) };
}
