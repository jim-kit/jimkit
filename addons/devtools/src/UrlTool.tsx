"use client";

import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ToolProps } from "@jimkit/sdk";
import { Btn, CopyBtn, IconBtn, Pane, ToolFrame, cx } from "@jimkit/ui";
import { buildUrl, parseUrl, type Row } from "./lib/url";
import { ErrorLine, Field, Input } from "./kit";

type Edit = "protocol" | "username" | "password" | "hostname" | "port" | "pathname" | "hash";
const PARTS: [Edit, string][] = [["protocol", "Scheme"], ["username", "User"], ["password", "Password"], ["hostname", "Host"], ["port", "Port"], ["pathname", "Path"], ["hash", "Fragment"]];

export default function UrlTool({ tool, hue, init, onClose, mobile }: ToolProps) {
  const [url, setUrl] = useState(init?.text?.trim() || "https://example.com:8080/search/items?q=blue%20shoes&page=2&tag=a&tag=b#results");
  const initial = useMemo(() => { const p = parseUrl(url); return p.ok ? p.rows : []; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [rows, setRows] = useState<Row[]>(initial);
  const parsed = useMemo(() => parseUrl(url), [url]);
  const parts = parsed.ok ? parsed.parts : null;

  const typeUrl = (v: string) => { setUrl(v); const p = parseUrl(v); if (p.ok) setRows(p.rows); };
  const edit = (patch: Partial<Record<Edit, string>>, nextRows = rows) => { if (parts) setUrl(buildUrl({ ...parts, ...patch }, nextRows)); };
  const editRows = (next: Row[]) => { setRows(next); edit({}, next); };

  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={mobile ? undefined : "Split a URL and edit its query string"}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="jk-card flex shrink-0 flex-col gap-2 rounded-2xl p-3.5">
          <Field label="URL">
            <div className="flex gap-2"><Input aria-label="URL" value={url} onChange={(e) => typeUrl(e.target.value)} className="flex-1 text-[14px]" /><CopyBtn text={parsed.ok ? url : ""} /></div>
          </Field>
          {!parsed.ok && <ErrorLine>{parsed.error}</ErrorLine>}
        </div>
        {parts && (
          <div className={cx("grid gap-3", mobile ? "grid-cols-1" : "grid-cols-2")}>
            <Pane title="Parts" className="self-start">
              <div className="grid grid-cols-2 gap-3 p-3.5">
                {PARTS.map(([id, label]) => (
                  <Field key={id} label={label} className={id === "pathname" || id === "hostname" || id === "hash" ? "col-span-2" : ""}>
                    <Input aria-label={label} value={parts[id]} onChange={(e) => edit({ [id]: e.target.value })} />
                  </Field>
                ))}
              </div>
            </Pane>
            <Pane title={`Query parameters${rows.length ? ` · ${rows.length}` : ""}`} className="self-start" right={<Btn onClick={() => setRows([...rows, ["", ""]])}><Plus size={14} /> Add</Btn>}>
              <div className="flex flex-col gap-2 p-3.5">
                {!rows.length && <p className="text-[13px] text-faint">No query parameters.</p>}
                {rows.map(([k, v], i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input aria-label={`Name ${i + 1}`} value={k} onChange={(e) => editRows(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} placeholder="name" className="w-0 flex-1" />
                    <span className="text-faint" aria-hidden>=</span>
                    <Input aria-label={`Value ${i + 1}`} value={v} onChange={(e) => editRows(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} placeholder="value" className="w-0 flex-[1.4]" />
                    <IconBtn label={`Remove parameter ${i + 1}`} onClick={() => editRows(rows.filter((_, j) => j !== i))}><X size={16} /></IconBtn>
                  </div>
                ))}
              </div>
            </Pane>
          </div>
        )}
      </div>
    </ToolFrame>
  );
}
