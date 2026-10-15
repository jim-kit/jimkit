"use client";

import { motion } from "@jimkit/ui/motion";
import { useCallback, useRef, useState } from "react";
import { haptic } from "@jimkit/ui";

/**
 * A slider that works the same with a mouse, a finger or the keyboard. Dragging reports live values; letting go
 * reports a commit, so one drag is one undo step. Double-click (or double-tap) resets it.
 */
export function Slider({ label, value, min, max, step = 1, neutral = 0, onLive, onCommit, size = "md", format }: {
  label: string; value: number; min: number; max: number; step?: number; neutral?: number;
  onLive: (v: number) => void; onCommit: () => void; size?: "md" | "lg"; format?: (v: number) => string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const last = useRef(value);
  const frac = (value - min) / (max - min);
  const zero = (neutral - min) / (max - min);
  const big = size === "lg";

  const setFrom = useCallback((clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    let v = min + f * (max - min);
    v = Math.round(v / step) * step;
    // a little magnetism at the neutral point, with a tick you can feel
    if (Math.abs(v - neutral) <= (max - min) * 0.015) v = neutral;
    if (v !== last.current) {
      if (v === neutral) haptic("select");
      else if (Math.round(v) % 10 === 0 && Math.round(last.current) % 10 !== 0) haptic("tap");
      last.current = v;
      onLive(v);
    }
  }, [min, max, step, neutral, onLive]);

  const shown = format ? format(value) : Number.isInteger(value) ? String(value) : value.toFixed(1);
  return (
    <div className="select-none">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className={`${big ? "text-[15px]" : "text-[13px]"} text-dim`}>{label}</span>
        <span className={`${big ? "text-[15px]" : "text-[12px]"} tabular-nums ${value !== neutral ? "text-fg" : "text-faint"}`}>{shown}</span>
      </div>
      <div
        ref={track}
        role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
        className={`relative touch-none ${big ? "h-11" : "h-6"} cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-full`}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setDragging(true); last.current = value; setFrom(e.clientX); }}
        onPointerMove={(e) => dragging && setFrom(e.clientX)}
        onPointerUp={() => { setDragging(false); onCommit(); }}
        onPointerCancel={() => { setDragging(false); onCommit(); }}
        onDoubleClick={() => { onLive(neutral); onCommit(); haptic("success"); }}
        onKeyDown={(e) => {
          const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          onLive(Math.min(max, Math.max(min, value + d * step * (e.shiftKey ? 10 : 1))));
          onCommit();
        }}
      >
        <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-tint-2 ${big ? "h-2" : "h-1"}`} />
        <div
          className={`absolute top-1/2 -translate-y-1/2 rounded-full ${big ? "h-2" : "h-1"}`}
          style={{ left: `${Math.min(frac, zero) * 100}%`, width: `${Math.abs(frac - zero) * 100}%`, background: "var(--grad-h)" }}
        />
        {zero > 0 && zero < 1 && <div className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-white/30" style={{ left: `${zero * 100}%` }} />}
        <motion.div
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_10px_rgb(0_0_0/.5)] ${big ? "size-7" : "size-4"}`}
          style={{ left: `${frac * 100}%` }}
          animate={{ scale: dragging ? 1.25 : 1 }} transition={{ type: "spring", stiffness: 500, damping: 28 }}
        />
      </div>
    </div>
  );
}

const SWATCHES = ["#ffffff", "#0b0d12", "#ff4d6d", "#ff9f43", "#ffd93d", "#5eead4", "#4dabf7", "#8b93ff", "#c08bff", "#ff8ad8"];

/** A number you can type, with the arrow keys nudging it. Commits on Enter or when it loses focus; anything unreadable snaps back. */
export function NumField({ label, value, min, max, step = 1, suffix, onCommit, big, className = "" }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onCommit: (v: number) => void; big?: boolean; className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(Math.round(value * 10) / 10);
  const commit = (raw: string) => {
    setText(null);
    const v = Number.parseFloat(raw.replace(",", "."));
    if (Number.isFinite(v)) onCommit(Math.min(max, Math.max(min, v)));
  };
  return (
    <label className={`block ${className}`}>
      <span className={`mb-1 block ${big ? "text-[13px]" : "text-[11px]"} text-faint`}>{label}</span>
      <span className={`flex items-center border border-line-strong bg-field focus-within:border-accent/60 ${big ? "h-12 rounded-2xl px-3.5" : "h-9 rounded-lg px-2.5"}`}>
        <input
          value={shown} inputMode="decimal" aria-label={label}
          onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} onBlur={(e) => text !== null && commit(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            else if (e.key === "Escape") { setText(null); (e.target as HTMLInputElement).blur(); }
            else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              commit(String(value + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1)));
            }
          }}
          className={`min-w-0 flex-1 bg-transparent tabular-nums outline-none ${big ? "text-[16px]" : "text-[13px]"}`}
        />
        {suffix && <span className={`${big ? "text-[14px]" : "text-[12px]"} text-faint`}>{suffix}</span>}
      </span>
    </label>
  );
}

/** A pressed / not pressed button in the editor's usual style. */
export function Toggle({ on, onClick, children, label, big, className = "" }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string; big?: boolean; className?: string }) {
  return (
    <button
      onClick={() => { haptic("select"); onClick(); }} aria-pressed={on} aria-label={label} title={label}
      className={`flex items-center justify-center gap-1.5 border transition active:scale-95 ${big ? "h-11 min-w-11 rounded-2xl px-3.5 text-[14px]" : "h-9 min-w-9 rounded-lg px-2.5 text-[12.5px]"} ${on ? "border-accent/50 bg-accent/15 text-accent" : "border-line bg-tint text-dim hover:bg-tint-2"} ${className}`}
    >{children}</button>
  );
}

/** The ten swatches plus a picker for anything else. */
export function ColorRow({ value, onPick, big, allowNone, scroll }: { value: string | null; onPick: (c: string | null) => void; big?: boolean; allowNone?: boolean; scroll?: boolean }) {
  const dot = big ? "size-10" : "size-7";
  const custom = value !== null && !SWATCHES.includes(value);
  return (
    <div className={scroll ? "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-hide" : "flex flex-wrap gap-2"}>
      {allowNone && (
        <button onClick={() => onPick(null)} aria-label="No colour" aria-pressed={value === null} className={`${dot} relative shrink-0 overflow-hidden rounded-full border bg-tint ${value === null ? "ring-2 ring-fg/80 ring-offset-2 ring-offset-surface" : "border-line-strong"}`}>
          <span className="absolute left-1/2 top-1/2 h-px w-[130%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-bad" />
        </button>
      )}
      {SWATCHES.map((c) => (
        <button key={c} onClick={() => onPick(c)} aria-label={`Colour ${c}`} aria-pressed={value === c} className={`${dot} shrink-0 rounded-full border transition active:scale-90 ${value === c ? "ring-2 ring-fg/80 ring-offset-2 ring-offset-surface" : "border-line-strong"}`} style={{ background: c }} />
      ))}
      <label className={`${dot} relative shrink-0 overflow-hidden rounded-full border ${custom ? "ring-2 ring-fg/80 ring-offset-2 ring-offset-surface" : "border-line-strong"}`} title="Pick a colour" style={{ background: custom ? value! : "conic-gradient(#f43f5e, #facc15, #4ade80, #22d3ee, #6366f1, #d946ef, #f43f5e)" }}>
        <input type="color" value={value ?? "#ffffff"} onChange={(e) => onPick(e.target.value)} aria-label="Pick a colour" className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
    </div>
  );
}
