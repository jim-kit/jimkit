/** Accent colours: six presets by name, or any colour as `hex-rrggbb`. Pure, so the server layout and the settings panel share it. */

export const ACCENT_PRESETS = ["blue", "teal", "green", "orange", "pink", "purple", "ink"] as const;
export const DEFAULT_CUSTOM = "#0d6efd";

const HEX = /^hex-([0-9a-f]{6})$/;

export const isAccent = (v: unknown): v is string => typeof v === "string" && ((ACCENT_PRESETS as readonly string[]).includes(v) || HEX.test(v));

/** "#0D6EFD" or "0d6efd" -> "hex-0d6efd"; anything else -> null */
export function customAccent(color: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  return m ? `hex-${m[1].toLowerCase()}` : null;
}

/** the colour of a custom accent, or null for a preset */
export function accentHex(accent: string): string | null {
  const m = HEX.exec(accent);
  return m ? `#${m[1]}` : null;
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function analyse(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const luminance = 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
  return { r, g, b, fg: luminance > 0.38 ? "#111418" : "#ffffff" };
}

/** Page backgrounds as relative luminance (the themes' light and dark surfaces are close enough to share these two). */
const BG_LUM = { light: 0.85, dark: 0.01 };

/**
 * A custom colour close to the page's own (pale yellow on a light page, deep navy on a dark one) would vanish, so it is moved along its
 * own lightness until it has a contrast of 2.2 with the page: darker on light, lighter on dark. Hue and saturation stay.
 */
export function fitAccent(hex: string, mode: "dark" | "light"): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  let l = (mx + mn) / 2;
  const sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const rgbAt = (L: number) => {
    const c = (1 - Math.abs(2 * L - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = L - c / 2;
    const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [Math.round((rr + m) * 255), Math.round((gg + m) * 255), Math.round((bb + m) * 255)];
  };
  const contrast = (L: number) => { const [rr, gg, bb] = rgbAt(L); const y = 0.2126 * lin(rr / 255) + 0.7152 * lin(gg / 255) + 0.0722 * lin(bb / 255); const bg = BG_LUM[mode]; return (Math.max(y, bg) + 0.05) / (Math.min(y, bg) + 0.05); };
  if (contrast(l) >= 2.2) return hex;
  const step = mode === "light" ? -0.01 : 0.01;
  for (let i = 0; i < 100 && contrast(l) < 2.2; i++) l = Math.min(1, Math.max(0, l + step));
  return "#" + rgbAt(l).map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** the CSS variables a custom accent sets on <html>; empty for a preset (the stylesheet knows those, "ink" included) */
export function accentVars(accent: string, mode: "dark" | "light" = "dark"): Record<string, string> {
  const picked = accentHex(accent);
  if (!picked) return {};
  // a colour without a hue (any grey, black or white) can't have a look of its own: it does what the ink accent does and follows the page
  const n = parseInt(picked.slice(1), 16);
  const spread = Math.max(n >> 16, (n >> 8) & 255, n & 255) - Math.min(n >> 16, (n >> 8) & 255, n & 255);
  if (spread <= 16) return mode === "dark" ? { "--accent": "#f1f3f5", "--accent-fg": "#111418", "--accent-rgb": "241 243 245" } : { "--accent": "#212529", "--accent-fg": "#ffffff", "--accent-rgb": "33 37 41" };
  const hex = fitAccent(picked, mode);
  const a = analyse(hex);
  return { "--accent": hex, "--accent-fg": a.fg, "--accent-rgb": `${a.r} ${a.g} ${a.b}` };
}
