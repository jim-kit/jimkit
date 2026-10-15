"use client";

import { Copy, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { ToolProps } from "@jimkit/sdk";
import { Btn, Chip, CopyBtn, Pane, Seg, SendTo, ToolFrame, copyText, cx } from "@jimkit/ui";
import {
  NANO_ALPHABETS, SETS, cryptoFill, encodeBytes, password, passwordBits, randomBytes, randomString, ulidBatch, uuid4, uuid7Batch,
  type ByteFormat, type SetId,
} from "./lib/generate";
import { ErrorLine, Field, Input, Select } from "./kit";

const KINDS = [
  { id: "uuid4", label: "UUID v4", note: "122 random bits" },
  { id: "uuid7", label: "UUID v7", note: "Starts with a timestamp, so IDs sort by creation time" },
  { id: "ulid", label: "ULID", note: "Like a UUID, but sortable and 26 characters" },
  { id: "nanoid", label: "NanoID", note: "Random characters from an alphabet. 21 by default" },
  { id: "password", label: "Password", note: "At least one character from each selected set" },
  { id: "bytes", label: "Random bytes", note: "Random bytes as hex or Base64" },
] as const;
type Kind = (typeof KINDS)[number]["id"];

const SET_LABELS: Record<SetId, string> = { lower: "a-z", upper: "A-Z", digits: "0-9", symbols: "!@#$" };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? Math.round(n) : lo));

function Num({ label, value, onChange, min, max }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  return <Field label={label} className="w-[96px]"><Input type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => onChange(clamp(e.target.valueAsNumber, min, max))} /></Field>;
}

export default function Generators({ tool, hue, onClose, mobile }: ToolProps) {
  const [kind, setKind] = useState<Kind>("uuid4");
  const [count, setCount] = useState(5);
  const [seed, setSeed] = useState(0);
  const [upper, setUpper] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [nanoLen, setNanoLen] = useState(21);
  const [alpha, setAlpha] = useState<keyof typeof NANO_ALPHABETS | "custom">("url");
  const [custom, setCustom] = useState("");
  const [pwLen, setPwLen] = useState(20);
  const [sets, setSets] = useState<SetId[]>(["lower", "upper", "digits", "symbols"]);
  const [noAmb, setNoAmb] = useState(false);
  const [nBytes, setNBytes] = useState(32);
  const [format, setFormat] = useState<ByteFormat>("hex");

  const pw = useMemo(() => ({ length: pwLen, sets, noAmbiguous: noAmb }), [pwLen, sets, noAmb]);
  const made = useMemo<{ values: string[]; error?: string }>(() => {
    void seed;
    try {
      const n = count;
      switch (kind) {
        case "uuid4": return { values: Array.from({ length: n }, () => uuid4()).map((s) => fmtUuid(s, upper, hyphens)) };
        case "uuid7": return { values: uuid7Batch(n).map((s) => fmtUuid(s, upper, hyphens)) };
        case "ulid": return { values: ulidBatch(n).map((s) => (upper ? s : s.toLowerCase())) };
        case "nanoid": return { values: Array.from({ length: n }, () => randomString(alpha === "custom" ? custom : NANO_ALPHABETS[alpha].chars, nanoLen)) };
        case "password": return { values: Array.from({ length: n }, () => password(pw)) };
        case "bytes": return { values: Array.from({ length: n }, () => { const s = encodeBytes(randomBytes(nBytes, cryptoFill), format); return upper && format === "hex" ? s.toUpperCase() : s; }) };
      }
    } catch (e) {
      return { values: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [kind, count, seed, upper, hyphens, nanoLen, alpha, custom, pw, nBytes, format]);

  const k = KINDS.find((x) => x.id === kind)!;
  const bits = kind === "password" ? passwordBits(pw) : 0;
  const strength = bits >= 80 ? "strong" : bits >= 60 ? "good" : bits >= 40 ? "fair" : "weak";
  const toggleSet = (id: SetId) => setSets((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : (Object.keys(SETS) as SetId[]).filter((x) => x === id || cur.includes(x))));

  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={mobile ? undefined : k.note}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {KINDS.map((x) => <Chip key={x.id} on={kind === x.id} onClick={() => { setKind(x.id); setCount((c) => (x.id === "password" || x.id === "bytes" ? (c === 5 ? 1 : c) : c === 1 ? 5 : c)); }}>{x.label}</Chip>)}
        </div>
        {mobile && <p className="shrink-0 text-[13px] text-faint">{k.note}</p>}

        <div className="jk-card flex shrink-0 flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl p-3.5">
          <Num label="Count" value={count} onChange={setCount} min={1} max={1000} />
          {(kind === "uuid4" || kind === "uuid7") && (
            <div className="flex flex-wrap gap-1.5"><Chip on={upper} onClick={() => setUpper(!upper)}>Uppercase</Chip><Chip on={!hyphens} onClick={() => setHyphens(!hyphens)}>No hyphens</Chip></div>
          )}
          {kind === "ulid" && <Chip on={upper} onClick={() => setUpper(!upper)}>Uppercase</Chip>}
          {kind === "nanoid" && (
            <>
              <Num label="Length" value={nanoLen} onChange={setNanoLen} min={1} max={256} />
              <Field label="Alphabet" className="w-[230px] max-w-full">
                <Select value={alpha} onChange={(e) => setAlpha(e.target.value as typeof alpha)}>
                  {Object.entries(NANO_ALPHABETS).map(([id, a]) => <option key={id} value={id}>{a.label}</option>)}
                  <option value="custom">Your own characters</option>
                </Select>
              </Field>
              {alpha === "custom" && <Field label="Characters" className="min-w-[200px] flex-1"><Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="abc123" /></Field>}
            </>
          )}
          {kind === "password" && (
            <>
              <Field label={`Length: ${pwLen}`} className="w-[200px] max-w-full">
                <input type="range" min={4} max={128} value={pwLen} onChange={(e) => setPwLen(Number(e.target.value))} aria-label="Password length" className="h-9 accent-[var(--accent)]" />
              </Field>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(SETS) as SetId[]).map((id) => <Chip key={id} on={sets.includes(id)} onClick={() => toggleSet(id)}><span className="font-mono">{SET_LABELS[id]}</span></Chip>)}
                <Chip on={noAmb} onClick={() => setNoAmb(!noAmb)} title="Leaves out I l 1 | O 0 o">No look-alikes</Chip>
              </div>
            </>
          )}
          {kind === "bytes" && (
            <>
              <Num label="Bytes" value={nBytes} onChange={setNBytes} min={1} max={1024} />
              <Seg label="Format" value={format} onChange={setFormat} options={[{ id: "hex", label: "Hex" }, { id: "base64", label: "Base64" }, { id: "base64url", label: "Base64url" }]} />
              {format === "hex" && <Chip on={upper} onClick={() => setUpper(!upper)}>Uppercase</Chip>}
            </>
          )}
          <Btn primary onClick={() => setSeed((s) => s + 1)} className="ml-auto"><RefreshCw size={14} /> Generate</Btn>
        </div>

        <Pane title={`Result${made.values.length > 1 ? ` · ${made.values.length}` : ""}`} className={mobile ? "h-[340px] shrink-0" : "min-h-[200px] flex-1"}
          right={<>
            {kind === "password" && bits > 0 && <span className={cx("text-[12px]", bits >= 60 ? "text-ok" : bits >= 40 ? "text-warn" : "text-bad")}>about {Math.round(bits)} bits · {strength}</span>}
            <CopyBtn text={made.values.join("\n")} label={made.values.length > 1 ? "Copy all" : "Copy"} />
            <SendTo files={() => [new File([made.values.join("\n")], `${kind}s.txt`, { type: "text/plain" })]} disabled={!made.values.length} title="Open the result in another tool" />
          </>}>
          {made.error ? <div className="p-4"><ErrorLine>{made.error}</ErrorLine></div> : (
            <ul className="absolute inset-0 divide-y divide-line overflow-auto">
              {made.values.map((v, i) => (
                <li key={i}>
                  <button onClick={() => copyText(v)} title="Copy" className="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-tint">
                    <span className="min-w-0 flex-1 break-all font-mono text-[13.5px] leading-relaxed">{v}</span>
                    <Copy size={14} className="shrink-0 text-faint opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Pane>
      </div>
    </ToolFrame>
  );
}

function fmtUuid(s: string, upper: boolean, hyphens: boolean) {
  const t = hyphens ? s : s.replace(/-/g, "");
  return upper ? t.toUpperCase() : t;
}
