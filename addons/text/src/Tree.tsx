"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

const PAGE = 100;

const isBranch = (v: unknown): v is object => !!v && typeof v === "object";
const size = (v: object) => (Array.isArray(v) ? v.length : Object.keys(v).length);

function Leaf({ v }: { v: unknown }) {
  if (typeof v === "string") return <span className="break-all text-ok">{JSON.stringify(v)}</span>;
  if (typeof v === "number") return <span className="text-warn">{String(v)}</span>;
  return <span className="text-dim">{String(v)}</span>;
}

function Node({ name, index, value, depth, open }: { name?: string; index?: boolean; value: unknown; depth: number; open: number }) {
  const [expanded, setExpanded] = useState(depth < open);
  const [shown, setShown] = useState(PAGE);
  const label = name === undefined ? null : <><span className={index ? "text-faint" : "text-accent"}>{name}</span><span className="text-faint">: </span></>;
  if (!isBranch(value)) return <div className="py-[1px] pl-[18px]">{label}<Leaf v={value} /></div>;
  const arr = Array.isArray(value);
  const entries = arr ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="flex w-full items-center gap-1 rounded py-[1px] text-left hover:bg-tint">
        <ChevronRight size={14} className={`shrink-0 text-faint transition ${expanded ? "rotate-90" : ""}`} />
        <span>{label}<span className="text-faint">{arr ? "[" : "{"}{expanded ? "" : ` ${size(value)} ${arr ? "items" : "keys"} ${arr ? "]" : "}"}`}</span></span>
      </button>
      {expanded && (
        <div className="ml-[7px] border-l border-line pl-2">
          {entries.slice(0, shown).map(([k, v]) => <Node key={k} name={k} index={arr} value={v} depth={depth + 1} open={open} />)}
          {entries.length > shown && <button onClick={() => setShown(shown + PAGE)} className="py-1 pl-[18px] text-[12px] text-dim underline underline-offset-2">Show {Math.min(PAGE, entries.length - shown)} more of {entries.length - shown}</button>}
        </div>
      )}
    </div>
  );
}

/** A collapsible view of parsed JSON/YAML. `open` is how many levels start expanded; changing it (with a new key) resets every node. */
export function Tree({ value, open }: { value: unknown; open: number }) {
  return <div className="font-mono text-[12.5px] leading-[1.7]"><Node value={value} depth={0} open={open} /></div>;
}
