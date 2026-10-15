"use client";

import { AnimatePresence, motion } from "@jimkit/ui/motion";
import { Bold, ChevronDown, ChevronUp, Code, Download, Eye, FilePlus2, FolderOpen, Heading2, Italic, Link2, List, ListOrdered, ListTree, Minus, Pencil, Plus, Replace, Search, Send, Type, WrapText, X } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ToolProps } from "@jimkit/sdk";
import { useHost } from "@jimkit/sdk/react";
import { Btn, Chip, CopyBtn, IconBtn, Menu, Seg, ToolFrame, copyText, downloadBlob, toast, useDebounced, useFilePicker, type MenuItem, type MenuHeading } from "@jimkit/ui";
import { DataBar, DataTreePane, type Indent } from "./DataPanel";
import { format as formatData, minify as minifyJson, parse, parseJson, sniff, type DataFormat } from "./lib/data";
import { renderMarkdown } from "./lib/markdown";
import * as MD from "./lib/mdedit";
import * as T from "./lib/transforms";
import { MODES, type ModeId } from "./lib/transforms";

const spring = {};

/* ───────────── documents ───────────── */

interface Doc { id: string; name: string; text: string; mode: ModeId; at: number }
const DOCS_KEY = "jk.text.docs";
const ACTIVE_KEY = "jk.text.active";
const MAX_OPEN_BYTES = 5 * 1024 * 1024;
const BIG_DOC = 200_000;

const uid = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const extFor = (mode: ModeId) => MODES.find((m) => m.id === mode)!.ext;
// a text box holds line breaks as \n whatever the file had, so the document does too: otherwise positions found in the text and positions in the box differ by one per line
const newDoc = (name: string, text = "", mode: ModeId = "plain"): Doc => ({ id: uid(), name, text: text.replace(/\r\n?/g, "\n"), mode, at: Date.now() });
const withExt = (name: string, mode: ModeId) => (/\.[a-z0-9]{1,8}$/i.test(name) ? name : `${name}.${extFor(mode)}`);

function loadDocs(): { docs: Doc[]; active: string } {
  try {
    const docs = JSON.parse(localStorage.getItem(DOCS_KEY) ?? "[]") as Doc[];
    if (Array.isArray(docs) && docs.length) {
      const active = localStorage.getItem(ACTIVE_KEY);
      return { docs, active: docs.some((d) => d.id === active) ? active! : docs[0].id };
    }
  } catch { /* fall through */ }
  const d = newDoc("Untitled.txt");
  return { docs: [d], active: d.id };
}

interface Prefs { wrap: boolean; lines: boolean; size: number; preview: boolean; tree: boolean; indent: Indent; sortKeys: boolean }
const PREF_DEFAULTS: Prefs = { wrap: true, lines: false, size: 14, preview: false, tree: false, indent: 2, sortKeys: false };
const loadPrefs = (raw: string | null): Prefs => {
  try {
    const saved = JSON.parse(raw ?? "{}");
    // older saves had no line-number setting: line numbers simply showed whenever word wrap was off
    return { ...PREF_DEFAULTS, ...(saved.wrap === false && saved.lines === undefined ? { lines: true } : {}), ...saved };
  } catch { return PREF_DEFAULTS; }
};

/** Put text into a textarea the way typing would, so the browser's own undo keeps working. */
function insert(ta: HTMLTextAreaElement, start: number, end: number, text: string, selectFrom?: number, selectTo?: number) {
  ta.focus();
  ta.setSelectionRange(start, end);
  let done = false;
  try { done = document.execCommand("insertText", false, text); } catch { /* not supported */ }
  if (!done) {
    ta.setRangeText(text, start, end, "end");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (selectFrom !== undefined) ta.setSelectionRange(selectFrom, selectTo ?? selectFrom);
}

/** The JSON & YAML tool opens anything as data: by extension if it has a data one, else by what the text looks like. */
const dataModeFor = (name: string, text: string): ModeId => {
  const m = T.modeFor(name);
  return m === "json" || m === "yaml" ? m : sniff(text) === "yaml" ? "yaml" : "json";
};

const BULLET = /^(\s*)([-*+]|\d+[.)])\s(\[[ xX]\]\s)?/;

/* ───────────── the editing surface ───────────── */

function Surface({ text, onChange, taRef, wrap, size, gutter, matches, current, placeholder, onCursor, onKey, onScrolled }: {
  text: string; onChange: (v: string) => void; taRef: React.RefObject<HTMLTextAreaElement | null>; wrap: boolean; size: number; gutter: boolean;
  matches: T.Match[]; current: number; placeholder: string; onCursor: () => void; onKey: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void; onScrolled?: (el: HTMLTextAreaElement) => void;
}) {
  const back = useRef<HTMLPreElement>(null);
  const nums = useRef<HTMLPreElement>(null);
  const lh = Math.round(size * 1.65);
  const lineCount = useMemo(() => (gutter ? text.split("\n").length : 0), [gutter, text]);
  const gutterText = useMemo(() => (gutter ? Array.from({ length: lineCount }, (_, i) => i + 1).join("\n") : ""), [gutter, lineCount]);
  const style = { fontSize: size, lineHeight: `${lh}px`, tabSize: 2 } as const;

  const sync = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (back.current) { back.current.scrollTop = ta.scrollTop; back.current.scrollLeft = ta.scrollLeft; }
    if (nums.current) nums.current.scrollTop = ta.scrollTop;
  };
  useEffect(sync); // eslint-disable-line react-hooks/exhaustive-deps

  const marked = useMemo(() => {
    if (!matches.length) return null;
    const out: React.ReactNode[] = [];
    let pos = 0;
    matches.slice(0, 3000).forEach((m, i) => {
      if (m.index < pos) return;
      out.push(text.slice(pos, m.index));
      out.push(<mark key={i} data-cur={i === current ? "1" : undefined} className={i === current ? "bg-accent/55 outline outline-1 outline-accent" : "bg-warn/30"} style={{ color: "transparent", borderRadius: 3 }}>{text.slice(m.index, m.index + m.length)}</mark>);
      pos = m.index + m.length;
    });
    out.push(text.slice(pos));
    return out;
  }, [matches, current, text]);

  // keep the current match in view
  useEffect(() => {
    const el = back.current?.querySelector("mark[data-cur]") as HTMLElement | null;
    const ta = taRef.current;
    if (!el || !ta) return;
    const top = el.offsetTop, h = el.offsetHeight;
    if (top < ta.scrollTop + 8 || top + h > ta.scrollTop + ta.clientHeight - 8) ta.scrollTop = Math.max(0, top - ta.clientHeight / 2);
    if (!wrap) { const left = el.offsetLeft; if (left < ta.scrollLeft || left > ta.scrollLeft + ta.clientWidth - 40) ta.scrollLeft = Math.max(0, left - ta.clientWidth / 2); }
    sync();
  }, [current, matches]); // eslint-disable-line react-hooks/exhaustive-deps

  const common = "font-mono px-3.5 py-3 [scrollbar-gutter:stable] [scrollbar-width:thin]";
  const ws = wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre";
  return (
    <div className="relative flex size-full min-h-0">
      {gutter && <pre ref={nums} aria-hidden className="m-0 shrink-0 select-none overflow-hidden border-r border-line py-3 pl-3 pr-3 text-right font-mono text-faint/70 [scrollbar-gutter:stable]" style={style}>{gutterText}</pre>}
      <div className="relative min-w-0 flex-1">
        {marked && <pre ref={back} aria-hidden className={`pointer-events-none absolute inset-0 m-0 overflow-hidden text-transparent ${common} ${ws}`} style={style}>{marked}{" "}</pre>}
        <textarea
          ref={taRef} value={text} aria-label="Document" placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} onScroll={(e) => { sync(); onScrolled?.(e.currentTarget); }} onSelect={onCursor} onKeyUp={onCursor} onClick={onCursor} onKeyDown={onKey}
          spellCheck={false} autoCapitalize="off" autoCorrect="off" autoComplete="off" wrap={wrap ? "soft" : "off"}
          className={`absolute inset-0 size-full resize-none overflow-auto bg-transparent text-fg caret-accent outline-none placeholder:text-faint/50 ${common} ${ws}`} style={style}
        />
      </div>
    </div>
  );
}

/* ───────────── find and replace ───────────── */

function FindBar({ q, setQ, r, setR, flags, setFlags, count, index, step, replaceOne, replaceAllNow, error, withReplace, setWithReplace, onClose, mobile }: {
  q: string; setQ: (v: string) => void; r: string; setR: (v: string) => void; flags: T.FindOptions; setFlags: (f: T.FindOptions) => void; count: number; index: number;
  step: (d: 1 | -1) => void; replaceOne: () => void; replaceAllNow: () => void; error?: string; withReplace: boolean; setWithReplace: (b: boolean) => void; onClose: () => void; mobile: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const field = "min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[13px] outline-none placeholder:text-faint/60";
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}
      className={`z-20 flex flex-col gap-2 border-b border-line bg-surface px-3 py-2.5 ${mobile ? "" : "backdrop-blur"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className={`flex min-w-[180px] flex-1 items-center rounded-xl border bg-field ${error ? "border-bad/60" : "border-line-strong focus-within:border-accent/60"}`}>
          <Search size={14} className="ml-2.5 text-faint" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find" aria-label="Find" className={field}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }} />
          <span className="pr-2.5 text-[12px] tabular-nums text-faint">{error ? "invalid" : q ? (count ? `${index + 1} of ${count}` : "none") : ""}</span>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn label="Previous (Shift+Enter)" onClick={() => step(-1)} disabled={!count}><ChevronUp size={16} /></IconBtn>
          <IconBtn label="Next (Enter)" onClick={() => step(1)} disabled={!count}><ChevronDown size={16} /></IconBtn>
        </div>
        <div className="flex items-center gap-1">
          <Chip on={!!flags.caseSensitive} onClick={() => setFlags({ ...flags, caseSensitive: !flags.caseSensitive })} title="Match case">Aa</Chip>
          <Chip on={!!flags.wholeWord} onClick={() => setFlags({ ...flags, wholeWord: !flags.wholeWord })} title="Whole word">ab</Chip>
          <Chip on={!!flags.regex} onClick={() => setFlags({ ...flags, regex: !flags.regex })} title="Regular expression">.*</Chip>
          <IconBtn label="Replace" active={withReplace} onClick={() => setWithReplace(!withReplace)}><Replace size={15} /></IconBtn>
          <IconBtn label="Close find (Esc)" onClick={onClose}><X size={16} /></IconBtn>
        </div>
      </div>
      {error && <p className="px-1 text-[12px] text-bad">{error}</p>}
      {withReplace && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[180px] flex-1 items-center rounded-xl border border-line-strong bg-field focus-within:border-accent/60">
            <input value={r} onChange={(e) => setR(e.target.value)} placeholder={flags.regex ? "Replace with ($1, $& work)" : "Replace with"} aria-label="Replace with" className={field}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); replaceOne(); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }} />
          </div>
          <Btn onClick={replaceOne} disabled={!count}>Replace</Btn>
          <Btn onClick={replaceAllNow} disabled={!count}>Replace all{count ? ` (${count})` : ""}</Btn>
        </div>
      )}
    </motion.div>
  );
}

/* ───────────── the tool ───────────── */

export default function TextEditor({ tool, hue, onClose, mobile, init: toolInit }: ToolProps) {
  const host = useHost();
  const init = { file: toolInit?.files?.[0], text: toolInit?.text, name: toolInit?.name };
  // a quick action ("New JSON document") or an old tool id (markdown, data) says which kind of document to start; a file says it by its name
  const wanted = typeof toolInit?.mode === "string" ? (T.MODES.find((m) => m.id === toolInit.mode)?.id as ModeId | undefined) : undefined;
  const startMd = wanted === "markdown";
  const startData = wanted === "json" || wanted === "yaml";
  const [{ docs, active }, setStore] = useState(loadDocs);
  const store = host.storage("text");
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs(store.get("prefs")));
  const [view, setView] = useState<"edit" | "preview" | "tree">("edit");
  const cursorEl = useRef<HTMLSpanElement>(null);
  const [find, setFind] = useState({ open: false, replace: false, q: "", r: "", flags: {} as T.FindOptions, idx: 0 });
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const removed = useRef<Doc | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const echo = useRef(false);

  // keep the editor and the preview at the same relative position; `echo` swallows the scroll event our own assignment causes
  const follow = (from: HTMLElement | null, to: HTMLElement | null) => {
    if (!from || !to) return;
    if (echo.current) { echo.current = false; return; }
    const span = from.scrollHeight - from.clientHeight;
    const target = span > 0 ? (from.scrollTop / span) * (to.scrollHeight - to.clientHeight) : 0;
    if (Math.abs(to.scrollTop - target) < 1) return;
    echo.current = true;
    to.scrollTop = target;
    requestAnimationFrame(() => { echo.current = false; });
  };

  const doc = docs.find((d) => d.id === active) ?? docs[0];
  const setPrefs = (p: Partial<Prefs>) => setPrefsState((cur) => { const n = { ...cur, ...p }; store.set("prefs", JSON.stringify(n)); return n; });
  const patch = useCallback((id: string, p: Partial<Doc>) => setStore((s) => ({ ...s, docs: s.docs.map((d) => (d.id === id ? { ...d, ...p, at: Date.now() } : d)) })), []);
  const open = useCallback((d: Doc) => { setStore((s) => ({ docs: [...s.docs, d], active: d.id })); setView("edit"); }, []);

  // ── start from a file or text that was handed in, or (Markdown tool) from a markdown document
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      if (init?.file) {
        const f = init.file;
        if (f.size > MAX_OPEN_BYTES) return void toast.error("That file is too big for the editor", { description: "Text over 5 MB is better converted than edited." });
        const text = await f.text();
        const mode = startData ? dataModeFor(f.name, text) : T.modeFor(f.name);
        open(newDoc(f.name, text, mode));
        if (mode === "json" || mode === "yaml") setPrefs({ tree: true });
      } else if (init?.text !== undefined) {
        const mode = startData ? dataModeFor(init.name ?? "", init.text) : T.modeFor(init.name ?? "");
        open(newDoc(init.name ?? "Untitled.txt", init.text, mode));
        if (mode === "json" || mode === "yaml") setPrefs({ tree: true });
      } else if (startMd) {
        const have = docs.find((d) => d.mode === "markdown" && !d.text.trim()) ?? docs.find((d) => d.id === active && d.mode === "markdown");
        const blank = docs.find((d) => d.id === active && !d.text.trim() && d.mode === "plain" && /^Untitled(-\d+)?\.txt$/.test(d.name));
        if (have) setStore((s) => ({ ...s, active: have.id }));
        else if (blank) patch(blank.id, { mode: "markdown", name: "Untitled.md" });
        else open(newDoc("Untitled.md", "", "markdown"));
        setPrefs({ preview: true });
      } else if (startData) {
        const have = docs.find((d) => d.id === active && d.mode === wanted) ?? docs.find((d) => d.mode === wanted && !d.text.trim());
        const blank = docs.find((d) => d.id === active && !d.text.trim() && d.mode === "plain" && /^Untitled(-\d+)?\.txt$/.test(d.name));
        if (have) setStore((s) => ({ ...s, active: have.id }));
        else if (blank) patch(blank.id, { mode: wanted === "yaml" ? "yaml" : "json", name: wanted === "yaml" ? "Untitled.yaml" : "Untitled.json" });
        else open(newDoc(wanted === "yaml" ? "Untitled.yaml" : "Untitled.json", "", wanted === "yaml" ? "yaml" : "json"));
        setPrefs({ tree: true });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── autosave (debounced) to this browser. "Saving" is derived (what was last written is no longer what we hold), so a keystroke
  // never sets state from an effect: that left a pending update behind every commit, and fast typing tripped React's update-depth limit.
  const [written, setWritten] = useState({ docs, active, ok: true });
  useEffect(() => {
    const t = setTimeout(() => {
      let ok = true;
      try { localStorage.setItem(DOCS_KEY, JSON.stringify(docs)); localStorage.setItem(ACTIVE_KEY, active); } catch { ok = false; }
      setWritten({ docs, active, ok });
    }, 450);
    return () => clearTimeout(t);
  }, [docs, active]);
  const saved = written.docs !== docs || written.active !== active ? "saving" : written.ok ? "saved" : "failed";

  const text = doc.text;
  // the preview and counts follow typing, but on a big document they wait for a pause
  const settled = useDebounced(text, 400);
  const deferred = useDeferredValue(text);
  const lazy = text.length > BIG_DOC ? settled : deferred;
  const set = (v: string) => patch(doc.id, { text: v });
  const showPreview = doc.mode === "markdown" && (mobile ? view === "preview" : prefs.preview);
  const isData = doc.mode === "json" || doc.mode === "yaml";
  const dataFormat: DataFormat = doc.mode === "yaml" ? "yaml" : "json";
  const showTree = isData && (mobile ? view === "tree" : prefs.tree);
  const side = showPreview || showTree;
  const showEditor = !(mobile && side);
  const checked = useMemo(() => (isData && lazy.trim() ? parse(lazy, dataFormat) : null), [isData, lazy, dataFormat]);
  // a pasted blob of JSON in a plain document: offer the JSON tools instead of making people hunt for them
  const suggestJson = useMemo(() => doc.mode === "plain" && lazy.length > 1 && lazy.length < 400_000 && /^\s*[[{]/.test(lazy) && parseJson(lazy).ok, [doc.mode, lazy]);
  const html = useMemo(() => (doc.mode === "markdown" && (showPreview) ? renderMarkdown(lazy) : ""), [lazy, doc.mode, showPreview]);
  const st = useMemo(() => T.stats(lazy), [lazy]);

  // ── find
  const found = useMemo(() => (find.open && find.q ? T.findAll(text, find.q, find.flags) : { matches: [] as T.Match[], error: undefined as string | undefined }), [find.open, find.q, find.flags, text]);
  const idx = found.matches.length ? Math.min(find.idx, found.matches.length - 1) : 0;
  const openFind = (withReplace = false) => {
    const t = ta.current;
    const sel = t && t.selectionStart !== t.selectionEnd && !t.value.slice(t.selectionStart, t.selectionEnd).includes("\n") ? t.value.slice(t.selectionStart, t.selectionEnd) : null;
    setFind((f) => ({ ...f, open: true, replace: withReplace || f.replace, q: sel ?? f.q }));
  };
  const closeFind = () => { setFind((f) => ({ ...f, open: false })); ta.current?.focus(); };
  const step = (d: 1 | -1) => setFind((f) => ({ ...f, idx: found.matches.length ? (idx + d + found.matches.length) % found.matches.length : 0 }));
  const replaceOne = () => {
    const m = found.matches[idx];
    const t = ta.current;
    if (!m || !t) return;
    // the match is read in the whole text, so look-behind and word boundaries see what is around it, and $1 and $& expand against it
    insert(t, m.index, m.index + m.length, T.replacementAt(text, find.q, find.r, find.flags, m.index) ?? find.r);
  };
  const replaceAllNow = () => {
    const t = ta.current;
    const r = T.replaceAll(text, find.q, find.r, find.flags);
    if (!t || !r.count) return;
    insert(t, 0, text.length, r.text);
    toast.success(`Replaced ${r.count}`);
  };

  // ── cursor / selection readout: written straight to the DOM so it costs no React render
  const cursorFrame = useRef(0);
  const readCursor = useCallback(() => {
    // select, keyup and click can all fire for one keystroke: read once per frame
    if (cursorFrame.current) return;
    cursorFrame.current = requestAnimationFrame(() => {
      cursorFrame.current = 0;
      const t = ta.current;
      if (!t) return;
      const at = t.selectionStart, value = t.value;
      let line = 1, nl = -1;
      for (let i = value.indexOf("\n"); i !== -1 && i < at; i = value.indexOf("\n", i + 1)) { line++; nl = i; }
      const sel = Math.abs(t.selectionEnd - at);
      if (cursorEl.current) cursorEl.current.textContent = `Ln ${line}, Col ${at - nl}${sel ? ` · ${sel} selected` : ""}`;
    });
  }, []);

  // ── typing helpers
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget;
    const { selectionStart: a, selectionEnd: b, value } = t;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.altKey && doc.mode === "markdown") {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); return fmt((v, x, y) => MD.wrap(v, x, y, "**", "bold")); }
      if (k === "i") { e.preventDefault(); return fmt((v, x, y) => MD.wrap(v, x, y, "*", "italic")); }
      if (k === "k") { e.preventDefault(); return fmt(MD.link); }
    }
    if (e.key === "Tab" && !mod && !e.altKey) {
      e.preventDefault();
      const ls = value.lastIndexOf("\n", a - 1) + 1;
      if (a === b && !e.shiftKey) return insert(t, a, b, "  ");
      const le = (() => { const i = value.indexOf("\n", b); return i === -1 ? value.length : i; })();
      const block = value.slice(ls, le);
      const out = e.shiftKey ? block.replace(/^( {1,2}|\t)/gm, "") : block.replace(/^/gm, "  ");
      insert(t, ls, le, out, ls, ls + out.length);
    } else if (e.key === "Enter" && !mod && !e.shiftKey && a === b) {
      const ls = value.lastIndexOf("\n", a - 1) + 1;
      const line = value.slice(ls, a);
      const indent = /^\s*/.exec(line)![0];
      const bullet = doc.mode === "markdown" ? BULLET.exec(line) : null;
      if (bullet && line.trim() === bullet[0].trim()) { e.preventDefault(); return insert(t, ls, a, ""); } // empty bullet: leave the list
      if (bullet) {
        e.preventDefault();
        const next = /\d/.test(bullet[2]) ? `${parseInt(bullet[2], 10) + 1}${bullet[2].slice(-1)}` : bullet[2];
        return insert(t, a, b, `\n${bullet[1]}${next} ${bullet[3] ? "[ ] " : ""}`);
      }
      if (indent) { e.preventDefault(); insert(t, a, b, `\n${indent}`); }
    }
  };

  // ── transforms act on the selection, or the whole document
  const run = (fn: (s: string) => string, label?: string) => {
    const t = ta.current;
    if (!t) return;
    const hasSel = t.selectionStart !== t.selectionEnd;
    const a = hasSel ? t.selectionStart : 0, b = hasSel ? t.selectionEnd : t.value.length;
    const out = fn(t.value.slice(a, b));
    if (out === t.value.slice(a, b)) return void toast(label ? `${label}: nothing to change` : "Nothing to change");
    insert(t, a, b, out, hasSel ? a : undefined, hasSel ? a + out.length : undefined);
    toast.success(label ?? "Done", { description: hasSel ? "Applied to the selection. Ctrl+Z undoes it." : "Applied to the whole document. Ctrl+Z undoes it." });
  };
  // Case conversions remember where the words were, so camelCase, then lowercase, then snake_case still works.
  const caseMemory = useRef<T.CaseMemory | undefined>(undefined);
  const runCase = (style: T.CaseStyle, label: string) => run((s) => {
    const r = T.convertCase(s, style, caseMemory.current);
    caseMemory.current = r.memory;
    return r.text;
  }, label);
  const fmt = (fn: (value: string, a: number, b: number) => MD.Edit) => {
    const t = ta.current;
    if (!t) return;
    const e = fn(t.value, t.selectionStart, t.selectionEnd);
    insert(t, e.start, e.end, e.text, e.selFrom, e.selTo);
  };
  const exportHtml = () => downloadBlob(`${fileName.replace(/\.[a-z0-9]+$/i, "")}.html`, MD.htmlDocument(doc.name.replace(/\.[a-z0-9]+$/i, "") || "Untitled", renderMarkdown(text)), "text/html;charset=utf-8");
  const data = (to: "json" | "yaml" | "min") => run((s) => {
    const from = isData ? dataFormat : sniff(s);
    const r = to === "min" ? minifyJson(s) : formatData(s, from, to, { indent: prefs.indent, sortKeys: prefs.sortKeys });
    if (!r.ok) { toast.error(r.message, { description: r.line ? `Line ${r.line}, column ${r.col ?? 1}` : undefined }); return s; }
    // converting a JSON or YAML document makes it the other kind, so the checks and the tree keep working
    if (isData && to !== "min" && to !== dataFormat) setMode(to);
    return r.text.replace(/\n$/, s.endsWith("\n") ? "\n" : "");
  });

  // select the character the parser stopped at, so the error shows in the document itself
  const showError = () => {
    const t = ta.current;
    if (!t || !checked || checked.ok || !checked.line) return;
    const lines = t.value.split("\n");
    let at = 0;
    for (let i = 0; i < checked.line - 1; i++) at += lines[i].length + 1;
    at = Math.min(t.value.length, at + (checked.col ?? 1) - 1);
    t.focus();
    t.setSelectionRange(at, Math.min(t.value.length, at + 1));
    const lh = parseFloat(getComputedStyle(t).lineHeight) || 21;
    t.scrollTop = Math.max(0, (checked.line - 3) * lh);
  };

  const menu: (MenuItem | MenuHeading)[] = [
    { heading: "Lines" },
    { id: "sort", label: "Sort A → Z", run: () => run((s) => T.sortLines(s), "Sorted") },
    { id: "sort-d", label: "Sort Z → A", run: () => run((s) => T.sortLines(s, { desc: true }), "Sorted") },
    { id: "sort-n", label: "Sort numerically", run: () => run((s) => T.sortLines(s, { numeric: true }), "Sorted") },
    { id: "rev", label: "Reverse lines", run: () => run(T.reverseLines, "Reversed") },
    { id: "dedupe", label: "Remove duplicate lines", run: () => run(T.dedupeLines, "Duplicates removed") },
    { id: "blank", label: "Remove blank lines", run: () => run(T.removeBlankLines, "Blank lines removed") },
    { id: "num", label: "Number the lines", run: () => run(T.numberLines, "Numbered") },
    { id: "join", label: "Join lines with spaces", run: () => run((s) => T.joinLines(s), "Joined") },
    { heading: "Case" },
    { id: "up", label: "UPPERCASE", run: () => runCase("upper", "Uppercased") },
    { id: "low", label: "lowercase", run: () => runCase("lower", "Lowercased") },
    { id: "title", label: "Title Case", run: () => runCase("title", "Title case") },
    { id: "sent", label: "Sentence case", run: () => runCase("sentence", "Sentence case") },
    { id: "camel", label: "camelCase", run: () => runCase("camel", "camelCase") },
    { id: "pascal", label: "PascalCase", run: () => runCase("pascal", "PascalCase") },
    { id: "snake", label: "snake_case", run: () => runCase("snake", "snake_case") },
    { id: "kebab", label: "kebab-case", run: () => runCase("kebab", "kebab-case") },
    { id: "constant", label: "CONSTANT_CASE", run: () => runCase("constant", "CONSTANT_CASE") },
    { id: "dot", label: "dot.case", run: () => runCase("dot", "dot.case") },
    { id: "slug", label: "Slug", run: () => run(T.slugify, "Slugified") },
    { heading: "Clean up" },
    { id: "trim", label: "Trim every line", run: () => run(T.trimLines, "Trimmed") },
    { id: "trail", label: "Trim trailing spaces", run: () => run(T.trimTrailing, "Trimmed") },
    { id: "spaces", label: "Collapse repeated spaces", run: () => run(T.collapseSpaces, "Collapsed") },
    { id: "wrap", label: "Wrap lines at 80 columns", run: () => run((s) => T.wrapLines(s, 80), "Wrapped") },
    ...(doc.mode === "markdown" ? [{ heading: "Export" } as MenuHeading, { id: "html", label: "Download as HTML", run: exportHtml } as MenuItem] : []),
    { heading: "Data" },
    { id: "jpretty", label: "Pretty-print JSON / YAML", run: () => data(sniff(ta.current?.value ?? "") === "yaml" ? "yaml" : "json") },
    { id: "jmin", label: "Minify JSON", run: () => data("min") },
    { id: "toyaml", label: "JSON → YAML", run: () => data("yaml") },
    { id: "tojson", label: "YAML → JSON", run: () => data("json") },
  ];

  // ── documents
  const create = () => { open(newDoc(`Untitled-${docs.length + 1}.txt`)); setTimeout(() => ta.current?.focus(), 80); };
  const pick = useFilePicker(undefined, async (f) => {
    if (f.size > MAX_OPEN_BYTES) return void toast.error(`${f.name} is too big for the editor`, { description: "Text over 5 MB is better converted than edited." });
    const buf = new Uint8Array(await f.slice(0, 8192).arrayBuffer());
    if (buf.includes(0)) return void toast.error(`${f.name} looks like a binary file`, { description: "Try the converter or the hash tool instead." });
    open(newDoc(f.name, await f.text(), T.modeFor(f.name)));
  }, true);
  const close = (id: string) => {
    const d = docs.find((x) => x.id === id)!;
    removed.current = d;
    setStore((s) => {
      const rest = s.docs.filter((x) => x.id !== id);
      if (!rest.length) { const n = newDoc("Untitled.txt"); return { docs: [n], active: n.id }; }
      return { docs: rest, active: s.active === id ? rest[Math.max(0, s.docs.findIndex((x) => x.id === id) - 1)].id : s.active };
    });
    if (d.text.trim()) toast(`Closed ${d.name}`, { action: { label: "Undo", onClick: () => removed.current && open(removed.current) }, duration: 8000 });
  };
  const fileName = withExt(doc.name.trim() || "Untitled", doc.mode);
  const mime = doc.mode === "json" ? "application/json" : doc.mode === "html" ? "text/html" : doc.mode === "markdown" ? "text/markdown" : doc.mode === "csv" ? "text/csv" : "text/plain";
  const download = () => { downloadBlob(fileName, text, `${mime};charset=utf-8`); };
  const toConverter = () => {
    host.open("convert", { files: [new File([text], fileName, { type: mime })] });
  };
  const canConvert = host.hasTool("convert");
  const setMode = (mode: ModeId) => {
    const oldExt = extFor(doc.mode);
    const renamed = new RegExp(`\\.${oldExt}$`, "i").test(doc.name) ? doc.name.replace(new RegExp(`\\.${oldExt}$`, "i"), `.${extFor(mode)}`) : doc.name;
    patch(doc.id, { mode, name: renamed });
    setView("edit");
  };

  // ── shortcuts
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); download(); }
      else if (k === "f") { e.preventDefault(); openFind(false); }
      else if (k === "h") { e.preventDefault(); openFind(true); }
      else if (k === "p" && e.shiftKey) { e.preventDefault(); if (doc.mode === "markdown") mobile ? setView((v) => (v === "edit" ? "preview" : "edit")) : setPrefs({ preview: !prefs.preview }); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  // dropping a text file here opens it instead of adding it to the converter
  const onDrop = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault(); e.stopPropagation();
    Array.from(e.dataTransfer.files).forEach(async (f) => { if (T.isTextFile(f.name, f.type) && f.size <= MAX_OPEN_BYTES) open(newDoc(f.name, await f.text(), T.modeFor(f.name))); else toast.error(`${f.name} isn't a text file`); });
  };

  const actions = mobile ? (
    <>
      {doc.mode === "markdown" && <IconBtn label="Preview" active={view === "preview"} onClick={() => setView((v) => (v === "edit" ? "preview" : "edit"))}><Eye size={17} /></IconBtn>}
      {isData && <IconBtn label="Tree" active={view === "tree"} onClick={() => setView((v) => (v === "edit" ? "tree" : "edit"))}><ListTree size={17} /></IconBtn>}
      <IconBtn label="Find (Ctrl+F)" active={find.open} onClick={() => (find.open ? closeFind() : openFind())}><Search size={17} /></IconBtn>
      <Menu align="right" width={248} trigger={<Pencil size={14} />} items={[
        { id: "new", label: "New document", run: create },
        { id: "open", label: "Open a file…", run: pick.open },
        { id: "dl", label: "Download", run: download },
        { id: "copy", label: "Copy everything", run: () => copyText(text) },
        ...(canConvert ? [{ id: "send", label: "Send to the converter", run: toConverter }] : []),
        { id: "offer", label: "Send to another tool…", run: () => host.offer([new File([text], fileName, { type: mime })]) },
        { id: "wrap", label: prefs.wrap ? "Turn word wrap off" : "Turn word wrap on", run: () => setPrefs({ wrap: !prefs.wrap }) },
        { id: "bigger", label: "Bigger text", run: () => setPrefs({ size: Math.min(24, prefs.size + 1) }) },
        { id: "smaller", label: "Smaller text", run: () => setPrefs({ size: Math.max(11, prefs.size - 1) }) },
        ...menu,
      ]} />
    </>
  ) : (
    <>
      <Menu align="right" trigger={<><Type size={14} /> Tools</>} items={menu} />
      {doc.mode === "markdown" && <IconBtn label="Preview (Ctrl+Shift+P)" active={prefs.preview} onClick={() => setPrefs({ preview: !prefs.preview })}><Eye size={17} /></IconBtn>}
      {isData && <IconBtn label="Tree view" active={prefs.tree} onClick={() => setPrefs({ tree: !prefs.tree })}><ListTree size={17} /></IconBtn>}
      <IconBtn label="Find and replace (Ctrl+F)" active={find.open} onClick={() => (find.open ? closeFind() : openFind())}><Search size={17} /></IconBtn>
      <IconBtn label="Word wrap" active={prefs.wrap} onClick={() => setPrefs({ wrap: !prefs.wrap, lines: prefs.wrap ? prefs.lines : false })}><WrapText size={17} /></IconBtn>
      <IconBtn label="Line numbers (turns word wrap off)" active={prefs.lines && !prefs.wrap} onClick={() => setPrefs(prefs.lines && !prefs.wrap ? { lines: false } : { lines: true, wrap: false })}><ListOrdered size={17} /></IconBtn>
      <div className="mx-0.5 flex items-center"><IconBtn label="Smaller text" onClick={() => setPrefs({ size: Math.max(11, prefs.size - 1) })}><Minus size={14} /></IconBtn><span className="w-6 text-center text-[11.5px] tabular-nums text-faint">{prefs.size}</span><IconBtn label="Bigger text" onClick={() => setPrefs({ size: Math.min(24, prefs.size + 1) })}><Plus size={14} /></IconBtn></div>
      <span className="mx-1 h-5 w-px bg-line" />
      <IconBtn label="Open a file" onClick={pick.open}><FolderOpen size={17} /></IconBtn>
      <CopyBtn text={text} label="Copy" />
      <Btn onClick={download} title="Download (Ctrl+S)"><Download size={14} /> Save</Btn>
      {canConvert && <Btn primary onClick={toConverter} title="Hand this document to the converter"><Send size={14} /> Convert</Btn>}
    </>
  );

  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} actions={actions} subtitle={mobile ? undefined : tool.blurb}>
      <div className="flex min-h-0 flex-1 flex-col" onDragOver={(e) => Array.from(e.dataTransfer.types).includes("Files") && e.preventDefault()} onDrop={onDrop}>
        {pick.input}
        {/* document tabs */}
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-surface px-2.5 py-1.5 scroll-hide">
          {docs.map((d) => {
            const on = d.id === doc.id;
            return (
              <div key={d.id} className={`group flex shrink-0 items-center gap-1 rounded-lg border pl-2.5 pr-1 ${on ? "border-line-strong bg-tint-2" : "border-transparent hover:bg-tint"}`}>
                {on ? (
                  <input value={doc.name} onChange={(e) => patch(doc.id, { name: e.target.value })} onBlur={() => !doc.name.trim() && patch(doc.id, { name: "Untitled" })} aria-label="File name" size={Math.max(8, Math.min(28, doc.name.length + 1))}
                    className="bg-transparent py-1.5 text-[13px] outline-none" />
                ) : (
                  <button onClick={() => setStore((s) => ({ ...s, active: d.id }))} className="max-w-[160px] truncate py-1.5 text-[13px] text-dim">{d.name}</button>
                )}
                <button onClick={() => close(d.id)} aria-label={`Close ${d.name}`} className="grid size-6 place-items-center rounded-md text-faint transition hover:bg-tint-2 hover:text-fg"><X size={13} /></button>
              </div>
            );
          })}
          <IconBtn label="New document" onClick={create}><FilePlus2 size={16} /></IconBtn>
          {mobile && doc.mode === "markdown" && <div className="ml-auto"><Seg label="View" small value={view} onChange={setView} options={[{ id: "edit", label: "Write" }, { id: "preview", label: "Preview" }]} /></div>}
          {mobile && isData && <div className="ml-auto"><Seg label="View" small value={view} onChange={setView} options={[{ id: "edit", label: "Edit" }, { id: "tree", label: "Tree" }]} /></div>}
        </div>

        <AnimatePresence initial={false}>
          {find.open && (
            <FindBar mobile={mobile} q={find.q} setQ={(q) => setFind((f) => ({ ...f, q, idx: 0 }))} r={find.r} setR={(r) => setFind((f) => ({ ...f, r }))} flags={find.flags} setFlags={(flags) => setFind((f) => ({ ...f, flags, idx: 0 }))}
              count={found.matches.length} index={idx} step={step} replaceOne={replaceOne} replaceAllNow={replaceAllNow} error={found.error} withReplace={find.replace} setWithReplace={(b) => setFind((f) => ({ ...f, replace: b }))} onClose={closeFind} />
          )}
        </AnimatePresence>

        {/* editor and preview */}
        <div className={`grid min-h-0 flex-1 ${side && showEditor ? "grid-cols-2" : "grid-cols-1"}`}>
          {showEditor && (
            <div className={`flex min-h-0 min-w-0 flex-col ${side ? "border-r border-line" : ""}`}>
              {doc.mode === "markdown" && (
                <div role="toolbar" aria-label="Formatting" className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-surface px-2 py-1 scroll-hide">
                  <IconBtn label="Bold (Ctrl+B)" onClick={() => fmt((v, a, b) => MD.wrap(v, a, b, "**", "bold"))}><Bold size={16} /></IconBtn>
                  <IconBtn label="Italic (Ctrl+I)" onClick={() => fmt((v, a, b) => MD.wrap(v, a, b, "*", "italic"))}><Italic size={16} /></IconBtn>
                  <IconBtn label="Heading" onClick={() => fmt((v, a) => MD.heading(v, a, 2))}><Heading2 size={16} /></IconBtn>
                  <IconBtn label="Link (Ctrl+K)" onClick={() => fmt(MD.link)}><Link2 size={16} /></IconBtn>
                  <IconBtn label="Bulleted list" onClick={() => fmt((v, a, b) => MD.list(v, a, b, false))}><List size={16} /></IconBtn>
                  <IconBtn label="Numbered list" onClick={() => fmt((v, a, b) => MD.list(v, a, b, true))}><ListOrdered size={16} /></IconBtn>
                  <IconBtn label="Code" onClick={() => fmt(MD.code)}><Code size={16} /></IconBtn>
                </div>
              )}
              {isData && (
                <DataBar format={dataFormat} checked={checked} indent={prefs.indent} setIndent={(indent) => setPrefs({ indent })} sortKeys={prefs.sortKeys} setSortKeys={(sortKeys) => setPrefs({ sortKeys })}
                  onFormat={() => data(dataFormat)} onMinify={() => data("min")} onConvert={() => data(dataFormat === "json" ? "yaml" : "json")} onShowError={showError} />
              )}
              {suggestJson && (
                <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-1.5 text-[12.5px] text-dim">
                  <span className="min-w-0 flex-1 truncate">This is valid JSON.</span>
                  <Btn onClick={() => setMode("json")}>Use the JSON tools</Btn>
                </div>
              )}
              <div className="min-h-0 flex-1">
              <Surface text={text} onChange={set} taRef={ta} wrap={prefs.wrap} size={mobile ? Math.max(15, prefs.size) : prefs.size} gutter={!mobile && prefs.lines && !prefs.wrap && !side}
                matches={found.matches} current={idx} onCursor={readCursor} onKey={onKey} onScrolled={showPreview ? (el) => follow(el, preview.current) : undefined}
                placeholder={doc.mode === "markdown" ? "# Start writing\n\nMarkdown works here: **bold**, lists, tables, `code`…" : "Start typing, paste something, or drop a text file anywhere on this window."} />
              </div>
            </div>
          )}
          {showTree && <div className="flex min-h-0 min-w-0 flex-col bg-surface"><DataTreePane checked={checked} /></div>}
          {showPreview && (
            <div ref={preview} onScroll={() => !mobile && follow(preview.current, ta.current)} className="min-h-0 min-w-0 overflow-y-auto bg-surface px-6 py-5 scroll-hide md:px-10">
              {html ? <article className="jk-md mx-auto max-w-[760px]" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="mt-10 text-center text-[14px] text-faint">The preview appears as you write.</p>}
            </div>
          )}
        </div>

        {/* status bar */}
        <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface px-3.5 pb-[calc(env(safe-area-inset-bottom)+0.375rem)] pt-1.5 text-[12px] tabular-nums text-faint">
          <span ref={cursorEl}>Ln 1, Col 1</span>
          <span>{st.words.toLocaleString()} {st.words === 1 ? "word" : "words"}</span>
          <span>{st.chars.toLocaleString()} chars</span>
          {!mobile && <span>{st.lines.toLocaleString()} lines</span>}
          {!mobile && st.words > 30 && <span>{Math.max(1, Math.round(st.readMinutes))} min read</span>}
          <span className="ml-auto flex items-center gap-3">
            <select value={doc.mode} onChange={(e) => setMode(e.target.value as ModeId)} aria-label="Document type" className="rounded-md bg-transparent px-1 py-0.5 text-[12px] text-dim outline-none hover:bg-tint">
              {MODES.map((m) => <option key={m.id} value={m.id} className="bg-surface">{m.label}</option>)}
            </select>
            <span className="flex items-center gap-1.5" title={saved === "failed" ? "The browser refused to store this (too big, or private mode). Download it to keep it." : "Saved in this browser"}>
              <span className={`size-1.5 rounded-full ${saved === "saved" ? "bg-ok" : saved === "saving" ? "bg-warn" : "bg-bad"}`} />
              {saved === "saved" ? "Saved here" : saved === "saving" ? "Saving…" : "Not saved"}
            </span>
          </span>
        </footer>
      </div>
    </ToolFrame>
  );
}
