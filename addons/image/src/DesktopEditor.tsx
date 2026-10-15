"use client";

import { AnimatePresence, motion } from "@jimkit/ui/motion";
import { Crop, FlipHorizontal2, FlipVertical2, LoaderCircle, Minus, Pencil, Plus, Redo2, RotateCcw, RotateCw, Scaling, SlidersHorizontal, Sparkles, Trash2, Type, Undo2, X, Download, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FILTERS } from "./lib/editor/adjust";
import { ASPECTS, NEUTRAL, type Adjust } from "./lib/editor/types";
import { Slider } from "./controls";
import { ExportPanel } from "./export";
import { ResizePanel } from "./ResizePanel";
import { TextPanel } from "./TextPanel";
import { Stage } from "./Stage";
import { SWATCHES, useImageEditor, type ImageEditor, type ToolId } from "./useImageEditor";

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

const TOOLS: { id: ToolId; label: string; icon: typeof Crop; key: string }[] = [
  { id: "crop", label: "Crop & rotate", icon: Crop, key: "C" },
  { id: "resize", label: "Resize", icon: Scaling, key: "R" },
  { id: "adjust", label: "Adjust", icon: SlidersHorizontal, key: "A" },
  { id: "filters", label: "Filters", icon: Sparkles, key: "F" },
  { id: "draw", label: "Draw", icon: Pencil, key: "D" },
  { id: "text", label: "Text", icon: Type, key: "T" },
];

const ADJUSTMENTS: { key: keyof Adjust; label: string; min?: number }[] = [
  { key: "exposure", label: "Exposure" }, { key: "brightness", label: "Brightness" }, { key: "contrast", label: "Contrast" },
  { key: "saturation", label: "Saturation" }, { key: "warmth", label: "Warmth" }, { key: "sharpen", label: "Sharpen", min: 0 }, { key: "vignette", label: "Vignette", min: 0 },
];

const IconBtn = ({ label, onClick, disabled, children, active }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; active?: boolean }) => (
  <button title={label} aria-label={label} onClick={onClick} disabled={disabled} className={`grid size-9 place-items-center rounded-xl transition active:scale-95 disabled:opacity-30 ${active ? "bg-tint-2 text-fg" : "text-dim hover:bg-tint-2 hover:text-fg"}`}>{children}</button>
);

const Label = ({ children }: { children: React.ReactNode }) => <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[.14em] text-faint first:mt-0">{children}</p>;

export function DesktopEditor({ file, onClose, onApply }: { file: File; onClose: () => void; onApply?: (f: File) => void }) {
  const ed = useImageEditor(file, 2000);
  const [exporting, setExporting] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const tryClose = () => (ed.dirty ? setConfirmClose(true) : onClose());

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA"].includes(t.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? ed.redo() : ed.undo(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") { e.preventDefault(); ed.redo(); return; }
      if (typing) return;
      if (e.key === "Escape") {
        if (exporting) return void setExporting(false);
        if (ed.selectedText) return void ed.setSelectedText(null);
        return tryClose();
      }
      const sel = ed.tool === "text" ? ed.state.texts.find((t) => t.id === ed.selectedText) : undefined;
      if (sel) {
        const step = e.shiftKey ? 10 : 1;
        const arrow = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (arrow) { e.preventDefault(); return void ed.updateText(sel.id, { x: sel.x + arrow[0], y: sel.y + arrow[1] }); }
        if (e.key === "Enter") { e.preventDefault(); return void ed.setEditingText(sel.id); }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") { e.preventDefault(); return void ed.duplicateText(sel.id); }
        if (e.key === "]") return void ed.orderText(sel.id, e.shiftKey || e.altKey ? "front" : "forward");
        if (e.key === "[") return void ed.orderText(sel.id, e.shiftKey || e.altKey ? "backmost" : "back");
      }
      if (!e.metaKey && !e.ctrlKey) {
        if (e.key === "+" || e.key === "=") return void ed.viewApi.current?.zoomBy(1.25);
        if (e.key === "-") return void ed.viewApi.current?.zoomBy(0.8);
        if (e.key === "0") return void ed.viewApi.current?.fit();
        if (e.key === "1") return void ed.viewApi.current?.actual();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && ed.selectedText) { e.preventDefault(); ed.deleteText(ed.selectedText); return; }
      const tool = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (tool && !e.metaKey && !e.ctrlKey) ed.setTool(tool.id);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div className="fixed inset-0 z-[70] flex flex-col bg-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} role="dialog" aria-label="Image editor">
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 backdrop-blur">
        <IconBtn label="Close editor (Esc)" onClick={tryClose}><X size={18} /></IconBtn>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium">{file.name}</p>
          <p className="text-[11px] tabular-nums text-faint">{ed.src ? `${ed.src.width} × ${ed.src.height}${Math.round(ed.outputSize.w) !== ed.src.width || Math.round(ed.outputSize.h) !== ed.src.height ? `  →  ${Math.round(ed.outputSize.w)} × ${Math.round(ed.outputSize.h)}` : ""}` : "Loading…"}</p>
        </div>
        <div className="mx-auto flex items-center gap-1">
          <IconBtn label="Undo (Ctrl+Z)" onClick={ed.undo} disabled={!ed.canUndo}><Undo2 size={17} /></IconBtn>
          <IconBtn label="Redo (Ctrl+Shift+Z)" onClick={ed.redo} disabled={!ed.canRedo}><Redo2 size={17} /></IconBtn>
          <span className="mx-2 h-5 w-px bg-line" />
          <button onClick={ed.resetAll} disabled={!ed.canUndo} className="rounded-lg px-3 py-1.5 text-[13px] text-dim transition hover:bg-tint hover:text-fg disabled:opacity-30">Reset all</button>
        </div>
        <div className="relative">
          <button onClick={() => setExporting((x) => !x)} disabled={!ed.src} className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-semibold text-white transition active:scale-[.97] disabled:opacity-40" data-primary="">
            <Download size={15} /> Export
          </button>
          <AnimatePresence>
            {exporting && ed.src && (
              <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={spring}
                className="jk-panel absolute right-0 top-full z-50 mt-2 max-h-[calc(100vh-5rem)] w-[360px] overflow-y-auto rounded-2xl !border-line-strong p-5 shadow-[0_30px_80px_-10px_rgb(0_0_0/.5)] scroll-hide">
                <ExportPanel ed={ed} file={file} onApply={onApply} onDone={onClose} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3" aria-label="Tools">
          {TOOLS.map((t) => {
            const active = ed.tool === t.id;
            return (
              <button key={t.id} onClick={() => ed.setTool(t.id)} title={`${t.label} (${t.key})`} aria-pressed={active} className="relative flex h-[58px] w-14 flex-col items-center justify-center gap-1 rounded-xl text-[10.5px] transition" style={{ color: active ? "var(--color-fg)" : "var(--color-faint)" }}>
                {active && <motion.span layoutId="tool-active" transition={spring} className="absolute inset-0 rounded-xl border border-line-strong bg-tint-2" />}
                <t.icon size={19} className="relative" /> <span className="relative">{t.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </nav>

        <main className="relative min-w-0 flex-1 bg-[#0a0c10]">
          {ed.loading && <div className="absolute inset-0 grid place-items-center text-dim"><LoaderCircle className="jk-spin" /></div>}
          {ed.error && (
            <div className="absolute inset-0 grid place-items-center p-8 text-center">
              <div><p className="text-[16px] font-medium">Can't open this image</p><p className="mt-1 max-w-sm text-[14px] text-dim">{ed.error}</p><button onClick={onClose} className="mt-4 rounded-xl border border-line-strong px-4 py-2 text-[13px] text-dim hover:bg-tint">Close</button></div>
            </div>
          )}
          {ed.src && <Stage ed={ed} touch={false} />}
          {ed.src && <ZoomBar ed={ed} />}
        </main>

        <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-line bg-surface p-5 scroll-hide">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={ed.tool} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.14 }}>
              {ed.src && <Inspector ed={ed} />}
            </motion.div>
          </AnimatePresence>
        </aside>
      </div>

      <AnimatePresence>
        {confirmClose && (
          <motion.div className="absolute inset-0 z-[80] grid place-items-center bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmClose(false)}>
            <motion.div initial={{ scale: 0.95, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97 }} transition={spring} onClick={(e: { stopPropagation(): void }) => e.stopPropagation()} className="jk-panel w-[380px] rounded-2xl !border-line-strong p-6">
              <p className="text-[17px] font-semibold">Discard your edits?</p>
              <p className="mt-1.5 text-[14px] text-dim">You have changes that haven't been exported.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setConfirmClose(false)} className="rounded-xl border border-line-strong px-4 py-2 text-[13.5px] text-dim hover:bg-tint">Keep editing</button>
                <button onClick={onClose} className="rounded-xl bg-bad/90 px-4 py-2 text-[13.5px] font-medium text-white">Discard</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Inspector({ ed }: { ed: ImageEditor }) {
  switch (ed.tool) {
    case "crop": return <CropPanel ed={ed} />;
    case "resize": return <ResizePanel ed={ed} />;
    case "adjust": return <AdjustPanel ed={ed} />;
    case "filters": return <FiltersPanel ed={ed} />;
    case "draw": return <DrawPanel ed={ed} />;
    case "text": return <TextPanel ed={ed} />;
  }
}

function CropPanel({ ed }: { ed: ImageEditor }) {
  return (
    <div>
      <Label>Aspect ratio</Label>
      <div className="grid grid-cols-4 gap-1.5">
        {ASPECTS.map((a) => (
          <button key={a.id} onClick={() => ed.setAspect(a.id)} aria-pressed={ed.aspectId === a.id} className={`rounded-lg border py-2 text-[12px] transition ${ed.aspectId === a.id ? "border-accent/50 bg-accent/15 text-accent" : "border-line bg-tint text-dim hover:bg-tint-2"}`}>{a.label}</button>
        ))}
      </div>
      <Label>Rotate & flip</Label>
      <div className="flex gap-1.5">
        <button onClick={() => ed.rotate(-1)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-tint py-2 text-[12px] text-dim hover:bg-tint-2"><RotateCcw size={14} /> Left</button>
        <button onClick={() => ed.rotate(1)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-tint py-2 text-[12px] text-dim hover:bg-tint-2"><RotateCw size={14} /> Right</button>
        <button onClick={() => ed.flip("h")} title="Flip horizontally" aria-label="Flip horizontally" className="grid w-10 place-items-center rounded-lg border border-line bg-tint text-dim hover:bg-tint-2"><FlipHorizontal2 size={15} /></button>
        <button onClick={() => ed.flip("v")} title="Flip vertically" aria-label="Flip vertically" className="grid w-10 place-items-center rounded-lg border border-line bg-tint text-dim hover:bg-tint-2"><FlipVertical2 size={15} /></button>
      </div>
      <Label>Straighten</Label>
      <Slider label="Angle" value={ed.state.straighten} min={-45} max={45} step={0.1} onLive={(v) => ed.setStraighten(v, true)} onCommit={ed.endLive} format={(v) => `${v.toFixed(1)}°`} />
      <button onClick={() => { ed.setCrop(null, false); ed.setAspect("free"); }} disabled={!ed.state.crop} className="mt-5 w-full rounded-lg border border-line py-2 text-[12.5px] text-dim transition hover:bg-tint disabled:opacity-30">Reset crop</button>
      <p className="mt-4 text-[12px] leading-relaxed text-faint">Drag the handles on the picture. Output: <span className="tabular-nums text-dim">{Math.round(ed.outputSize.w)} × {Math.round(ed.outputSize.h)}</span> px</p>
    </div>
  );
}

function AdjustPanel({ ed }: { ed: ImageEditor }) {
  const changed = ADJUSTMENTS.some((a) => ed.state.adjust[a.key] !== 0);
  return (
    <div className="space-y-4">
      <Label><Sun size={11} className="mr-1 inline" /> Light & colour</Label>
      {ADJUSTMENTS.map((a) => (
        <Slider key={a.key} label={a.label} value={ed.state.adjust[a.key]} min={a.min ?? -100} max={100} neutral={0} onLive={(v) => ed.setAdjust(a.key, v, true)} onCommit={ed.endLive} />
      ))}
      <button onClick={() => ed.edit((s) => ({ ...s, adjust: NEUTRAL }))} disabled={!changed} className="mt-2 w-full rounded-lg border border-line py-2 text-[12.5px] text-dim transition hover:bg-tint disabled:opacity-30">Reset adjustments</button>
    </div>
  );
}

function FiltersPanel({ ed }: { ed: ImageEditor }) {
  return (
    <div>
      <Label>Filters</Label>
      <div className="grid grid-cols-2 gap-2">
        {FILTERS.map((f) => {
          const active = ed.state.filter === f.id;
          return (
            <button key={f.id} onClick={() => ed.setFilter(f.id)} aria-pressed={active} className={`overflow-hidden rounded-xl border text-left transition ${active ? "border-accent/60 ring-2 ring-accent/30" : "border-line hover:border-line-strong"}`}>
              <div className="aspect-[4/3] bg-raised bg-cover bg-center" style={{ backgroundImage: ed.thumbs[f.id] ? `url(${ed.thumbs[f.id]})` : undefined }} />
              <p className={`px-2.5 py-1.5 text-[12px] ${active ? "text-fg" : "text-dim"}`}>{f.label}</p>
            </button>
          );
        })}
      </div>
      {ed.state.filter !== "none" && <div className="mt-5"><Slider label="Amount" value={ed.state.filterAmount} min={0} max={100} neutral={100} onLive={(v) => ed.setFilterAmount(v, true)} onCommit={ed.endLive} format={(v) => `${v}%`} /></div>}
    </div>
  );
}

function DrawPanel({ ed }: { ed: ImageEditor }) {
  return (
    <div>
      <Label>Brush</Label>
      <div className="flex rounded-xl border border-line bg-tint p-0.5">
        {(["pen", "marker"] as const).map((k) => (
          <button key={k} onClick={() => ed.setDraw({ ...ed.draw, kind: k })} aria-pressed={ed.draw.kind === k} className="relative flex-1 rounded-[10px] py-1.5 text-[12.5px] capitalize" style={{ color: ed.draw.kind === k ? "var(--color-fg)" : "var(--color-faint)" }}>
            {ed.draw.kind === k && <motion.span layoutId="brush" transition={spring} className="absolute inset-0 rounded-[10px] bg-tint-2" />}
            <span className="relative">{k}</span>
          </button>
        ))}
      </div>
      <Label>Colour</Label>
      <Swatches value={ed.draw.color} onPick={(c) => ed.setDraw({ ...ed.draw, color: c })} />
      <div className="mt-5"><Slider label="Size" value={Math.round(ed.draw.size * 1000)} min={2} max={40} neutral={8} onLive={(v) => ed.setDraw({ ...ed.draw, size: v / 1000 })} onCommit={() => {}} /></div>
      <button onClick={() => ed.edit((s) => ({ ...s, strokes: [] }))} disabled={!ed.state.strokes.length} className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-[12.5px] text-dim transition hover:bg-tint disabled:opacity-30"><Trash2 size={13} /> Clear drawings</button>
      <p className="mt-4 text-[12px] leading-relaxed text-faint">Draw on the picture. Undo removes the last stroke. Scroll to zoom in for detail.</p>
    </div>
  );
}

function Swatches({ value, onPick, big }: { value: string; onPick: (c: string) => void; big?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SWATCHES.map((c) => (
        <button key={c} onClick={() => onPick(c)} aria-label={`Colour ${c}`} aria-pressed={value === c} className={`${big ? "size-10" : "size-7"} rounded-full border transition active:scale-90 ${value === c ? "ring-2 ring-white/80 ring-offset-2 ring-offset-surface" : "border-white/20"}`} style={{ background: c }} />
      ))}
    </div>
  );
}

function ZoomBar({ ed }: { ed: ImageEditor }) {
  const v = () => ed.viewApi.current;
  const btn = "grid size-7 place-items-center rounded-lg text-dim transition hover:bg-tint-2 hover:text-fg";
  return (
    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-line bg-surface px-1.5 py-1 text-[11px] text-faint backdrop-blur">
      <button className={btn} onClick={() => v()?.zoomBy(0.8)} title="Zoom out (-)" aria-label="Zoom out"><Minus size={14} /></button>
      <button className="rounded-lg px-2 py-1 hover:bg-tint-2 hover:text-fg" onClick={() => v()?.fit()} title="Fit (0)">Fit</button>
      <button className="rounded-lg px-2 py-1 hover:bg-tint-2 hover:text-fg" onClick={() => v()?.actual()} title="Actual size (1)">100%</button>
      <button className={btn} onClick={() => v()?.zoomBy(1.25)} title="Zoom in (+)" aria-label="Zoom in"><Plus size={14} /></button>
      <span className="ml-1 hidden px-1 xl:inline">scroll to zoom, drag to pan</span>
    </div>
  );
}
