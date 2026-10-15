"use client";

import { AlignCenter, AlignLeft, AlignRight, BringToFront, Bold, Copy, Italic, Minus, Plus, SendToBack, Trash2, Type } from "lucide-react";
import { useState } from "react";
import { haptic } from "@jimkit/ui";
import { ColorRow, NumField, Slider, Toggle } from "./controls";
import { FONTS, normAngle } from "./lib/editor/text";
import type { TextItem } from "./lib/editor/types";
import type { ImageEditor } from "./useImageEditor";

const Label = ({ children, big }: { children: React.ReactNode; big?: boolean }) => (
  <p className={`mb-2 mt-5 font-semibold uppercase tracking-[.14em] text-faint first:mt-0 ${big ? "text-[12px]" : "text-[11px]"}`}>{children}</p>
);

type Tab = "style" | "size" | "colour" | "effects" | "arrange";
const TABS: { id: Tab; label: string }[] = [
  { id: "style", label: "Text" }, { id: "size", label: "Size" }, { id: "colour", label: "Colour" }, { id: "effects", label: "Effects" }, { id: "arrange", label: "Arrange" },
];

/** The text tool's controls. Desktop lists them all; on a phone `big` shows one group at a time so the panel stays short. */
export function TextPanel({ ed, big }: { ed: ImageEditor; big?: boolean }) {
  const sel = ed.state.texts.find((t) => t.id === ed.selectedText);
  const [tab, setTab] = useState<Tab>("style");
  const add = (
    <button
      onClick={() => { haptic("select"); ed.addText(); }}
      className={`flex w-full items-center justify-center gap-2 border border-accent/40 bg-accent/10 font-medium text-accent transition hover:bg-accent/15 active:scale-[.98] ${big ? "h-12 rounded-2xl text-[15px]" : "rounded-xl py-2.5 text-[13.5px]"}`}
    ><Plus size={big ? 18 : 15} /> Add text</button>
  );

  if (!sel) {
    return (
      <div className={big ? "space-y-3" : ""}>
        {add}
        {ed.state.texts.length > 0 && (
          <>
            {!big && <Label>Texts</Label>}
            <div className={big ? "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-hide" : "space-y-1"}>
              {ed.state.texts.map((t) => (
                <button key={t.id} onClick={() => ed.setSelectedText(t.id)} className={big ? "h-10 shrink-0 rounded-2xl border border-line bg-raised px-4 text-[14px] text-dim" : "flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-[12.5px] text-dim hover:bg-tint"}>
                  {!big && <Type size={13} />} <span className="max-w-40 truncate">{t.text.split("\n")[0] || "(empty)"}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <p className={`${big ? "text-center text-[13px]" : "mt-5 text-[12px] leading-relaxed"} text-faint`}>
          {big ? "Tap to select, tap twice to edit. Two fingers rotate and scale." : "Drag to move, double-click to edit. The round handle rotates; Shift snaps to 15°."}
        </p>
      </div>
    );
  }

  const set = (patch: Partial<TextItem>, liveDrag = false) => ed.updateText(sel.id, patch, liveDrag);
  const sections: Record<Tab, React.ReactNode> = {
    style: (
      <>
        <textarea
          value={sel.text} onChange={(e) => set({ text: e.target.value }, true)} onBlur={ed.endLive} onKeyDown={(e) => e.stopPropagation()}
          rows={big ? 2 : 3} aria-label="Text" placeholder="Your text"
          className={`w-full resize-none border border-line-strong bg-field outline-none focus:border-accent/60 ${big ? "rounded-2xl px-4 py-3 text-[16px]" : "rounded-xl px-3 py-2 text-[14px]"}`}
        />
        <Label big={big}>Font</Label>
        <div className={`flex flex-wrap gap-1.5`}>
          {FONTS.map((f) => (
            <Toggle key={f.id} on={sel.font === f.id} onClick={() => set({ font: f.id })} big={big}><span style={{ fontFamily: f.stack }}>{f.label}</span></Toggle>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Toggle on={sel.bold} onClick={() => set({ bold: !sel.bold })} label="Bold" big={big}><Bold size={big ? 18 : 14} /></Toggle>
          <Toggle on={sel.italic} onClick={() => set({ italic: !sel.italic })} label="Italic" big={big}><Italic size={big ? 18 : 14} /></Toggle>
          <span className="mx-1 w-px bg-line" />
          <Toggle on={sel.align === "left"} onClick={() => set({ align: "left" })} label="Align left" big={big}><AlignLeft size={big ? 18 : 14} /></Toggle>
          <Toggle on={sel.align === "center"} onClick={() => set({ align: "center" })} label="Align centre" big={big}><AlignCenter size={big ? 18 : 14} /></Toggle>
          <Toggle on={sel.align === "right"} onClick={() => set({ align: "right" })} label="Align right" big={big}><AlignRight size={big ? 18 : 14} /></Toggle>
        </div>
      </>
    ),
    size: (
      <div className="space-y-4">
        <Slider size={big ? "lg" : "md"} label="Size" value={Math.round(sel.size)} min={8} max={Math.max(120, Math.round(Math.max(ed.base.w, ed.base.h) / 3))} neutral={Math.round(sel.size)} onLive={(v) => set({ size: v }, true)} onCommit={ed.endLive} />
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Slider size={big ? "lg" : "md"} label="Angle" value={Math.round(sel.rotation)} min={-180} max={180} neutral={0} onLive={(v) => set({ rotation: v }, true)} onCommit={ed.endLive} format={(v) => `${v}°`} />
          </div>
          <NumField label="Degrees" value={sel.rotation} min={-360} max={360} suffix="°" big={big} className="w-24 shrink-0" onCommit={(v) => set({ rotation: normAngle(v) })} />
        </div>
        <Slider size={big ? "lg" : "md"} label="Opacity" value={Math.round(sel.opacity * 100)} min={5} max={100} neutral={100} onLive={(v) => set({ opacity: v / 100 }, true)} onCommit={ed.endLive} format={(v) => `${v}%`} />
      </div>
    ),
    colour: <ColorRow value={sel.color} onPick={(c) => c && set({ color: c })} big={big} scroll={big} />,
    effects: (
      <div className="space-y-4">
        <Toggle on={sel.shadow} onClick={() => set({ shadow: !sel.shadow })} big={big} className="w-full"><Minus size={big ? 16 : 13} /> Shadow</Toggle>
        <div>
          <Toggle on={sel.outline > 0} onClick={() => set({ outline: sel.outline > 0 ? 0 : 0.06 })} big={big} className="w-full">Outline</Toggle>
          {sel.outline > 0 && (
            <div className="mt-3 space-y-3">
              <Slider size={big ? "lg" : "md"} label="Width" value={Math.round(sel.outline * 1000)} min={5} max={200} neutral={60} onLive={(v) => set({ outline: v / 1000 }, true)} onCommit={ed.endLive} />
              <ColorRow value={sel.outlineColor} onPick={(c) => c && set({ outlineColor: c })} big={big} scroll={big} />
            </div>
          )}
        </div>
        <div>
          <Toggle on={sel.bg !== null} onClick={() => set({ bg: sel.bg === null ? "#0b0d12" : null })} big={big} className="w-full">Background box</Toggle>
          {sel.bg !== null && <div className="mt-3"><ColorRow value={sel.bg} onPick={(c) => c && set({ bg: c })} big={big} scroll={big} /></div>}
        </div>
      </div>
    ),
    arrange: (
      <div className="grid grid-cols-2 gap-2">
        <Toggle on={false} onClick={() => ed.duplicateText(sel.id)} big={big}><Copy size={big ? 17 : 14} /> Duplicate</Toggle>
        <Toggle on={false} onClick={() => ed.deleteText(sel.id)} big={big} className="!border-bad/40 !text-bad"><Trash2 size={big ? 17 : 14} /> Delete</Toggle>
        <Toggle on={false} onClick={() => ed.orderText(sel.id, "front")} big={big}><BringToFront size={big ? 17 : 14} /> To front</Toggle>
        <Toggle on={false} onClick={() => ed.orderText(sel.id, "backmost")} big={big}><SendToBack size={big ? 17 : 14} /> To back</Toggle>
      </div>
    ),
  };

  if (big) {
    return (
      <div className="space-y-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-hide">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { haptic("select"); setTab(t.id); }} aria-pressed={tab === t.id} className={`h-10 shrink-0 rounded-2xl border px-4 text-[14px] font-medium ${tab === t.id ? "border-transparent text-white" : "border-line bg-raised text-dim"}`} style={tab === t.id ? { background: "var(--grad)" } : undefined}>{t.label}</button>
          ))}
        </div>
        <div className="max-h-[28vh] overflow-y-auto scroll-hide">{sections[tab]}</div>
      </div>
    );
  }
  return (
    <div>
      {add}
      <Label>Text</Label>
      {sections.style}
      <Label>Colour</Label>
      {sections.colour}
      <Label>Size and angle</Label>
      {sections.size}
      <Label>Effects</Label>
      {sections.effects}
      <Label>Arrange</Label>
      {sections.arrange}
      <p className="mt-5 text-[11px] leading-relaxed text-faint">Arrows nudge by 1 px (Shift: 10). Ctrl+D duplicates.</p>
    </div>
  );
}
