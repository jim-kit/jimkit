"use client";

import { useMemo, useState } from "react";
import type { ToolProps } from "@jimkit/sdk";
import { Chip, Pane, Seg, ToolFrame, cx } from "@jimkit/ui";
import { bitOps, bitsOf, flipBit, formatSize, group, parseInteger, parseSize, signed, toBase, unitNames, type System, type Width } from "./lib/numbers";
import { ErrorLine, Field, Input, Select, ValueRow } from "./kit";

type Tab = "base" | "bytes" | "bits";

function BaseTab() {
  const [text, setText] = useState("255");
  const [from, setFrom] = useState(10);
  const [custom, setCustom] = useState(36);
  const [upper, setUpper] = useState(false);
  const r = useMemo(() => parseInteger(text, from), [text, from]);
  const show = (n: bigint, b: number) => { const s = toBase(n, b); return upper ? s.toUpperCase() : s; };
  const rows: [string, number, number][] = [["Binary", 2, 4], ["Octal", 8, 3], ["Decimal", 10, 3], ["Hex", 16, 4], ["Base 32", 32, 4], ["Base 36", 36, 4]];
  return (
    <div className="flex flex-col gap-3">
      <div className="jk-card flex flex-wrap items-end gap-3 rounded-2xl p-3.5">
        <Field label="Number" className="min-w-[220px] flex-1"><Input aria-label="Number" value={text} onChange={(e) => setText(e.target.value)} className="text-[15px]" placeholder="255, 0xff, 0b1010" /></Field>
        <Field label="Read as base" className="w-[110px]"><Select value={from} onChange={(e) => setFrom(Number(e.target.value))} aria-label="Base of the input">{Array.from({ length: 35 }, (_, i) => i + 2).map((b) => <option key={b} value={b}>{b}</option>)}</Select></Field>
        <Chip on={upper} onClick={() => setUpper(!upper)}>Uppercase</Chip>
      </div>
      {!r.ok ? <ErrorLine>{r.error}</ErrorLine> : (
        <Pane title="Result">
          <ul className="divide-y divide-line">
            {rows.map(([label, b, g]) => <ValueRow key={b} label={label} value={show(r.value, b)} hint={r.value > 9999n || b === 2 ? group(show(r.value, b), g) : undefined} />)}
            <li className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
              <span className="w-[84px] shrink-0 text-[12px] font-semibold text-faint">Base</span>
              <Select value={custom} onChange={(e) => setCustom(Number(e.target.value))} aria-label="Other base" className="w-[90px]">{Array.from({ length: 35 }, (_, i) => i + 2).map((b) => <option key={b} value={b}>{b}</option>)}</Select>
              <span className="min-w-0 flex-1 break-all font-mono text-[13px]">{show(r.value, custom)}</span>
            </li>
          </ul>
        </Pane>
      )}
    </div>
  );
}

function BytesTab() {
  const [text, setText] = useState("1.5 GiB");
  const r = useMemo(() => parseSize(text), [text]);
  return (
    <div className="flex flex-col gap-3">
      <div className="jk-card rounded-2xl p-3.5">
        <Field label="Size"><Input aria-label="Size" value={text} onChange={(e) => setText(e.target.value)} className="text-[15px]" placeholder="1.5 GiB, 800 MB, 4096" /></Field>
      </div>
      {!r.ok ? <ErrorLine>{r.error}</ErrorLine> : (
        <>
          <Pane title="Result">
            <ul className="divide-y divide-line">
              <ValueRow label="Bytes" value={String(r.value)} hint={r.value >= 1000n ? group(String(r.value), 3, ",") : undefined} />
              <ValueRow label="SI" value={formatSize(r.value, "si")} hint="powers of 1000" />
              <ValueRow label="IEC" value={formatSize(r.value, "iec")} hint="powers of 1024" />
            </ul>
          </Pane>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["si", "iec"] as System[]).map((sys) => (
              <Pane key={sys} title={sys === "si" ? "SI units" : "IEC units"}>
                <ul className="divide-y divide-line">
                  {unitNames(sys).slice(0, 7).map((u, i) => {
                    const f = (sys === "si" ? 1000n : 1024n) ** BigInt(i);
                    const whole = r.value / f, rest = (((r.value % f) * 10000n) / f);
                    const v = `${group(String(whole), 3, ",")}${rest ? "." + String(rest).padStart(4, "0").replace(/0+$/, "") : ""}`;
                    return <li key={u} className="flex justify-between gap-3 px-3.5 py-2 font-mono text-[13px]"><span className="text-faint">{u}</span><span className="min-w-0 break-all text-right">{v}</span></li>;
                  })}
                </ul>
              </Pane>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BitsTab() {
  const [width, setWidth] = useState<Width>(32);
  const [text, setText] = useState("0xC0A80001");
  const [other, setOther] = useState("0xFFFFFF00");
  const [shift, setShift] = useState(4);
  const a = useMemo(() => parseInteger(text, 10), [text]);
  const b = useMemo(() => parseInteger(other, 10), [other]);
  const value = a.ok ? BigInt.asUintN(width, a.value) : 0n;
  const bits = bitsOf(value, width);
  const ops = a.ok && b.ok ? bitOps(a.value, b.value, width, shift) : null;
  const hex = (n: bigint) => "0x" + n.toString(16).toUpperCase().padStart(width / 4, "0");
  const cols = 8; // a byte per row
  return (
    <div className="flex flex-col gap-3">
      <div className="jk-card flex flex-wrap items-end gap-3 rounded-2xl p-3.5">
        <Field label="Value" className="min-w-[220px] flex-1"><Input aria-label="Value" value={text} onChange={(e) => setText(e.target.value)} className="text-[15px]" placeholder="255, 0xff, 0b1010, -1" /></Field>
        <div className="flex flex-col gap-1 text-[12px] text-faint"><span>Width</span><Seg label="Width in bits" value={String(width) as "8"} onChange={(v) => setWidth(Number(v) as Width)} options={[{ id: "8", label: "8" }, { id: "16", label: "16" }, { id: "32", label: "32" }, { id: "64", label: "64" }]} /></div>
      </div>
      {!a.ok ? <ErrorLine>{a.error}</ErrorLine> : (
        <>
          <Pane title="Bits" right={<span className="text-[12px] text-faint">Click a bit to flip it</span>}>
            <div className="flex flex-col gap-1.5 overflow-x-auto p-3.5">
              {Array.from({ length: width / cols }, (_, row) => (
                <div key={row} className="flex items-center gap-2">
                  <span className="w-9 shrink-0 text-right font-mono text-[11px] text-faint">{width - 1 - row * cols}</span>
                  <div className="flex gap-1">
                    {bits.slice(row * cols, row * cols + cols).map((v, i) => {
                      const index = width - 1 - (row * cols + i);
                      return (
                        <button key={index} onClick={() => setText(String(flipBit(value, width, index)))} aria-label={`Bit ${index}, ${v}`} aria-pressed={v === 1}
                          className={cx("grid size-8 place-items-center rounded-lg border font-mono text-[13px] transition active:scale-95", i === 3 && "mr-2", v ? "border-accent/60 bg-accent/20 text-fg" : "border-line text-faint hover:bg-tint-2")}>{v}</button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Pane>
          <Pane title="Value">
            <ul className="divide-y divide-line">
              <ValueRow label="Unsigned" value={String(value)} />
              <ValueRow label="Signed" value={String(signed(value, width))} />
              <ValueRow label="Hex" value={hex(value)} />
              <ValueRow label="Octal" value={"0o" + value.toString(8)} />
              <ValueRow label="Binary" value={group(value.toString(2).padStart(width, "0"), 4)} />
            </ul>
          </Pane>
          <Pane title="Operators">
            <div className="flex flex-wrap items-end gap-3 border-b border-line p-3.5">
              <Field label="Second value" className="min-w-[200px] flex-1"><Input aria-label="Second value" value={other} onChange={(e) => setOther(e.target.value)} /></Field>
              <Field label="Shift by" className="w-[90px]"><Input type="number" min={0} max={width} value={shift} onChange={(e) => setShift(Math.min(width, Math.max(0, Math.round(e.target.valueAsNumber) || 0)))} /></Field>
            </div>
            {ops ? (
              <ul className="divide-y divide-line">
                <ValueRow label="AND" value={hex(ops.and)} hint={`= ${ops.and}`} />
                <ValueRow label="OR" value={hex(ops.or)} hint={`= ${ops.or}`} />
                <ValueRow label="XOR" value={hex(ops.xor)} hint={`= ${ops.xor}`} />
                <ValueRow label="NOT" value={hex(ops.not)} hint={`= ${ops.not}`} />
                <ValueRow label="Shift left" value={hex(ops.shl)} hint={`= ${ops.shl}`} />
                <ValueRow label="Shift right" value={hex(ops.shr)} hint="zero fill" />
                <ValueRow label="Shift right" value={hex(ops.sar)} hint="keeps the sign" />
                <ValueRow label="Bits set" value={String(ops.popcount)} />
              </ul>
            ) : <div className="p-4"><ErrorLine>{b.ok ? "" : `Second value: ${b.error}`}</ErrorLine></div>}
          </Pane>
        </>
      )}
    </div>
  );
}

export default function NumbersTool({ tool, hue, onClose, mobile }: ToolProps) {
  const [tab, setTab] = useState<Tab>("base");
  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={mobile ? undefined : "Number bases, byte sizes and bits"}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="self-start"><Seg label="Mode" value={tab} onChange={setTab} options={[{ id: "base", label: "Bases" }, { id: "bytes", label: "Byte sizes" }, { id: "bits", label: "Bits" }]} /></div>
        {tab === "base" && <BaseTab />}
        {tab === "bytes" && <BytesTab />}
        {tab === "bits" && <BitsTab />}
      </div>
    </ToolFrame>
  );
}
