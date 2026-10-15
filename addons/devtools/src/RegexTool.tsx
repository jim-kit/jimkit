"use client";

import { BookOpen } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ToolProps } from "@jimkit/sdk";
import { Area, Btn, Chip, CopyBtn, Pane, Sheet, ToolFrame, cx, useDebounced } from "@jimkit/ui";
import { CHEATSHEET, FLAGS, MAX_MATCHES, runRegex, type RegexMatch, type RegexRequest, type RegexResult } from "./lib/regex";
import { ErrorLine, Input } from "./kit";

const TIMEOUT_MS = 1500;
const SAMPLE = "Invoices\n2024-03-09  ann@example.com  paid\n2024-11-30  bob@example.org  open\nOn hold: 1999-12-31 (carol@example.net)\n";

type Outcome = { state: "idle" } | { state: "running" } | { state: "timeout" } | { state: "done"; result: RegexResult };

/** Runs the pattern in a Worker and kills it if it takes longer than TIMEOUT_MS. A run that is replaced by a newer one is ignored. */
function useRegexRun(req: RegexRequest): Outcome {
  const [out, setOut] = useState<Outcome>({ state: "idle" });
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    setOut((o) => (o.state === "done" ? o : { state: "running" }));
    let w = worker.current;
    if (!w) {
      try { w = worker.current = new Worker(new URL("./regex.worker.ts", import.meta.url)); } catch { w = null; }
    }
    if (!w) {
      // no Worker (very old browser): run here, but only on text small enough that a bad pattern can't hang for long
      setOut({ state: "done", result: req.text.length <= 20000 ? runRegex(req) : { ok: false, error: "Web Workers are unavailable and the text is over 20,000 characters. Shorten it." } });
      return;
    }
    let answered = false;
    const timer = setTimeout(() => {
      if (id !== seq.current) return;
      worker.current?.terminate();
      worker.current = null;
      setOut({ state: "timeout" });
    }, TIMEOUT_MS);
    w.onmessage = (e: MessageEvent<{ id: number; result: RegexResult }>) => {
      if (e.data.id !== seq.current) return;
      answered = true;
      clearTimeout(timer);
      setOut({ state: "done", result: e.data.result });
    };
    w.postMessage({ ...req, id });
    return () => {
      clearTimeout(timer);
      // an edit while a run is still going (a slow pattern) would queue the new run behind it and be timed out for the old one's sake:
      // end the old run, and the next edit starts on a fresh worker
      if (!answered && worker.current === w) { w.terminate(); worker.current = null; }
    };
  }, [req.pattern, req.flags, req.text, req.replacement]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { worker.current?.terminate(); worker.current = null; }, []);
  return out;
}

/** The text with the matches painted behind it. The textarea sits on top, transparent, and the backdrop gives the pane its height. */
function Marked({ text, matches, onChange }: { text: string; matches: RegexMatch[]; onChange: (v: string) => void }) {
  const parts = useMemo(() => {
    const out: React.ReactNode[] = [];
    let at = 0;
    matches.forEach((m, i) => {
      if (m.index < at) return;
      if (m.index > at) out.push(text.slice(at, m.index));
      if (m.end === m.index) out.push(<span key={i} className="border-l-2 border-accent" />);
      else out.push(<mark key={i} className={cx("rounded-[3px] text-transparent", i % 2 ? "bg-accent/45" : "bg-accent/25")}>{text.slice(m.index, m.end)}</mark>);
      at = m.end;
    });
    out.push(text.slice(at));
    return out;
  }, [text, matches]);
  const cls = "p-3.5 font-mono text-[13px] leading-[1.6] whitespace-pre-wrap break-words";
  return (
    <div className="absolute inset-0 overflow-auto">
      <div className="relative min-h-full">
        <div aria-hidden className={cx(cls, "pointer-events-none text-transparent")}>{parts}{"\n​"}</div>
        <textarea
          aria-label="Test text" value={text} onChange={(e) => onChange(e.target.value)} placeholder="Text to search"
          spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off"
          className={cx(cls, "absolute inset-0 size-full resize-none overflow-hidden bg-transparent text-fg outline-none placeholder:text-faint/60")}
        />
      </div>
    </div>
  );
}

export default function RegexTool({ tool, hue, init, onClose, mobile }: ToolProps) {
  const [pattern, setPattern] = useState("(\\d{4})-(\\d{2})-(\\d{2})");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState(init?.text ?? SAMPLE);
  const [replacement, setReplacement] = useState("$3.$2.$1");
  const [sheet, setSheet] = useState(false);
  const req = useDebounced(useMemo(() => ({ pattern, flags, text, replacement }), [pattern, flags, text, replacement]), 120);
  const out = useRegexRun(req);

  const result = out.state === "done" ? out.result : null;
  const good = result?.ok ? result : null;
  const matches = good?.matches ?? [];
  const toggle = (f: string) => setFlags((cur) => (cur.includes(f) ? cur.replace(f, "") : FLAGS.map((x) => x.id).filter((x) => x === f || cur.includes(x)).join("")));

  const status = !pattern ? "Type a pattern" : out.state === "timeout" ? "Stopped: too slow" : result && !result.ok ? "Invalid pattern" : good ? `${matches.length}${good.truncated ? "+" : ""} ${matches.length === 1 ? "match" : "matches"}` : "…";

  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={mobile ? undefined : "JavaScript regex syntax"}
      actions={<Btn onClick={() => setSheet(true)}><BookOpen size={14} /> {mobile ? "" : "Cheat sheet"}</Btn>}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="jk-card shrink-0 rounded-2xl p-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[15px] text-faint" aria-hidden>/</span>
            <Input aria-label="Pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Pattern, without the slashes" className="flex-1 text-[14px]" />
            <span className="font-mono text-[15px] text-faint" aria-hidden>/{flags}</span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {FLAGS.map((f) => <Chip key={f.id} on={flags.includes(f.id)} onClick={() => toggle(f.id)} title={`${f.name}: ${f.hint}`}><span className="font-mono">{f.id}</span><span className="text-faint">{f.name}</span></Chip>)}
            <span aria-live="polite" className={cx("ml-auto text-[12.5px]", result && !result.ok || out.state === "timeout" ? "text-bad" : "text-faint")}>{status}</span>
          </div>
          {result && !result.ok && <div className="mt-2"><ErrorLine>{result.error}</ErrorLine></div>}
          {out.state === "timeout" && <div className="mt-2"><ErrorLine>Stopped after {TIMEOUT_MS / 1000} s. Nested repeats like (a+)+ can take exponential time: simplify the pattern or shorten the text.</ErrorLine></div>}
        </div>

        <div className={cx("grid gap-3", mobile ? "shrink-0 grid-cols-1" : "min-h-0 flex-1 grid-cols-2")}>
          <Pane title="Text" className={mobile ? "h-[240px]" : "min-h-[260px]"} right={text && <Btn onClick={() => setText("")}>Clear</Btn>}>
            <Marked text={text} matches={matches} onChange={setText} />
          </Pane>
          <Pane title={`Matches${good ? ` · ${matches.length}${good.truncated ? "+" : ""}` : ""}`} className={mobile ? "h-[320px]" : "min-h-[260px]"} right={<CopyBtn text={matches.map((m) => m.text).join("\n")} label="Copy all" />}>
            <ul className="absolute inset-0 divide-y divide-line overflow-auto">
              {!matches.length && <li className="p-4 text-[13px] text-faint">{good ? "No matches." : out.state === "timeout" ? "Stopped." : result ? "Invalid pattern." : "…"}</li>}
              {matches.slice(0, 200).map((m, i) => (
                <li key={i} className="px-3.5 py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="w-7 shrink-0 text-[11.5px] text-faint">#{i + 1}</span>
                    <code className="min-w-0 flex-1 break-all font-mono text-[13px]">{m.text === "" ? <i className="text-faint">empty</i> : m.text}</code>
                    <span className="shrink-0 font-mono text-[11.5px] text-faint">{m.index}–{m.end}</span>
                  </div>
                  {m.groups.length > 0 && (
                    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pl-9 text-[12.5px]">
                      {m.groups.map((g, j) => (
                        <div key={j} className="contents">
                          <dt className="text-faint">{g.name ?? j + 1}</dt>
                          <dd className="min-w-0 break-all font-mono">{g.value === undefined ? <i className="text-faint">no match</i> : g.value === "" ? <i className="text-faint">empty</i> : g.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              ))}
              {matches.length > 200 && <li className="p-3 text-[12.5px] text-faint">Showing the first 200 of {matches.length}{good?.truncated ? `+ (the tester stops at ${MAX_MATCHES})` : ""}.</li>}
            </ul>
          </Pane>
        </div>

        <div className={cx("grid shrink-0 gap-3", mobile ? "grid-cols-1" : "grid-cols-2")}>
          <Pane title="Replace with" className="h-[140px]" right={<CopyBtn text={replacement} />}>
            <Area label="Replacement" value={replacement} onChange={setReplacement} placeholder="$1, $<name> and $& insert the match" />
          </Pane>
          <Pane title="Result" className="h-[140px]" right={<CopyBtn text={good?.replaced ?? ""} />}>
            <Area label="Replaced text" value={good?.replaced ?? ""} readOnly placeholder="Replaced text" />
          </Pane>
        </div>
      </div>

      {/* the frame header would sit over a sheet rendered inside it, so the sheet goes to the body */}
      {sheet && createPortal(<Sheet open={sheet} onClose={() => setSheet(false)} title="Regex cheat sheet">
        <div className="flex flex-col gap-4 pb-2">
          {CHEATSHEET.map((g) => (
            <section key={g.title}>
              <h3 className="mb-1 text-[11.5px] font-semibold uppercase tracking-[.14em] text-faint">{g.title}</h3>
              <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-1 text-[13px]">
                {g.rows.map(([t, d]) => (
                  <div key={t} className="contents"><dt className="whitespace-pre font-mono text-accent">{t}</dt><dd className="text-dim">{d}</dd></div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Sheet>, document.body)}
    </ToolFrame>
  );
}
