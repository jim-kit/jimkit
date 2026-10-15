"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolProps } from "@jimkit/sdk";
import { Chip, Pane, Seg, ToolFrame, cx } from "@jimkit/ui";
import { describeCron, nextRuns, parseCron } from "./lib/cron";
import { allZones, localZone, offsetLabel, relative, rfc2822In, zoneOffset } from "./lib/time";
import { ErrorLine, Field, Input, Select } from "./kit";

const EXAMPLES: [string, string][] = [["*/5 * * * *", "Every 5 minutes"], ["0 * * * *", "Hourly"], ["0 9 * * 1-5", "Weekdays at 9:00"], ["30 2 * * 0", "Sundays at 2:30"], ["0 0 1 * *", "Monthly"], ["0 0 1 1 *", "Yearly"]];

export default function CronTool({ tool, hue, init, onClose, mobile }: ToolProps) {
  const local = useMemo(localZone, []);
  const zones = useMemo(() => { const z = allZones(); return z.includes(local) ? z : [local, ...z]; }, [local]);
  const [expr, setExpr] = useState(init?.text?.trim() || "*/15 9-17 * * 1-5");
  const [zone, setZone] = useState(local);
  const [count, setCount] = useState<"5" | "10" | "20">("10");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const parsed = useMemo(() => parseCron(expr), [expr]);
  const runs = useMemo(() => (parsed.ok ? nextRuns(parsed.cron, Date.now(), Number(count), zone) : []), [parsed, count, zone, now]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={mobile ? undefined : "Standard 5-field cron syntax"}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="jk-card flex shrink-0 flex-col gap-3 rounded-2xl p-3.5">
          <Field label="Cron expression"><Input aria-label="Cron expression" value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="minute hour day-of-month month day-of-week" className="text-[16px]" /></Field>
          <div className="flex flex-wrap gap-1.5">{EXAMPLES.map(([e, label]) => <Chip key={e} on={expr.trim() === e} onClick={() => setExpr(e)} title={e}>{label}</Chip>)}</div>
          {parsed.ok ? (
            <>
              <p className="text-[15px] font-medium">{describeCron(parsed.cron)}</p>
              <dl className="grid grid-cols-5 gap-2 text-center">
                {parsed.cron.fields.map((f, i) => (
                  <div key={f.name} className="min-w-0 rounded-xl bg-tint px-1.5 py-2">
                    <dt className="truncate text-[11px] text-faint">{["Minute", "Hour", "Day", "Month", "Weekday"][i]}</dt>
                    <dd className="mt-0.5 truncate font-mono text-[14px]">{f.raw}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : <ErrorLine>{parsed.error}</ErrorLine>}
        </div>

        <Pane title="Next runs" className={cx("shrink-0", mobile ? "" : "min-h-[280px] flex-auto")}
          right={<Seg small label="How many runs" value={count} onChange={setCount} options={[{ id: "5", label: "5" }, { id: "10", label: "10" }, { id: "20", label: "20" }]} />}>
          <div className="flex flex-col">
            <div className="border-b border-line p-3">
              <Field label="Time zone">
                <Select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Time zone" className="max-w-[360px]">
                  {zones.map((z) => <option key={z} value={z}>{z}{z === local ? " (this device)" : ""}</option>)}
                </Select>
              </Field>
            </div>
            {parsed.ok && !runs.length ? <p className="p-4 text-[13px] text-faint">This expression never runs: that date does not exist.</p> : (
              <ol className="divide-y divide-line">
                {runs.map((t, i) => (
                  <li key={t} className="flex flex-wrap items-baseline gap-x-3 px-3.5 py-2.5">
                    <span className="w-6 text-[11.5px] text-faint">{i + 1}</span>
                    <span className="font-mono text-[13px]">{rfc2822In(t, zone).replace(/:\d\d [+-]\d{4}$/, "")}</span>
                    <span className="text-[12px] text-faint">UTC{offsetLabel(zoneOffset(t, zone))}</span>
                    <span className="ml-auto text-[12.5px] text-dim">{relative(t, now)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Pane>
      </div>
    </ToolFrame>
  );
}
