"use client";

import { useEffect, useRef, useState } from "react";

/** colour maths: h in degrees, s and v in 0..1 */
export interface Hsv { h: number; s: number; v: number }

export function hexToHsv(hex: string): Hsv | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`;
}

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** Drag inside an element: calls back with the pointer's position as 0..1 fractions. Keeps tracking outside the element. */
function useDrag(onMove: (x: number, y: number) => void) {
  const el = useRef<HTMLDivElement>(null);
  const at = (e: React.PointerEvent) => {
    const r = el.current!.getBoundingClientRect();
    onMove(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height));
  };
  return {
    ref: el,
    onPointerDown: (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); at(e); },
    onPointerMove: (e: React.PointerEvent) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e); },
  };
}

/**
 * A colour picker: a square for saturation and brightness, a strip for the hue. Pointer and keyboard (arrows, Shift for big steps).
 * `onChange` gets "#rrggbb", at most once per frame while dragging.
 */
export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? { h: 215, s: 0.95, v: 0.99 });
  const frame = useRef(0);
  const last = useRef(value.toLowerCase());

  // a change that came from outside (the hex box, a preset) replaces what we show, but a grey keeps the hue you were on
  useEffect(() => {
    if (value.toLowerCase() === last.current) return;
    const next = hexToHsv(value);
    if (next) { last.current = value.toLowerCase(); setHsv((p) => ({ h: next.s === 0 || next.v === 0 ? p.h : next.h, s: next.s, v: next.v })); }
  }, [value]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const set = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    last.current = hex;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => onChange(hex));
  };

  const sv = useDrag((x, y) => set({ ...hsv, s: x, v: 1 - y }));
  const hue = useDrag((x) => set({ ...hsv, h: x * 360 }));
  const step = (e: React.KeyboardEvent) => (e.shiftKey ? 0.1 : 0.02);
  const svKeys = (e: React.KeyboardEvent) => {
    const d = step(e);
    const m: Record<string, Hsv> = {
      ArrowLeft: { ...hsv, s: clamp(hsv.s - d) }, ArrowRight: { ...hsv, s: clamp(hsv.s + d) },
      ArrowUp: { ...hsv, v: clamp(hsv.v + d) }, ArrowDown: { ...hsv, v: clamp(hsv.v - d) },
    };
    if (m[e.key]) { e.preventDefault(); set(m[e.key]); }
  };
  const hueKeys = (e: React.KeyboardEvent) => {
    const d = step(e) * 100;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); set({ ...hsv, h: (hsv.h - d + 360) % 360 }); }
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); set({ ...hsv, h: (hsv.h + d) % 360 }); }
  };

  const pure = `hsl(${hsv.h} 100% 50%)`;
  const thumb = "pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/.45),0_1px_4px_rgb(0_0_0/.5)]";
  return (
    <div className="select-none">
      <div
        {...sv} role="slider" tabIndex={0} aria-label="Saturation and brightness" aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        onKeyDown={svKeys} className="relative h-40 w-full cursor-crosshair touch-none rounded-lg"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}
      >
        <span className={thumb} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }} />
      </div>
      <div
        {...hue} role="slider" tabIndex={0} aria-label="Hue" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)}
        onKeyDown={hueKeys} className="relative mt-3 h-3.5 w-full cursor-pointer touch-none rounded-full"
        style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
      >
        <span className={thumb} style={{ left: `${(hsv.h / 360) * 100}%`, top: "50%", background: pure }} />
      </div>
    </div>
  );
}

/** Black or white text, whichever reads better on this "#rrggbb" background. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const lin = (i: number) => { const v = parseInt(m[1].slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4) > 0.38 ? "#10131a" : "#ffffff";
}

