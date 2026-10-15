"use client";

import { ArrowRightLeft } from "lucide-react";
import { useMemo, useState } from "react";
import type { ToolProps } from "@jimkit/sdk";
import { Area, Btn, Chip, CopyBtn, Pane, Seg, SendTo, ToolFrame } from "@jimkit/ui";
import { MODES, type EncodeMode } from "./lib/encode";

export default function EncodeTool({ tool, hue, init, onClose, mobile }: ToolProps) {
  const initial = init?.text;
  const [mode, setMode] = useState<EncodeMode>("base64");
  const [dir, setDir] = useState<"enc" | "dec">("enc");
  const [input, setInput] = useState(initial ?? "");
  const m = MODES.find((x) => x.id === mode)!;
  const decodeOnly = m.enc === null;
  const direction = decodeOnly ? "dec" : dir;
  const out = useMemo(() => {
    if (!input) return null;
    const fn = direction === "enc" ? m.enc : m.dec;
    return fn ? fn(input) : null;
  }, [input, m, direction]);
  const text = out?.ok ? out.text : "";

  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={mobile ? undefined : tool.blurb}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3.5 py-2.5">
        <div className="flex flex-wrap gap-1.5">{MODES.map((x) => <Chip key={x.id} on={mode === x.id} onClick={() => setMode(x.id)}>{x.label}</Chip>)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2 px-3.5 pt-3">
        {!decodeOnly && <Seg label="Direction" value={dir} onChange={setDir} options={[{ id: "enc", label: "Encode" }, { id: "dec", label: "Decode" }]} />}
        {decodeOnly && <span className="text-[13px] text-faint">Reads the header and payload. The signature is not verified.</span>}
      </div>
      <div className={`grid min-h-0 flex-1 gap-3 p-3 ${mobile ? "grid-rows-2" : "grid-cols-2"}`}>
        <Pane title={direction === "enc" ? "Text" : "Encoded"} right={input && <Btn onClick={() => setInput("")}>Clear</Btn>}>
          <Area label="Input" value={input} onChange={setInput} placeholder={direction === "enc" ? "Type or paste text…" : mode === "jwt" ? "Paste a JWT: xxxxx.yyyyy.zzzzz" : "Paste the encoded text…"} />
        </Pane>
        <Pane title={direction === "enc" ? "Encoded" : "Text"} right={<>
          <Btn disabled={!text || decodeOnly} onClick={() => { setInput(text); setDir(direction === "enc" ? "dec" : "enc"); }} title="Use the result as the input, and flip direction"><ArrowRightLeft size={14} /> {mobile ? "" : "Flip"}</Btn>
          <CopyBtn text={text} />
          <SendTo files={() => [new File([text], direction === "enc" ? `${mode}-encoded.txt` : "decoded.txt", { type: "text/plain" })]} disabled={!text} title="Open the result in another tool" />
        </>}>
          {out && !out.ok ? <p className="absolute inset-0 overflow-auto p-4 text-[13.5px] text-bad">{out.error}</p> : <Area label="Output" value={text} readOnly placeholder="The result appears here, live." />}
        </Pane>
      </div>
    </ToolFrame>
  );
}
