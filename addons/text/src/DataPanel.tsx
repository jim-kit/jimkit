"use client";

import { ChevronsDownUp, ChevronsUpDown, LocateFixed } from "lucide-react";
import { useMemo, useState } from "react";
import { Btn, Chip, IconBtn, Seg, useDebounced } from "@jimkit/ui";
import { Tree } from "./Tree";
import { describe, type DataFormat, type Parsed } from "./lib/data";
import { queryPath } from "./lib/query";

export type Indent = 2 | 4 | "tab";

/** The strip above a JSON or YAML document: reformat in place, and whether it parses. */
export function DataBar({ format, checked, indent, setIndent, sortKeys, setSortKeys, onFormat, onMinify, onConvert, onShowError }: {
  format: DataFormat; checked: Parsed | null; indent: Indent; setIndent: (i: Indent) => void; sortKeys: boolean; setSortKeys: (b: boolean) => void;
  onFormat: () => void; onMinify: () => void; onConvert: () => void; onShowError: () => void;
}) {
  const name = format.toUpperCase();
  return (
    <div role="toolbar" aria-label={`${name} tools`} className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-surface px-2.5 py-1.5">
      <Btn onClick={onFormat} title="Reformat the document (undo brings it back)">Format</Btn>
      {format === "json" && <Btn onClick={onMinify} title="Remove all whitespace">Minify</Btn>}
      <Btn onClick={onConvert} title={`Rewrite the document as ${format === "json" ? "YAML" : "JSON"}`}>{format === "json" ? "To YAML" : "To JSON"}</Btn>
      <Seg label="Indent" small value={String(indent)} onChange={(v) => setIndent(v === "tab" ? "tab" : (Number(v) as 2 | 4))} options={[{ id: "2", label: "2" }, { id: "4", label: "4" }, { id: "tab", label: "Tab" }]} />
      <Chip on={sortKeys} onClick={() => setSortKeys(!sortKeys)} title="Sort keys alphabetically, at every level, when formatting">Sort keys</Chip>
      <span className="ml-auto flex min-w-0 items-center gap-2 text-[12.5px]">
        {checked === null ? <span className="text-faint">Nothing to check yet</span> : checked.ok ? (
          <><span className="size-2 shrink-0 rounded-full bg-ok" /><span className="text-ok">Valid {name}</span><span className="truncate text-faint">{describe(checked.value)}</span></>
        ) : (
          <>
            <span className="size-2 shrink-0 rounded-full bg-bad" />
            <span className="min-w-0 truncate text-bad" title={checked.message}>{checked.line ? `Line ${checked.line}${checked.col ? `, col ${checked.col}` : ""} · ` : ""}{checked.message}</span>
            {checked.line ? <IconBtn label="Select where parsing stopped" onClick={onShowError}><LocateFixed size={15} /></IconBtn> : null}
          </>
        )}
      </span>
    </div>
  );
}

/** A collapsible tree of the document, with a path query (e.g. $.limits.lan) that narrows it to what it finds. */
export function DataTreePane({ checked }: { checked: Parsed | null }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState({ depth: 2, gen: 0 });
  const dq = useDebounced(query, 150);
  const found = useMemo(() => (dq.trim() && checked?.ok ? queryPath(checked.value, dq) : null), [dq, checked]);
  const value = found?.ok ? found.matches : checked?.ok ? checked.value : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-2.5 py-1.5">
        <div className={`flex min-w-0 flex-1 items-center rounded-xl border bg-field ${found && !found.ok ? "border-bad/60" : "border-line-strong focus-within:border-accent/60"}`}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Path query" placeholder="Path, e.g. $.limits.lan" autoComplete="off" spellCheck={false}
            className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 font-mono text-[12.5px] outline-none placeholder:font-sans placeholder:text-faint/60" />
        </div>
        <IconBtn label="Expand all" onClick={() => setOpen((o) => ({ depth: 99, gen: o.gen + 1 }))}><ChevronsUpDown size={15} /></IconBtn>
        <IconBtn label="Collapse all" onClick={() => setOpen((o) => ({ depth: 0, gen: o.gen + 1 }))}><ChevronsDownUp size={15} /></IconBtn>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3.5 [scrollbar-width:thin]">
        {found && !found.ok ? <p className="text-[13.5px] font-medium text-bad">{found.message}</p>
          : found?.ok && !found.matches.length ? <p className="text-[13.5px] text-faint">Nothing at that path.</p>
          : value !== undefined ? <Tree key={open.gen} value={value} open={open.depth} />
          : checked && !checked.ok ? <p className="text-[13.5px] text-faint">The tree shows up once the document parses.</p>
          : <p className="grid h-full place-items-center px-6 text-center text-[13.5px] text-faint">Paste or type JSON or YAML to see it as a tree.</p>}
      </div>
    </div>
  );
}
