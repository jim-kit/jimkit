"use client";

import { ColorPicker, Icon, hsvToHex, toast, Btn } from "@jimkit/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ToolInit } from "@jimkit/sdk";
import { isHueValue } from "./arrange";
import type { ToolEntry } from "./catalog";
import { useApp } from "./providers";

/* The small pieces the home screen is made of, shared by the built-in layout and the layout API (layout-host.tsx). */

export function useActivate() {
  const { session, openTool } = useApp();
  return (t: ToolEntry, init?: ToolInit) => {
    if (t.unavailable) return void toast(`${t.name} isn't available here`, { description: t.unavailable });
    if (t.status === "soon") return void toast(`${t.name} is coming soon`);
    if (t.trusted && session.tier === "public") return void toast(`${t.name} needs the unlock code`, { description: "Open Settings and enter it." });
    openTool(t.id, init);
  };
}


const SWATCHES = [0, 25, 55, 90, 140, 175, 205, 250, 280, 310, 340];

/** The two small buttons a tool gets while editing: star it, and give it its own colour. */
export function ToolMarks({ tool, className = "", align = "right", labelled, up }: { tool: ToolEntry; className?: string; align?: "left" | "right"; labelled?: boolean; up?: boolean }) {
  const { favourites, toggleFavourite, toolHues, setToolHue } = useApp();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [shift, setShift] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const fav = favourites.includes(tool.id);
  const chosen = toolHues[tool.id];

  // a tap anywhere else, or Escape, closes the colour popover (touch has no hover to leave)
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) { setOpen(false); setCustom(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setCustom(false); } };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc); };
  }, [open]);

  // the popover is wider than a Metro tile: slide it back inside the window when it would run off an edge
  useLayoutEffect(() => {
    const el = pop.current;
    if (!open || !el) return setShift(0);
    el.style.transform = "";
    const r = el.getBoundingClientRect();
    const edge = 8;
    setShift(r.left < edge ? edge - r.left : r.right > window.innerWidth - edge ? window.innerWidth - edge - r.right : 0);
  }, [open, custom]);
  const exact = chosen && !isHueValue(chosen) ? `#${chosen}` : undefined;
  const btn = labelled
    ? "flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-dim transition hover:bg-tint-2 hover:text-fg"
    : className.includes("absolute")
      ? "grid size-7 place-items-center rounded-md text-current opacity-80 transition hover:bg-tint-2 hover:opacity-100 [@media(pointer:coarse)]:size-9"
      // in a row with the move buttons: the same size and colour as they are
      : "grid size-8 shrink-0 place-items-center rounded-lg text-dim transition hover:bg-tint-2 hover:text-fg";
  return (
    // the card behind is a drag handle; these buttons must not start a drag
    <div ref={root} className={`${open ? "z-30" : "z-10"} flex items-center ${className.includes("absolute") ? "" : "relative"} ${className}`} onPointerDown={(e) => e.stopPropagation()}>
      {open && (
        <div ref={pop} style={shift ? { transform: `translateX(${shift}px)` } : undefined} role="group" aria-label="Colour" className={`absolute z-20 ${up ? "bottom-full mb-1.5" : "top-full mt-1.5"} ${align === "left" ? "left-0" : "right-0"} flex ${custom ? "w-[236px]" : "w-[172px]"} flex-wrap items-center gap-1.5 rounded-xl border border-line-strong bg-surface p-2 text-fg shadow-lg`}>
          {SWATCHES.map((h) => (
            <button key={h} aria-label={`Colour ${h}`} onClick={() => { setToolHue(tool.id, String(h)); setOpen(false); }} className="size-5 rounded-full [@media(pointer:coarse)]:size-7" style={{ background: `oklch(0.62 0.15 ${h})`, boxShadow: chosen === String(h) ? "0 0 0 2px var(--color-surface), 0 0 0 4px currentColor" : undefined }} />
          ))}
          <button onClick={() => setCustom(!custom)} aria-expanded={custom} className="rounded-md px-1.5 py-0.5 text-[12px] text-dim hover:bg-tint-2 [@media(pointer:coarse)]:px-2.5 [@media(pointer:coarse)]:py-2" style={exact ? { boxShadow: `inset 0 -2px 0 ${exact}` } : undefined}>Custom</button>
          <button onClick={() => { setToolHue(tool.id, null); setOpen(false); setCustom(false); }} className="rounded-md px-1.5 py-0.5 text-[12px] text-dim hover:bg-tint-2 [@media(pointer:coarse)]:px-2.5 [@media(pointer:coarse)]:py-2">Default</button>
          {custom && (
            <div className="w-full pt-1">
              <ColorPicker value={exact ?? hsvToHex({ h: isHueValue(chosen) ? Number(chosen) : 215, s: 0.7, v: 0.85 })} onChange={(hex) => setToolHue(tool.id, hex.replace("#", "").toLowerCase())} />
            </div>
          )}
        </div>
      )}
      <button aria-label={fav ? "Remove from favourites" : "Add to favourites"} title={fav ? "Remove from favourites" : "Add to favourites"} aria-pressed={fav} onClick={() => toggleFavourite(tool.id)} className={btn}>
        <Icon name="Star" size={15} className={fav ? "fill-current" : ""} />{labelled && "Favourite"}
      </button>
      <button aria-label="Colour" title="Choose a colour" aria-expanded={open} onClick={() => setOpen(!open)} className={btn}><Icon name="Palette" size={15} />{labelled && "Colour"}</button>
    </div>
  );
}


/** A small dot on a Kits button: an installed kit has a newer version. */
export const UpdateDot = () => {
  const { kitUpdates } = useApp();
  return kitUpdates > 0 ? <span className="size-2 rounded-full bg-accent" role="img" aria-label={`${kitUpdates} update${kitUpdates === 1 ? "" : "s"} available`} title="Updates available" /> : null;
};

/** A small dot on the Settings button: a newer Jimkit is published and you have not looked at it yet. */
export const UpdatePip = () => {
  const { updateUnseen } = useApp();
  return updateUnseen ? <span className="absolute right-1 top-1 size-2 rounded-full bg-accent" role="img" aria-label="An update is available" /> : null;
};


/** Floats over the page while arranging. In Metro, on a wide screen, it takes the place of the corner buttons: the tiles use the whole height. */
export function ArrangeBar({ corner, wide }: { corner?: boolean; wide?: boolean }) {
  const { setArranging, hasOrder, resetOrder, layout, setLayout } = useApp();
  const where = corner
    ? "fixed inset-x-3 bottom-3 lg:inset-x-auto lg:bottom-auto lg:right-12 lg:top-8"
    : "fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+76px)] lg:inset-x-auto lg:bottom-6 lg:left-[calc(50%+124px)] lg:w-max lg:max-w-[calc(100vw-320px)] lg:-translate-x-1/2";
  return (
    <div role="region" aria-label="Edit" className={`jk-panel z-30 flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-2xl px-4 py-3 ${where}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-dim">Drag to reorder, use the arrows, or hide with the eye.</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-dim">
          <label className="flex items-center gap-2"><input type="checkbox" checked={layout.group} onChange={(e) => setLayout({ group: e.target.checked })} className="size-4 accent-[var(--accent)]" /> Group small categories</label>
          {wide && layout.group && <label className="flex items-center gap-2"><input type="checkbox" checked={layout.wide} onChange={(e) => setLayout({ wide: e.target.checked })} className="size-4 accent-[var(--accent)]" /> Two columns wide</label>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Btn onClick={resetOrder} disabled={!hasOrder} title="Back to the default layout">Reset</Btn>
        <Btn primary onClick={() => setArranging(false)}>Done</Btn>
      </div>
    </div>
  );
}

