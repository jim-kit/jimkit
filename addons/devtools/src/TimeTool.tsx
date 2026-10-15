"use client";

import { Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ToolProps } from "@jimkit/sdk";
import { Btn, Chip, Pane, Seg, ToolFrame, cx } from "@jimkit/ui";
import { allZones, dateDiff, describeDiff, isoIn, localZone, offsetLabel, parseInstant, readableIn, relative, rfc2822In, zoneOffset, type Unit } from "./lib/time";
import { ErrorLine, Field, Input, Select, ValueRow } from "./kit";

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });

export default function TimeTool({ tool, hue, init, onClose, mobile }: ToolProps) {
  const local = useMemo(localZone, []);
  const zones = useMemo(() => { const z = allZones(); return z.includes(local) ? z : [local, ...z]; }, [local]);
  const [zone, setZone] = useState(local);
  const [input, setInput] = useState(init?.text ?? "");
  const [unit, setUnit] = useState<Unit>("auto");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const live = !input.trim();
  const parsed = live ? ({ ok: true, ms: now, how: "Now" } as const) : parseInstant(input, zone, unit);
  const t = parsed.ok ? parsed.ms : null;
  const off = t !== null ? zoneOffset(t, zone) : 0;

  const a = from.trim() ? parseInstant(from, zone) : ({ ok: true, ms: now, how: "" } as const);
  const b = to.trim() ? parseInstant(to, zone) : ({ ok: true, ms: now, how: "" } as const);
  const diff = a.ok && b.ok ? dateDiff(a.ms, b.ms, zone) : null;

  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={mobile ? undefined : "Unix time, ISO 8601, RFC 2822, time zones"}>
      <div className={cx("grid min-h-0 flex-1 gap-3 overflow-y-auto p-3", mobile ? "grid-cols-1 content-start" : "grid-cols-[minmax(0,3fr)_minmax(0,2fr)] content-start")}>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="jk-card flex flex-col gap-3 rounded-2xl p-3.5">
            <Field label="Timestamp or date">
              <div className="flex gap-2">
                <Input aria-label="Timestamp or date" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Unix time or date, e.g. 1700000000 or 2024-03-09 14:05. Empty uses now" className="flex-1 text-[14px]" />
                <Btn onClick={() => setInput(String(Math.floor(Date.now() / 1000)))} title="Fill in the current Unix time"><Clock size={14} /> Now</Btn>
              </div>
            </Field>
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5">
              <Field label="Time zone" className="min-w-[220px] flex-1">
                <Select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Time zone">
                  {zones.map((z) => <option key={z} value={z}>{z}{z === local ? " (this device)" : ""}</option>)}
                </Select>
              </Field>
              <div className="flex gap-1.5 pb-0.5"><Chip on={zone === "UTC"} onClick={() => setZone("UTC")}>UTC</Chip><Chip on={zone === local} onClick={() => setZone(local)}>Local</Chip></div>
              <div className="flex flex-col gap-1 text-[12px] text-faint"><span>Number unit</span><Seg small label="Unit of a plain number" value={unit} onChange={setUnit} options={[{ id: "auto", label: "Auto" }, { id: "s", label: "Seconds" }, { id: "ms", label: "Millis" }]} /></div>
            </div>
            {parsed.ok ? <p className="text-[12.5px] text-faint">{parsed.how}</p> : <ErrorLine>{parsed.error}</ErrorLine>}
          </div>

          <Pane title={`Result · UTC${offsetLabel(off)}`}>
            {t === null ? <p className="p-4 text-[13px] text-faint">No valid time.</p> : (
              <ul className="divide-y divide-line">
                <ValueRow label="Unix seconds" value={String(Math.floor(t / 1000))} />
                <ValueRow label="Unix millis" value={String(t)} />
                <ValueRow label="ISO 8601 UTC" value={new Date(t).toISOString()} />
                <ValueRow label="With offset" value={isoIn(t, zone)} />
                <ValueRow label="RFC 2822" value={rfc2822In(t, zone)} />
                <ValueRow label="Readable" value={readableIn(t, zone)} />
                {zone !== local && <ValueRow label="This device" value={readableIn(t, local)} />}
                <ValueRow label="Relative" value={relative(t, now)} />
              </ul>
            )}
          </Pane>
        </div>

        <Pane title="Difference" className="self-start">
          <div className="flex flex-col gap-3 p-3.5">
            <Field label="From"><Input aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Empty uses now" /></Field>
            <Field label="To"><Input aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Empty uses now" /></Field>
            {!a.ok && <ErrorLine>From: {a.error}</ErrorLine>}
            {!b.ok && <ErrorLine>To: {b.error}</ErrorLine>}
            {diff && (
              <div className="flex flex-col gap-2 rounded-xl bg-tint p-3">
                <p className="text-[15px] font-medium">{describeDiff(diff)}{diff.negative && <span className="ml-2 text-[12.5px] font-normal text-faint">To is before From</span>}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 font-mono text-[12.5px]">
                  {[["Days", diff.totalMs / 86400e3], ["Hours", diff.totalMs / 3600e3], ["Minutes", diff.totalMs / 60e3], ["Seconds", diff.totalMs / 1e3], ["Millis", diff.totalMs]].map(([k, v]) => (
                    <div key={k as string} className="contents"><dt className="font-sans text-faint">{k as string}</dt><dd>{num(v as number)}</dd></div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </Pane>
      </div>
    </ToolFrame>
  );
}
