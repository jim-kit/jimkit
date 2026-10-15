"use client";

import { AnimatePresence, motion } from "@jimkit/ui/motion";
import { Crop, FlipHorizontal2, FlipVertical2, LoaderCircle, Pencil, Redo2, RotateCcw, RotateCw, Scaling, SlidersHorizontal, Sparkles, Trash2, Type, Undo2, X } from "lucide-react";
import { useState } from "react";
import { FILTERS } from "./lib/editor/adjust";
import { haptic } from "@jimkit/ui";
import { ASPECTS, NEUTRAL, type Adjust } from "./lib/editor/types";
import { Sheet } from "@jimkit/ui";
import { Slider } from "./controls";
import { ExportPanel } from "./export";
import { ResizePanel } from "./ResizePanel";
import { TextPanel } from "./TextPanel";
import { Stage } from "./Stage";
import { SWATCHES, useImageEditor, type ImageEditor, type ToolId } from "./useImageEditor";

const spring = { type: "spring", stiffness: 420, damping: 36 } as const;
const GRAD = "var(--grad)";

const TOOLS: { id: ToolId; label: string; icon: typeof Crop }[] = [
  { id: "adjust", label: "Adjust", icon: SlidersHorizontal },
  { id: "filters", label: "Filters", icon: Sparkles },
  { id: "crop", label: "Crop", icon: Crop },
  { id: "resize", label: "Resize", icon: Scaling },
  { id: "draw", label: "Draw", icon: Pencil },
  { id: "text", label: "Text", icon: Type },
];

const ADJUSTMENTS: { key: keyof Adjust; label: string; min?: number }[] = [
  { key: "exposure", label: "Exposure" }, { key: "brightness", label: "Brightness" }, { key: "contrast", label: "Contrast" },
  { key: "saturation", label: "Saturation" }, { key: "warmth", label: "Warmth" }, { key: "sharpen", label: "Sharpen", min: 0 }, { key: "vignette", label: "Vignette", min: 0 },
];

const Round = ({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
  <motion.button whileTap={{ scale: 0.86 }} aria-label={label} onClick={() => { haptic("tap"); onClick(); }} disabled={disabled} className="grid size-11 select-none place-items-center rounded-full text-fg disabled:opacity-30">{children}</motion.button>
);

function Chip({ active, children, onClick, dot }: { active?: boolean; children: React.ReactNode; onClick: () => void; dot?: boolean }) {
  return (
    <motion.button whileTap={{ scale: 0.93 }} onClick={() => { haptic("select"); onClick(); }} aria-pressed={active}
      className={`relative h-10 shrink-0 select-none rounded-full border px-4 text-[14px] font-medium ${active ? "border-transparent text-white" : "border-line bg-raised text-dim"}`} style={active ? { background: GRAD } : undefined}>
      {children}
      {dot && !active && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-surface" />}
    </motion.button>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-hide">{children}</div>;

export function MobileEditor({ file, onClose, onApply }: { file: File; onClose: () => void; onApply?: (f: File) => void }) {
  const ed = useImageEditor(file, 1400);
  const [sheet, setSheet] = useState<"export" | "discard" | null>(null);

  return (
    <motion.div className="fixed inset-0 z-[70] flex select-none flex-col bg-bg" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 40 }} role="dialog" aria-label="Image editor">
      <header className="pt-safe flex shrink-0 items-center justify-between px-2">
        <div className="flex h-14 w-full items-center">
          <Round label="Close" onClick={() => (ed.dirty ? setSheet("discard") : onClose())}><X size={22} /></Round>
          <div className="mx-auto flex items-center">
            <Round label="Undo" onClick={ed.undo} disabled={!ed.canUndo}><Undo2 size={21} /></Round>
            <Round label="Redo" onClick={ed.redo} disabled={!ed.canRedo}><Redo2 size={21} /></Round>
          </div>
          <motion.button whileTap={{ scale: 0.94 }} onClick={() => { haptic("select"); setSheet("export"); }} disabled={!ed.src} className="mr-2 h-10 rounded-full px-5 text-[15px] font-semibold text-white disabled:opacity-40" style={{ background: GRAD }}>Export</motion.button>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 bg-[#0a0c10]">
        {ed.loading && <div className="absolute inset-0 grid place-items-center text-dim"><LoaderCircle className="jk-spin" /></div>}
        {ed.error && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div><p className="text-[18px] font-semibold">Can't open this image</p><p className="mt-2 text-[15px] text-dim">{ed.error}</p><button onClick={onClose} className="mt-5 h-12 rounded-full border border-line-strong px-6 text-[15px]">Close</button></div>
          </div>
        )}
        {ed.src && <Stage ed={ed} touch />}
      </main>

      <div className="jk-panel shrink-0 rounded-t-[28px] border-b-0">
        <div className="min-h-[148px] px-4 pb-2 pt-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={ed.tool} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.14 }}>
              {ed.src && <Panel ed={ed} />}
            </motion.div>
          </AnimatePresence>
        </div>
        <nav className="flex justify-around px-2 pb-[calc(env(safe-area-inset-bottom)+6px)] pt-1" aria-label="Tools">
          {TOOLS.map((t) => {
            const active = ed.tool === t.id;
            return (
              <motion.button key={t.id} whileTap={{ scale: 0.88 }} onClick={() => { haptic("select"); ed.setTool(t.id); }} aria-pressed={active} className="relative flex h-16 w-[60px] flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium" style={{ color: active ? "var(--color-fg)" : "var(--color-faint)" }}>
                {active && <motion.span layoutId="m-tool" transition={spring} className="absolute inset-x-1 inset-y-1 rounded-2xl bg-tint-2" />}
                <motion.span className="relative" animate={{ y: active ? -1 : 0, scale: active ? 1.08 : 1 }} transition={spring}><t.icon size={23} strokeWidth={active ? 2.1 : 1.7} /></motion.span>
                <span className="relative">{t.label}</span>
              </motion.button>
            );
          })}
        </nav>
      </div>

      <Sheet open={sheet === "export"} onClose={() => setSheet(null)} title="Export">
        {ed.src && <ExportPanel ed={ed} file={file} onApply={onApply} big onDone={() => { setSheet(null); onClose(); }} />}
      </Sheet>
      <Sheet open={sheet === "discard"} onClose={() => setSheet(null)}>
        <div className="pb-1 text-center">
          <p className="text-[20px] font-semibold">Discard your edits?</p>
          <p className="mt-1.5 text-[15px] text-dim">You have changes that haven't been exported.</p>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => { haptic("error"); onClose(); }} className="mt-6 h-14 w-full rounded-2xl bg-bad/90 text-[16px] font-semibold text-white">Discard</motion.button>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setSheet(null)} className="mt-2 h-14 w-full rounded-2xl border border-line-strong text-[16px] text-dim">Keep editing</motion.button>
        </div>
      </Sheet>
    </motion.div>
  );
}

function Panel({ ed }: { ed: ImageEditor }) {
  switch (ed.tool) {
    case "adjust": return <AdjustPanel ed={ed} />;
    case "filters": return <FiltersPanel ed={ed} />;
    case "crop": return <CropPanel ed={ed} />;
    case "resize": return <ResizePanel ed={ed} big />;
    case "draw": return <DrawPanel ed={ed} />;
    case "text": return <TextPanel ed={ed} big />;
  }
}

function AdjustPanel({ ed }: { ed: ImageEditor }) {
  const [key, setKey] = useState<keyof Adjust>("exposure");
  const cur = ADJUSTMENTS.find((a) => a.key === key)!;
  return (
    <div className="space-y-4">
      <Row>
        {ADJUSTMENTS.map((a) => <Chip key={a.key} active={key === a.key} dot={ed.state.adjust[a.key] !== 0} onClick={() => setKey(a.key)}>{a.label}</Chip>)}
      </Row>
      <Slider size="lg" label={cur.label} value={ed.state.adjust[key]} min={cur.min ?? -100} max={100} neutral={0} onLive={(v) => ed.setAdjust(key, v, true)} onCommit={ed.endLive} />
      {ADJUSTMENTS.some((a) => ed.state.adjust[a.key] !== 0) && <button onClick={() => { haptic("tap"); ed.edit((s) => ({ ...s, adjust: NEUTRAL })); }} className="mx-auto block text-[13px] text-dim underline-offset-2 hover:underline">Reset all adjustments</button>}
    </div>
  );
}

function FiltersPanel({ ed }: { ed: ImageEditor }) {
  return (
    <div className="space-y-3">
      <Row>
        {FILTERS.map((f) => {
          const active = ed.state.filter === f.id;
          return (
            <motion.button key={f.id} whileTap={{ scale: 0.93 }} onClick={() => { haptic("select"); ed.setFilter(f.id); }} aria-pressed={active} className="w-[76px] shrink-0 select-none text-center">
              <div className={`aspect-square overflow-hidden rounded-2xl bg-raised bg-cover bg-center ${active ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`} style={{ backgroundImage: ed.thumbs[f.id] ? `url(${ed.thumbs[f.id]})` : undefined }} />
              <p className={`mt-1.5 text-[12px] ${active ? "text-fg" : "text-faint"}`}>{f.label}</p>
            </motion.button>
          );
        })}
      </Row>
      {ed.state.filter !== "none" && <Slider size="lg" label="Amount" value={ed.state.filterAmount} min={0} max={100} neutral={100} onLive={(v) => ed.setFilterAmount(v, true)} onCommit={ed.endLive} format={(v) => `${v}%`} />}
    </div>
  );
}

function CropPanel({ ed }: { ed: ImageEditor }) {
  return (
    <div className="space-y-3.5">
      <Row>{ASPECTS.map((a) => <Chip key={a.id} active={ed.aspectId === a.id} onClick={() => ed.setAspect(a.id)}>{a.label}</Chip>)}</Row>
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <Round label="Rotate left" onClick={() => ed.rotate(-1)}><RotateCcw size={22} /></Round>
          <Round label="Rotate right" onClick={() => ed.rotate(1)}><RotateCw size={22} /></Round>
          <Round label="Flip horizontally" onClick={() => ed.flip("h")}><FlipHorizontal2 size={22} /></Round>
          <Round label="Flip vertically" onClick={() => ed.flip("v")}><FlipVertical2 size={22} /></Round>
        </div>
        <button onClick={() => { haptic("tap"); ed.setCrop(null, false); ed.setAspect("free"); }} disabled={!ed.state.crop} className="h-10 rounded-full px-4 text-[13px] text-dim disabled:opacity-30">Reset crop</button>
      </div>
      <Slider size="lg" label="Straighten" value={ed.state.straighten} min={-45} max={45} step={0.1} onLive={(v) => ed.setStraighten(v, true)} onCommit={ed.endLive} format={(v) => `${v.toFixed(1)}°`} />
    </div>
  );
}

function DrawPanel({ ed }: { ed: ImageEditor }) {
  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-2">
        {(["pen", "marker"] as const).map((k) => <Chip key={k} active={ed.draw.kind === k} onClick={() => ed.setDraw({ ...ed.draw, kind: k })}>{k === "pen" ? "Pen" : "Marker"}</Chip>)}
        <button onClick={() => { haptic("tap"); ed.edit((s) => ({ ...s, strokes: [] })); }} disabled={!ed.state.strokes.length} aria-label="Clear drawings" className="ml-auto grid size-10 place-items-center rounded-full text-dim disabled:opacity-30"><Trash2 size={19} /></button>
      </div>
      <Row>
        {SWATCHES.map((c) => (
          <motion.button key={c} whileTap={{ scale: 0.85 }} onClick={() => { haptic("select"); ed.setDraw({ ...ed.draw, color: c }); }} aria-label={`Colour ${c}`} aria-pressed={ed.draw.color === c} className={`size-10 shrink-0 rounded-full border ${ed.draw.color === c ? "ring-2 ring-white ring-offset-2 ring-offset-surface" : "border-white/20"}`} style={{ background: c }} />
        ))}
      </Row>
      <Slider size="lg" label="Brush size" value={Math.round(ed.draw.size * 1000)} min={2} max={40} neutral={8} onLive={(v) => ed.setDraw({ ...ed.draw, size: v / 1000 })} onCommit={() => {}} />
    </div>
  );
}
