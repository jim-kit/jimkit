"use client";

import { Link, Unlink } from "lucide-react";
import { useRef, useState } from "react";
import { haptic } from "@jimkit/ui";
import { NumField, Slider, Toggle } from "./controls";
import { sizeAfterEdit } from "./lib/editor/resize";
import type { ImageEditor } from "./useImageEditor";

/** Squish and stretch: the picture's width and height, together or apart. */
export function ResizePanel({ ed, big }: { ed: ImageEditor; big?: boolean }) {
  const [lock, setLock] = useState(true);
  const o = ed.outputSize;
  const st = ed.state.stretch;
  // the shape to keep while locked. It is remembered rather than read back, so rounding to whole pixels never drifts it.
  const ratio = useRef(o.w / o.h);
  if (Math.abs(o.w / o.h - ratio.current) / ratio.current > 0.01) ratio.current = o.w / o.h;
  const w = Math.round(o.w);
  const h = Math.round(o.h);
  const unstretched = { w: o.w / st.x, h: o.h / st.y };
  const changed = Math.abs(st.x - 1) > 1e-6 || Math.abs(st.y - 1) > 1e-6;

  const apply = (side: "w" | "h", v: number, live: boolean) => {
    const n = sizeAfterEdit(side, v, { w, h }, lock, ratio.current);
    ed.resizeTo(n.w, n.h, live);
  };
  const percent = (side: "w" | "h", pct: number, live: boolean) => {
    const v = (side === "w" ? unstretched.w : unstretched.h) * (pct / 100);
    apply(side, v, live);
  };
  const lg = big ? "lg" : "md";

  return (
    <div className={big ? "space-y-3.5" : "space-y-4"}>
      <div className="flex items-end gap-2">
        <NumField label="Width" value={w} min={1} max={65535} suffix="px" big={big} className="min-w-0 flex-1" onCommit={(v) => apply("w", v, false)} />
        <Toggle on={lock} onClick={() => { if (!lock) ratio.current = o.w / o.h; setLock(!lock); }} label={lock ? "Keep the shape" : "Free shape"} big={big}>
          {lock ? <Link size={big ? 18 : 14} /> : <Unlink size={big ? 18 : 14} />}
        </Toggle>
        <NumField label="Height" value={h} min={1} max={65535} suffix="px" big={big} className="min-w-0 flex-1" onCommit={(v) => apply("h", v, false)} />
      </div>
      <Slider size={lg} label="Width" value={Math.min(300, Math.max(10, Math.round(st.x * 100)))} min={10} max={300} neutral={100} onLive={(v) => percent("w", v, true)} onCommit={ed.endLive} format={(v) => `${v}%`} />
      <Slider size={lg} label="Height" value={Math.min(300, Math.max(10, Math.round(st.y * 100)))} min={10} max={300} neutral={100} onLive={(v) => percent("h", v, true)} onCommit={ed.endLive} format={(v) => `${v}%`} />
      <button
        onClick={() => { haptic("tap"); ed.resizeTo(unstretched.w, unstretched.h); }} disabled={!changed}
        className={`w-full border border-line text-dim transition hover:bg-tint disabled:opacity-30 ${big ? "h-11 rounded-2xl text-[14px]" : "rounded-lg py-2 text-[12.5px]"}`}
      >Back to the original shape</button>
      {!big && <p className="text-[12px] leading-relaxed text-faint">Drawings and text scale with the picture.</p>}
    </div>
  );
}
