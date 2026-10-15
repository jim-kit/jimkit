"use client";

import { Check, FileUp, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ALGOS, HMAC_ALGOS, guessAlgo, sameHash, type Algo } from "./lib/hash";
import { IN_MEMORY_MAX, hashBytes, type Results } from "./lib/engine";
import { Cancelled, startHash } from "./runner";
import type { ToolProps } from "@jimkit/sdk";
import { useHost } from "@jimkit/sdk/react";
import { Area, Btn, Chip, CopyBtn, Pane, Seg, ToolFrame, formatBytes, toast, useDebounced, useFilePicker } from "@jimkit/ui";

const INLINE_TEXT = 256 * 1024; // text up to this is hashed on the page, bigger goes to the worker

/** The HMAC key as bytes, or null when it is hex mode and not valid hex. */
function parseKey(s: string, hex: boolean): Uint8Array | null {
  if (!hex) return new TextEncoder().encode(s);
  const h = s.replace(/[\s:]/g, "");
  if (h.length % 2 || /[^0-9a-f]/i.test(h)) return null;
  return Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
}

const readList = (raw: string | null): Algo[] | null => {
  try { const v = JSON.parse(raw ?? "null"); return Array.isArray(v) ? ALGOS.filter((a) => v.includes(a)) : null; } catch { return null; }
};

export default function Hash({ tool, hue, init, onClose, mobile }: ToolProps) {
  const store = useHost().storage("hash");
  const initial = init?.files?.[0];
  const [mode, setMode] = useState<"text" | "file">(initial ? "file" : "text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(initial ?? null);
  const [upper, setUpper] = useState(() => store.get("upper") === "1");
  const [picked, setPicked] = useState<Algo[] | null>(() => readList(store.get("algos")));
  const [hmac, setHmac] = useState(false);
  const [keyText, setKeyText] = useState("");
  const [keyHex, setKeyHex] = useState(false);
  const [expected, setExpected] = useState("");
  const [result, setResult] = useState<Results>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ms, setMs] = useState<number | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [nonce, setNonce] = useState(0);
  const cancel = useRef<(() => void) | null>(null);
  const dtext = useDebounced(text, 150);
  const picker = useFilePicker(undefined, (f) => { setFile(f); setMode("file"); });
  const [over, setOver] = useState(false);

  const big = mode === "file" && !!file && file.size > IN_MEMORY_MAX;
  // untouched, a big file gets one algorithm (each extra one is more work in plain code); a small one gets them all
  const algos = useMemo<Algo[]>(() => picked ?? (big ? ["SHA-256"] : [...ALGOS]), [picked, big]);
  const key = useMemo(() => (hmac ? parseKey(keyText, keyHex) : undefined), [hmac, keyText, keyHex]);
  const keyBad = hmac && key === null;
  const usable = (a: Algo) => !hmac || HMAC_ALGOS.includes(a);

  const toggle = (a: Algo) => {
    const next = ALGOS.filter((x) => (x === a ? !algos.includes(a) : algos.includes(x)));
    setPicked(next);
    store.set("algos", JSON.stringify(next));
  };

  useEffect(() => {
    let live = true;
    const source = mode === "file" ? file : dtext ? new TextEncoder().encode(dtext) : null;
    const job = { algos, key: key ?? undefined };
    setCancelled(false);
    if (!source || keyBad || !algos.length) { setResult({}); setMs(null); setBusy(false); return; }
    const t0 = performance.now();
    const done = (r: Results) => { if (live) { setResult(r); setMs(performance.now() - t0); setBusy(false); } };
    const fail = (e: unknown) => {
      if (!live || e instanceof Cancelled) return;
      setBusy(false);
      toast.error("Couldn't hash that", { description: mode === "file" ? "The file may have changed or can't be read." : undefined });
    };
    if (source instanceof Uint8Array && source.length <= INLINE_TEXT) {
      hashBytes(source, job).then(done, fail);
      return () => { live = false; };
    }
    if (mode === "file") setResult({});
    setBusy(true); setProgress(0);
    const run = startHash(source, job, (f) => { if (live) setProgress(f); });
    cancel.current = run.cancel;
    run.promise.then(done, fail);
    return () => { live = false; run.cancel(); cancel.current = null; };
  }, [mode, dtext, file, algos, key, keyBad, nonce]);

  const stop = () => { cancel.current?.(); setBusy(false); setCancelled(true); };

  const shown = (h?: string) => (h ? (upper ? h.toUpperCase() : h) : "");
  const guess = useMemo(() => guessAlgo(expected), [expected]);
  const matchAlgo = useMemo(() => (expected.trim() ? ALGOS.find((a) => result[a] && sameHash(result[a]!, expected)) ?? null : null), [expected, result]);
  const label = (a: Algo) => (hmac && usable(a) ? `HMAC ${a}` : a);
  const all = ALGOS.filter((a) => result[a]).map((a) => `${label(a)}: ${shown(result[a])}`).join("\n");

  // what the compare box says
  const verdict = (() => {
    if (!expected.trim()) return null;
    if (matchAlgo) return { ok: true, text: `Match: ${label(matchAlgo)}` };
    if (busy) return { ok: undefined, text: "Waiting for the hash…" };
    if (!Object.keys(result).length) return { ok: undefined, text: guess ? `Looks like ${guess}` : "" };
    if (guess && !algos.includes(guess)) return { ok: undefined, text: `Looks like ${guess}. Tick it in the results to compare.` };
    return { ok: false, text: guess && result[guess] ? `No match. This is not the ${label(guess)} of the input.` : "No match with any hash shown." };
  })();

  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={mobile ? undefined : tool.blurb}
      actions={<Chip on={upper} onClick={() => { setUpper(!upper); store.set("upper", upper ? "0" : "1"); }}>UPPERCASE</Chip>}>
      {picker.input}
      <div className={`grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 ${mobile ? "" : "grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"}`}>
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Seg label="Input kind" value={mode} onChange={setMode} options={[{ id: "text", label: "Text" }, { id: "file", label: "File" }]} />
            <Chip on={hmac} onClick={() => setHmac(!hmac)} title="Keyed hash (HMAC)">HMAC</Chip>
          </div>
          {hmac && (
            <div className="flex flex-wrap items-center gap-2">
              <div className={`flex min-w-[160px] flex-1 items-center rounded-xl border bg-field ${keyBad ? "border-bad/60" : "border-line-strong focus-within:border-accent/60"}`}>
                <input value={keyText} onChange={(e) => setKeyText(e.target.value)} aria-label="HMAC key" placeholder="Secret key" autoComplete="off" spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent px-2.5 py-2 font-mono text-[13px] outline-none placeholder:text-faint/60" />
              </div>
              <Seg label="Key format" small value={keyHex ? "hex" : "text"} onChange={(v) => setKeyHex(v === "hex")} options={[{ id: "text", label: "Text" }, { id: "hex", label: "Hex" }]} />
              {keyBad && <p className="w-full px-1 text-[12px] text-bad">Key is not valid hex. Use pairs of 0-9 and a-f.</p>}
            </div>
          )}
          {mode === "text" ? (
            <Pane title="Text" className={mobile ? "h-[200px]" : "min-h-[220px] flex-1"} right={text && <Btn onClick={() => setText("")}>Clear</Btn>}>
              <Area label="Text to hash" value={text} onChange={setText} placeholder="Type or paste text. It is hashed as UTF-8, as you type." />
            </Pane>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
              className={`flex min-h-[220px] flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-6 text-center transition ${over ? "border-accent bg-accent/10" : "border-line-strong bg-raised"}`}>
              {file ? (
                <>
                  <FileUp size={30} className="text-accent" />
                  <p className="max-w-full truncate text-[15px] font-medium">{file.name}</p>
                  <p className="text-[13px] text-faint">{formatBytes(file.size)}{busy ? "" : cancelled ? " · cancelled" : ms !== null ? ` · ${ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`}` : ""}</p>
                  {busy && (
                    <div className="flex w-full max-w-[320px] flex-col items-center gap-2">
                      <div role="progressbar" aria-label="Hashing" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-2 w-full overflow-hidden rounded-full bg-tint-2">
                        <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }} />
                      </div>
                      <p className="text-[12.5px] tabular-nums text-faint">{Math.round(progress * 100)}%</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {busy ? <Btn onClick={stop}><X size={14} /> Cancel</Btn> : <>
                      {cancelled && <Btn primary onClick={() => setNonce((n) => n + 1)}>Hash again</Btn>}
                      <Btn onClick={picker.open}>Choose another</Btn><Btn onClick={() => { setFile(null); setCancelled(false); }}><X size={14} /> Remove</Btn>
                    </>}
                  </div>
                  {big && !busy && algos.length > 1 && <p className="max-w-[320px] text-[12.5px] text-faint">Big files are read in one pass, and every algorithm ticked adds time.</p>}
                </>
              ) : (
                <>
                  <Upload size={30} className="text-faint" />
                  <p className="text-[15px] font-medium">Drop a file here</p>
                  <p className="text-[13px] text-faint">No size limit.</p>
                  <Btn primary onClick={picker.open}>Choose a file</Btn>
                </>
              )}
            </div>
          )}
          <Pane title="Compare with a hash you were given" className="shrink-0">
            <div className="relative h-[72px]"><Area label="Expected hash" value={expected} onChange={setExpected} placeholder="Paste the checksum from the download page…" /></div>
            <div role="status" aria-live="polite" className={`flex min-h-[40px] items-center gap-2 border-t border-line px-3.5 py-2 text-[13px] ${verdict?.ok === true ? "bg-ok/10 font-medium text-ok" : verdict?.ok === false ? "bg-bad/10 font-medium text-bad" : "text-faint"}`}>
              {verdict?.ok === true && <Check size={16} className="shrink-0" />}
              {verdict?.ok === false && <X size={16} className="shrink-0" />}
              <span>{verdict ? verdict.text : "Paste a checksum to compare."}</span>
            </div>
          </Pane>
        </div>

        <Pane title={hmac ? "HMAC" : "Results"} className={mobile ? "" : "min-h-[360px]"} right={<CopyBtn text={all} label="Copy all" disabled={!all} />}>
          <ul className="divide-y divide-line overflow-auto md:absolute md:inset-0">
            {ALGOS.map((a) => {
              const h = result[a];
              const on = algos.includes(a) && usable(a);
              const hit = matchAlgo === a;
              return (
                <li key={a} className={`flex items-start gap-3 px-3.5 py-3 transition ${hit ? "bg-ok/10" : ""}`}>
                  <button role="checkbox" aria-checked={on} disabled={!usable(a)} onClick={() => toggle(a)} title={on ? `Skip ${a}` : `Include ${a}`}
                    className={`mt-0.5 flex ${hmac ? "w-[118px]" : "w-[84px]"} shrink-0 items-center gap-1.5 text-left text-[12px] font-semibold tracking-wide disabled:opacity-40 ${hit ? "text-ok" : on ? "text-faint" : "text-faint/50"}`}>
                    <span className={`grid size-3.5 shrink-0 place-items-center rounded-[4px] border ${on ? "border-accent bg-accent text-accent-fg" : "border-line-strong"}`}>{on && <Check size={10} strokeWidth={3.5} />}</span>
                    {label(a)}
                  </button>
                  <span className="min-w-0 flex-1 break-all font-mono text-[12.5px] leading-relaxed">
                    {h ? shown(h) : <span className="text-faint/60">{!usable(a) ? "no HMAC" : !on ? "skipped" : busy ? "…" : "—"}</span>}
                  </span>
                  <CopyBtn text={shown(h)} label="" disabled={!h} />
                </li>
              );
            })}
          </ul>
        </Pane>
      </div>
    </ToolFrame>
  );
}
