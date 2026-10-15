"use client";

import { ArrowUpDown, Check, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { ToolProps } from "@jimkit/sdk";
import { Btn, ColorPicker, Pane, Seg, ToolFrame, cx } from "@jimkit/ui";
import { contrastRatio, parseColour, ramp, recommend, rotate, toHex, toHslString, toOklchString, toRgbString, verdicts, type Rgb } from "./lib/colour";
import { ErrorLine, Input, ValueRow } from "./kit";

const CHECKER = "repeating-conic-gradient(var(--color-tint-2) 0 25%, transparent 0 50%) 0 0 / 14px 14px";
const css = (c: Rgb) => `rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)} / ${c.a})`;
const solid = (c: Rgb) => toHex({ ...c, a: 1 });

function ColourInput({ label, value, onChange, colour }: { label: string; value: string; onChange: (v: string) => void; colour: Rgb | null }) {
  const [open, setOpen] = useState(false);
  const last = useRef("#000000"); // what the picker keeps showing while the text is not a colour yet
  if (colour) last.current = solid(colour);
  return (
    <div className="flex min-w-0 flex-col gap-1 text-[12px] text-faint">
      <span>{label}</span>
      <div className="flex gap-2">
        <button
          type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${label}, ${open ? "hide" : "show"} picker`} title="Picker"
          className={cx("relative h-[38px] w-12 shrink-0 overflow-hidden rounded-xl border bg-field p-1 transition", open ? "border-accent ring-2 ring-accent/30" : "border-line-strong")}
        >
          <span className="relative block size-full overflow-hidden rounded-lg" style={{ background: CHECKER }}><span className="absolute inset-0" style={{ background: colour ? css(colour) : "transparent" }} /></span>
        </button>
        <Input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder="#3366cc, rgb(), hsl(), oklch()" className="flex-1 text-[14px]" />
      </div>
      {open && <div className="rounded-xl border border-line p-3"><ColorPicker value={last.current} onChange={onChange} /></div>}
    </div>
  );
}

function Sample({ fg, bg }: { fg: Rgb; bg: Rgb }) {
  return (
    <div className="rounded-xl border border-line p-4" style={{ background: css({ ...bg, a: 1 }), color: css(fg) }}>
      <p className="text-[24px] font-bold leading-tight">Large text</p>
      <p className="mt-1 text-[14px]">Normal text sample</p>
    </div>
  );
}

function Tests({ ratio }: { ratio: number }) {
  const v = verdicts(ratio);
  const rows: [string, string, boolean][] = [
    ["Normal text", "AA, 4.5:1", v.aaNormal], ["Normal text", "AAA, 7:1", v.aaaNormal], ["Large text", "AA, 3:1", v.aaLarge], ["Large text", "AAA, 4.5:1", v.aaaLarge], ["Icons and borders", "AA, 3:1", v.ui],
  ];
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {rows.map(([what, level, ok]) => (
        <li key={what + level} className="flex items-center gap-2 px-3 py-2 text-[13px]">
          <span className="flex-1">{what} <span className="text-faint">{level}</span></span>
          <span className={cx("flex items-center gap-1 font-medium", ok ? "text-ok" : "text-bad")}>{ok ? <Check size={14} /> : <X size={14} />}{ok ? "Pass" : "Fail"}</span>
        </li>
      ))}
    </ul>
  );
}

const ratioText = (r: number) => (Math.floor(r * 100) / 100).toFixed(2);

function Chip({ label, colour }: { label: string; colour: Rgb }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[12px] text-faint">{label}</span>
      <span className="relative block h-11 rounded-lg border border-line" style={{ background: CHECKER }}><span className="absolute inset-0 rounded-[7px]" style={{ background: css(colour) }} /></span>
      <span className="font-mono text-[12px]">{toHex(colour)}</span>
    </div>
  );
}

function Swatches({ colours, onPick, labels }: { colours: Rgb[]; onPick: (hex: string) => void; labels?: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colours.map((c, i) => (
        <button key={i} onClick={() => onPick(toHex(c))} title={`Use ${toHex(c)}`} aria-label={`Use ${toHex(c)}`} className="group flex w-[68px] flex-col items-stretch gap-1 text-left">
          <span className="relative block h-11 rounded-lg border border-line" style={{ background: CHECKER }}><span className="absolute inset-0 rounded-[7px]" style={{ background: css(c) }} /></span>
          <span className="font-mono text-[11px] text-faint group-hover:text-fg">{labels?.[i] ?? toHex(c)}</span>
        </button>
      ))}
    </div>
  );
}

export default function ColourTool({ tool, hue, init, onClose, mobile }: ToolProps) {
  const [input, setInput] = useState(init?.text?.trim() || "#3366cc");
  const [bgInput, setBgInput] = useState("#ffffff");
  const [steps, setSteps] = useState<"3" | "5" | "7">("5");
  const c = useMemo(() => parseColour(input), [input]);
  const bg = useMemo(() => parseColour(bgInput), [bgInput]);
  const n = Number(steps);

  const ratio = c && bg ? contrastRatio(c, bg) : null;
  const [side, setSide] = useState<"fg" | "bg">("fg");
  const [undo, setUndo] = useState<{ side: "fg" | "bg"; prev: string } | null>(null);
  const rec = useMemo(() => (c && bg ? recommend(c, bg, side) : null), [c, bg, side]);
  const edit = (set: (v: string) => void) => (v: string) => { setUndo(null); set(v); };
  const use = () => {
    if (rec?.kind !== "found") return;
    setUndo({ side, prev: side === "fg" ? input : bgInput });
    (side === "fg" ? setInput : setBgInput)(toHex(rec.colour));
  };

  const lighter = useMemo(() => (c ? ramp(c, "lighter", n).reverse() : []), [c, n]);
  const darker = useMemo(() => (c ? ramp(c, "darker", n) : []), [c, n]);
  const harmony = useMemo(() => (c ? [180, 120, 240, 30, -30].map((d) => rotate(c, d)) : []), [c]);

  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={mobile ? undefined : "Hex, RGB, HSL and OKLCH, contrast, palette steps"}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className={cx("grid gap-3", mobile ? "grid-cols-1" : "grid-cols-2")}>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="jk-card flex flex-col gap-3 rounded-2xl p-3.5">
              <ColourInput label="Colour" value={input} onChange={edit(setInput)} colour={c} />
              <div className="h-16 overflow-hidden rounded-xl border border-line" style={{ background: CHECKER }}><div className="size-full" style={{ background: c ? css(c) : "transparent" }} /></div>
              {!c && <ErrorLine>Not a colour. Use hex, rgb(), hsl() or oklch().</ErrorLine>}
            </div>
            <Pane title="Formats">
              <ul className="divide-y divide-line">
                <ValueRow label="Hex" value={c ? toHex(c) : ""} />
                <ValueRow label="RGB" value={c ? toRgbString(c) : ""} />
                <ValueRow label="HSL" value={c ? toHslString(c) : ""} />
                <ValueRow label="OKLCH" value={c ? toOklchString(c) : ""} />
              </ul>
            </Pane>
          </div>

          <Pane title="Contrast" right={<Btn onClick={() => { setUndo(null); setInput(bgInput); setBgInput(input); }} title="Swap text and background"><ArrowUpDown size={14} /> Swap</Btn>}>
            <div className="flex flex-col gap-3 p-3.5">
              <ColourInput label="Background" value={bgInput} onChange={edit(setBgInput)} colour={bg} />
              {!bg && <ErrorLine>Background is not a colour.</ErrorLine>}
              {c && bg && ratio && (
                <>
                  <Sample fg={c} bg={bg} />
                  <p className="text-[26px] font-semibold leading-none">{ratioText(ratio)}<span className="text-[16px] font-normal text-faint"> : 1</span></p>
                  <Tests ratio={ratio} />
                  <div className="flex flex-col gap-3 border-t border-line pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-[13px] font-semibold">Recommended</h4>
                      <Seg small label="Change" value={side} onChange={setSide} options={[{ id: "fg", label: "Colour" }, { id: "bg", label: "Background" }]} />
                    </div>
                    {undo && (
                      <div className="flex items-center gap-2 text-[13px] text-dim">
                        <span className="min-w-0 flex-1">Changed from <span className="font-mono text-fg">{undo.prev}</span></span>
                        <Btn onClick={() => { (undo.side === "fg" ? setInput : setBgInput)(undo.prev); setUndo(null); }}>Undo</Btn>
                      </div>
                    )}
                    {rec?.kind === "passes" && <p className="text-[13px] text-dim">This {side === "fg" ? "colour" : "background"} already passes every test.</p>}
                    {rec?.kind === "impossible" && (
                      <p className="text-[13px] text-dim">
                        No {side === "fg" ? "colour" : "background"} passes every test against {toHex(side === "fg" ? bg : c)}. The most any can reach is {ratioText(rec.best)} : 1. Change the {side === "fg" ? "background" : "colour"} instead.
                      </p>
                    )}
                    {rec?.kind === "found" && (
                      <>
                        <div className="flex items-start gap-3">
                          <Chip label="Now" colour={side === "fg" ? c : bg} />
                          <Chip label="Recommended" colour={rec.colour} />
                          <p className="flex-1 pt-6 text-right text-[18px] font-semibold leading-none">{ratioText(rec.ratio)}<span className="text-[13px] font-normal text-faint"> : 1</span></p>
                        </div>
                        <Sample fg={side === "fg" ? rec.colour : c} bg={side === "fg" ? bg : rec.colour} />
                        <Tests ratio={rec.ratio} />
                        <Btn primary onClick={use}>Use {toHex(rec.colour)}</Btn>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </Pane>
        </div>

        <Pane title="Palette" right={<Seg small label="Steps" value={steps} onChange={setSteps} options={[{ id: "3", label: "3" }, { id: "5", label: "5" }, { id: "7", label: "7" }]} />}>
          {c ? (
            <div className="flex flex-col gap-4 p-3.5">
              <div className="flex flex-col gap-1.5">
                <h4 className="text-[12px] text-faint">Lighter to darker</h4>
                <Swatches colours={[...lighter, c, ...darker]} onPick={edit(setInput)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <h4 className="text-[12px] text-faint">Other hues, same lightness</h4>
                <Swatches colours={harmony} onPick={edit(setInput)} labels={["+180", "+120", "+240", "+30", "-30"].map((d, i) => `${d}° ${toHex(harmony[i])}`)} />
              </div>
            </div>
          ) : <p className="p-4 text-[13px] text-faint">Enter a colour above.</p>}
        </Pane>
      </div>
    </ToolFrame>
  );
}
