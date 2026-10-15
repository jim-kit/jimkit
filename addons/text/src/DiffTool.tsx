"use client";

import { ArrowLeftRight, FileInput, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { ToolProps } from "@jimkit/sdk";
import { Area, Btn, Chip, Pane, Seg, ToolFrame, useDebounced, useFilePicker } from "@jimkit/ui";
import { diffText, type Part, type Row } from "./lib/diff";

const CONTEXT = 3;

function Parts({ parts, text, tone }: { parts?: Part[]; text: string; tone: "del" | "add" }) {
  if (!parts) return <>{text || " "}</>;
  return <>{parts.map((p, i) => (p.changed ? <mark key={i} className={`rounded-[3px] text-fg ${tone === "del" ? "bg-bad/40" : "bg-ok/35"}`}>{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>))}</>;
}

/** Collapse long runs of unchanged rows into a "N unchanged lines" marker. */
function fold(rows: Row[], on: boolean): (Row | { skip: number })[] {
  if (!on) return rows;
  const keep = new Set<number>();
  rows.forEach((r, i) => { if (r.kind !== "eq") for (let k = Math.max(0, i - CONTEXT); k <= Math.min(rows.length - 1, i + CONTEXT); k++) keep.add(k); });
  const out: (Row | { skip: number })[] = [];
  let skipped = 0;
  rows.forEach((r, i) => {
    if (keep.has(i)) { if (skipped) { out.push({ skip: skipped }); skipped = 0; } out.push(r); } else skipped++;
  });
  if (skipped) out.push({ skip: skipped });
  return out;
}

const num = "w-10 shrink-0 select-none px-2 text-right text-[11.5px] tabular-nums text-faint/70";

export default function DiffTool({ tool, hue, init, onClose, mobile }: ToolProps) {
  const [a, setA] = useState(init?.text ?? "");
  const [b, setB] = useState("");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreSpace, setIgnoreSpace] = useState(false);
  const [layout, setLayout] = useState<"split" | "inline">(mobile ? "inline" : "split");
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [showInputs, setShowInputs] = useState(true);
  const pa = useFilePicker(undefined, async (f) => setA(await f.text()));
  const pb = useFilePicker(undefined, async (f) => setB(await f.text()));
  const da = useDebounced(a, 200), db = useDebounced(b, 200);
  const res = useMemo(() => diffText(da, db, { ignoreCase, ignoreSpace }), [da, db, ignoreCase, ignoreSpace]);
  const rows = useMemo(() => fold(res.rows, onlyChanges), [res.rows, onlyChanges]);
  const empty = !da && !db;
  const CAP = 4000;

  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={mobile ? undefined : "Compare two texts"}
      actions={<><Btn onClick={() => { setA(b); setB(a); }} title="Swap the two sides"><ArrowLeftRight size={14} /> {mobile ? "" : "Swap"}</Btn><Btn onClick={() => { setA(""); setB(""); }}><Trash2 size={14} /> {mobile ? "" : "Clear"}</Btn></>}>
      {pa.input}{pb.input}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3.5 py-2.5">
        <Chip on={ignoreCase} onClick={() => setIgnoreCase(!ignoreCase)}>Ignore case</Chip>
        <Chip on={ignoreSpace} onClick={() => setIgnoreSpace(!ignoreSpace)}>Ignore whitespace</Chip>
        <Chip on={onlyChanges} onClick={() => setOnlyChanges(!onlyChanges)} title="Fold long runs of identical lines">Only changes</Chip>
        <Seg label="Layout" small value={layout} onChange={setLayout} options={[{ id: "split", label: "Side by side" }, { id: "inline", label: "Inline" }]} />
        <Chip on={showInputs} onClick={() => setShowInputs(!showInputs)}>Inputs</Chip>
        <span className="ml-auto flex items-center gap-3 text-[12.5px] tabular-nums">
          {empty ? <span className="text-faint">Paste text on both sides</span> : res.same ? <span className="text-ok">Identical{ignoreCase || ignoreSpace ? " (with your options)" : ""}</span> : <>
            <span className="text-ok">+{res.added}</span><span className="text-bad">−{res.removed}</span><span className="text-warn">~{res.changed}</span></>}
        </span>
      </div>

      <div className={`grid min-h-0 flex-1 ${showInputs ? (mobile ? "grid-rows-[minmax(120px,32%)_1fr]" : "grid-rows-[minmax(140px,36%)_1fr]") : "grid-rows-1"}`}>
        {showInputs && (
          <div className={`grid min-h-0 gap-3 p-3 pb-0 ${mobile ? "grid-cols-1 grid-rows-2" : "grid-cols-2"}`}>
            <Pane title="Original" right={<Btn onClick={pa.open}><FileInput size={14} /></Btn>}><Area label="Original text" value={a} onChange={setA} wrap={false} placeholder="The old version…" /></Pane>
            <Pane title="Changed" right={<Btn onClick={pb.open}><FileInput size={14} /></Btn>}><Area label="Changed text" value={b} onChange={setB} wrap={false} placeholder="The new version…" /></Pane>
          </div>
        )}
        <div className="min-h-0 overflow-auto p-3">
          {empty ? (
            <p className="grid h-full place-items-center text-center text-[13.5px] text-faint">The differences show up here, word by word.</p>
          ) : res.same ? (
            <p className="grid h-full place-items-center text-center text-[14px] text-ok">Nothing differs.</p>
          ) : (
            <>
            {res.tooDifferent && <p className="mb-3 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[13px] text-dim">These are too different to compare line by line. The lines the two sides share at the start and end are matched; everything in between is shown as removed, then added.</p>}
            <div className="min-w-max overflow-hidden rounded-2xl border border-line bg-raised font-mono text-[12.5px] leading-[1.65]">
              {rows.slice(0, CAP).map((r, i) => {
                if ("skip" in r) return <div key={i} className="border-y border-line bg-tint px-3 py-1 text-center font-sans text-[11.5px] text-faint">{r.skip} unchanged {r.skip === 1 ? "line" : "lines"}</div>;
                if (layout === "inline") {
                  return (
                    <Fragment key={i}>
                      {(r.kind === "change" || r.kind === "del") && r.left && <div className="flex bg-bad/10"><span className={num}>{r.left.n}</span><span className="w-5 shrink-0 text-bad">−</span><span className="whitespace-pre pr-3"><Parts parts={r.left.parts} text={r.left.text} tone="del" /></span></div>}
                      {(r.kind === "change" || r.kind === "add") && r.right && <div className="flex bg-ok/10"><span className={num}>{r.right.n}</span><span className="w-5 shrink-0 text-ok">+</span><span className="whitespace-pre pr-3"><Parts parts={r.right.parts} text={r.right.text} tone="add" /></span></div>}
                      {r.kind === "eq" && r.left && <div className="flex text-dim"><span className={num}>{r.left.n}</span><span className="w-5 shrink-0" /><span className="whitespace-pre pr-3">{r.left.text || " "}</span></div>}
                    </Fragment>
                  );
                }
                const L = r.left, R = r.right;
                return (
                  <div key={i} className="grid grid-cols-2 divide-x divide-line">
                    <div className={`flex ${r.kind === "del" || r.kind === "change" ? "bg-bad/10" : r.kind === "add" ? "bg-tint" : "text-dim"}`}><span className={num}>{L?.n ?? ""}</span><span className="whitespace-pre pr-3">{L ? <Parts parts={L.parts} text={L.text} tone="del" /> : " "}</span></div>
                    <div className={`flex ${r.kind === "add" || r.kind === "change" ? "bg-ok/10" : r.kind === "del" ? "bg-tint" : "text-dim"}`}><span className={num}>{R?.n ?? ""}</span><span className="whitespace-pre pr-3">{R ? <Parts parts={R.parts} text={R.text} tone="add" /> : " "}</span></div>
                  </div>
                );
              })}
              {rows.length > CAP && <div className="border-t border-line px-3 py-2 text-center font-sans text-[12px] text-faint">Showing the first {CAP.toLocaleString()} rows of {rows.length.toLocaleString()}.</div>}
            </div>
            </>
          )}
        </div>
      </div>
    </ToolFrame>
  );
}
