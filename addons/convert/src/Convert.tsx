"use client";

import type { ToolProps } from "@jimkit/sdk";
import { useHost } from "@jimkit/sdk/react";
import { Btn, Menu, Seg, SendTo, Spinner, Tile, ToolFrame, cx, formatBytes, type MenuHeading, type MenuItem } from "@jimkit/ui";
import { ArrowRight, ChevronDown, Download, FolderOpen, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { extensionOf } from "./lib/filekinds";
import { KIND_LABEL, formatOf } from "./lib/registry/formats";
import { setAvailableEngines, targetsFor, type Target, type TargetGroup } from "./lib/registry/plan";
import { useConverter, type Item, type QualityLevel } from "./client/useConverter";

const LEVELS: { id: QualityLevel; label: string }[] = [{ id: "low", label: "Small" }, { id: "balanced", label: "Balanced" }, { id: "high", label: "Best" }];
const SIZES = [{ px: 0, label: "Original size" }, { px: 4096, label: "4096 px" }, { px: 2048, label: "2048 px" }, { px: 1280, label: "1280 px" }, { px: 720, label: "720 px" }];

/** "via PNG", "Loses some quality", or both, for a route. */
function routeNote(t: Target): string | null {
  const bits: string[] = [];
  if (t.route.via.length) bits.push(`via ${t.route.via.map((v) => v.toUpperCase()).join(" → ")}`);
  if (t.route.lossy) bits.push("loses some quality");
  return bits.length ? bits.join(", ") : null;
}

function statusText(it: Item): string {
  const c = it.convert;
  switch (c.phase) {
    case "uploading": return `Uploading ${Math.round(c.uploadProgress * 100)}%`;
    case "queued": return c.queuePosition && c.queuePosition > 1 ? `Waiting, #${c.queuePosition} in line` : "Waiting to start";
    case "running": {
      const step = c.steps > 1 ? ` (step ${Math.min(c.step + 1, c.steps)} of ${c.steps})` : "";
      return c.jobProgress > 0 ? `Converting ${Math.round(c.jobProgress * 100)}%${step}` : `Converting${step}`;
    }
    case "done": return c.outSize ? `Done · ${formatBytes(c.outSize)}` : "Done";
    case "failed": return c.error ?? "Failed";
    default: return c.to ? "Ready" : it.convertible ? "Pick a format" : "Can't convert this type yet";
  }
}

function barValue(it: Item): number | null {
  const c = it.convert;
  if (c.phase === "uploading") return c.uploadProgress * 0.25;
  if (c.phase === "queued") return 0.25;
  if (c.phase === "running") return 0.25 + 0.75 * Math.max(0, c.jobProgress);
  if (c.phase === "done") return 1;
  return null;
}

/** A dropdown of the formats a file (or every file) can become, grouped by kind. */
function TargetMenu({ groups, value, onPick, label = "Convert to", disabled }: { groups: TargetGroup[]; value: string | null; onPick: (to: string) => void; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key, true); };
  }, [open]);
  const current = groups.flatMap((g) => g.targets).find((t) => t.format.id === value);
  return (
    <div ref={ref} className="relative">
      <button
        disabled={disabled || !groups.length} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className={cx("flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] transition active:scale-[.97] disabled:opacity-40", current ? "border-accent/50 bg-accent/10 text-fg" : "border-line-strong text-dim hover:bg-tint-2 hover:text-fg")}
      >
        {current ? <><ArrowRight size={14} className="text-accent" /> {current.format.label}</> : label}
        <ChevronDown size={14} className={cx("text-faint transition", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="jk-panel jk-pop absolute right-0 z-30 mt-2 max-h-[420px] w-[min(340px,86vw)] overflow-y-auto rounded-2xl p-3 shadow-2xl scroll-hide">
          {groups.map((g) => (
            <div key={g.kind} className="mb-3 last:mb-0">
              <p className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-[.12em] text-faint">{KIND_LABEL[g.kind]}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.targets.map((t) => (
                  <button
                    key={t.format.id} role="menuitem" title={routeNote(t) ?? undefined} onClick={() => { onPick(t.format.id); setOpen(false); }}
                    className={cx("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition hover:bg-tint-2", t.format.id === value ? "border-accent/60 bg-accent/15" : "border-line bg-tint")}
                  >
                    {t.format.label}
                    {t.route.via.length > 0 && <span className="text-[10px] text-faint">via {t.route.via[0].toUpperCase()}</span>}
                    {t.route.lossy && <span className="size-1.5 rounded-full bg-warn" aria-label="loses some quality" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="mt-2 flex items-center gap-1.5 border-t border-line px-1 pt-2.5 text-[11px] text-faint"><span className="size-1.5 rounded-full bg-warn" /> loses some quality</p>
        </div>
      )}
    </div>
  );
}

function Row({ it, c }: { it: Item; c: ReturnType<typeof useConverter> }) {
  const host = useHost();
  const cv = it.convert;
  const groups = useMemo(() => (it.convertible ? targetsFor(it.ext) : []), [it.convertible, it.ext]);
  const working = cv.phase === "uploading" || cv.phase === "queued" || cv.phase === "running";
  const href = c.downloadUrl(it);
  const bar = barValue(it);
  // the converted file lives on the server for a few hours; fetch it when "Send to…" is pressed, so another tool can take it as a file
  const converted = async () => {
    const r = await fetch(href ?? "", { credentials: "same-origin" });
    if (!r.ok) throw new Error("The converted file couldn't be fetched");
    const name = `${it.file.name.replace(/\.[^.]+$/, "")}.${cv.to}`;
    // the server may say "octet-stream"; the converter knows what it just made, and the tools that take the file go by its type
    return [new File([await r.blob()], name, { type: formatOf(cv.to ?? "")?.mime ?? r.headers.get("content-type") ?? "" })];
  };
  const edit = host.hasTool("image-editor") && /^(jpe?g|png|webp|gif|avif|bmp)$/.test(it.ext);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <Tile icon={it.kind.icon} hue={it.kind.hue} size={38} />
      <div className="min-w-0 flex-1 basis-[180px]">
        <p className="truncate text-[14px]">{it.file.name}</p>
        <p className={cx("text-[12px]", cv.phase === "failed" ? "text-bad" : cv.phase === "done" ? "text-ok" : "text-faint")}>
          {it.status === "rejected" ? it.reason : <>{it.kind.label} · {extensionOf(it.file.name)} · {formatBytes(it.file.size)}{cv.phase !== "idle" || cv.to || !it.convertible ? ` · ${statusText(it)}` : ""}</>}
        </p>
        {working && <div className="mt-2 h-1 w-full max-w-[360px] overflow-hidden rounded-full bg-tint-2"><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(3, (bar ?? 0) * 100)}%` }} /></div>}
      </div>
      <div className="flex items-center gap-2">
        {it.status === "ok" && edit && !working && <Btn onClick={() => host.open("image-editor", { files: [it.file] })} title="Edit this image first">Edit</Btn>}
        {it.status === "ok" && it.convertible && <TargetMenu groups={groups} value={cv.to} onPick={(to) => c.setTarget(it.id, to)} disabled={working} />}
        {it.status === "ok" && cv.phase === "done" && href && <a href={href} download className="flex items-center gap-1.5 rounded-xl border border-ok/50 bg-ok/10 px-3 py-2 text-[13px] font-medium text-ok transition hover:bg-ok/20"><Download size={14} /> Download</a>}
        {it.status === "ok" && cv.phase === "done" && href && <SendTo files={converted} as={{ name: `result.${cv.to}`, type: formatOf(cv.to ?? "")?.mime }} title="Open the converted file in another tool" />}
        {it.status === "ok" && cv.phase === "failed" && <Btn onClick={() => c.convertOne(it.id)}><RotateCcw size={13} /> Retry</Btn>}
        {it.status === "rejected" && <span className="rounded-full bg-bad/10 px-2.5 py-1 text-[12px] text-bad">Not added</span>}
        <button onClick={() => c.remove(it.id)} aria-label={`Remove ${it.file.name}`} className="grid size-8 place-items-center rounded-lg text-faint transition hover:bg-tint-2 hover:text-fg"><X size={15} /></button>
      </div>
    </li>
  );
}

export default function Convert({ tool, hue, init, onClose, mobile }: ToolProps) {
  const host = useHost();
  const c = useConverter(host.session.limits, host.session.tier);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Ask the server which engines it really has before offering anything, so only real conversions are listed.
  const [engines, setEngines] = useState<{ ready: boolean; missing: { engine: string; package: string }[] }>({ ready: false, missing: [] });
  useEffect(() => {
    let live = true;
    host.api("convert", "engines").then((r) => r.json()).then((b: { engines: never[]; missing: { engine: string; package: string }[] }) => {
      if (!live) return;
      setAvailableEngines(b.engines);
      setEngines({ ready: true, missing: b.missing });
    }).catch(() => { if (live) setEngines({ ready: true, missing: [] }); });
    return () => { live = false; };
  }, [host]);
  const initFiles = init?.files;
  const added = useRef(false);
  useEffect(() => { if (engines.ready && initFiles?.length && !added.current) { added.current = true; c.add(initFiles); } }, [engines.ready, initFiles, c]);
  const missingPkgs = [...new Set(engines.missing.map((m) => m.package))];

  const common = c.commonTargets();
  const L = host.session.limits;
  const pct = Math.min(100, (c.okBytes / L.maxBatchBytes) * 100);
  const sizeMenu: (MenuItem | MenuHeading)[] = SIZES.map((z) => ({ id: String(z.px), label: z.label, hint: c.quality.maxDim === z.px ? "✓" : undefined, run: () => c.setQuality({ maxDim: z.px }) }));

  return (
    <ToolFrame
      title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile} subtitle={mobile ? undefined : `Files are uploaded when you convert, kept for a few hours, then deleted`}
      actions={<Btn onClick={() => fileInput.current?.click()}><FolderOpen size={14} /> {mobile ? "" : "Add files"}</Btn>}
    >
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) c.add(e.target.files); e.target.value = ""; }} />
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); if (e.dataTransfer.files.length) c.add(e.dataTransfer.files); }}
      >
        <div className="mx-auto w-full max-w-[920px] px-4 py-5 md:px-6">
          {missingPkgs.length > 0 && (
            <p className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[13px] text-dim">
              <span className="font-medium text-warn">Some conversions aren't available here.</span> Not installed: {missingPkgs.join(", ")}. The <code className="font-mono">full</code> image has them all.
            </p>
          )}
          {c.items.length === 0 ? (
            <button onClick={() => fileInput.current?.click()} className={cx("jk-panel flex w-full flex-col items-center gap-3 rounded-3xl border-dashed px-6 py-16 text-center transition", over && "border-accent bg-accent/10")}>
              <Upload size={40} className="text-accent" strokeWidth={1.5} />
              <span className="text-[19px] font-semibold">Drop files to convert</span>
              <span className="max-w-md text-[14px] text-dim">Images, video, audio, documents, PDFs and data files. Up to {formatBytes(L.maxFileBytes, 0)} each. Pick the format per file, then convert.</span>
              <span className="mt-2 rounded-xl border border-accent bg-accent px-4 py-2.5 text-[14px] font-medium text-accent-fg">Choose files</span>
            </button>
          ) : (
            <section className={cx("jk-card rounded-2xl", over && "border-accent")}>
              <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 pb-3 pt-4">
                <div className="min-w-[200px] flex-1">
                  <p className="text-[15px] font-medium">{c.okCount} {c.okCount === 1 ? "file" : "files"} · {formatBytes(c.okBytes)}</p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-tint-2"><div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
                  <p className="mt-1.5 text-[12px] text-faint">{formatBytes(c.okBytes)} of {formatBytes(L.maxBatchBytes, 0)} batch limit</p>
                </div>
                <Seg label="Quality" small value={c.quality.level} onChange={(level) => c.setQuality({ level })} options={LEVELS} />
                <Menu align="right" width={190} trigger={SIZES.find((z) => z.px === c.quality.maxDim)?.label ?? "Size"} items={sizeMenu} />
                {c.okCount > 1 && common.length > 0 && <TargetMenu groups={common} value={null} onPick={c.setAllTargets} label="All to…" />}
                <Btn onClick={c.clear}><Trash2 size={14} /> Clear</Btn>
                <Btn primary onClick={c.convertAll} disabled={c.readyToConvert === 0}>
                  {c.busy > 0 ? <Spinner size={15} /> : null}
                  {c.readyToConvert > 0 ? `Convert ${c.readyToConvert}` : c.busy > 0 ? "Working…" : "Convert"}
                </Btn>
                {c.zipUrl && <a href={c.zipUrl} download className="flex items-center gap-1.5 rounded-xl border border-ok/50 bg-ok/10 px-3.5 py-2 text-[13px] font-medium text-ok hover:bg-ok/20"><Download size={14} /> All as ZIP</a>}
              </header>
              <ul className="divide-y divide-line border-t border-line">{c.items.map((it) => <Row key={it.id} it={it} c={c} />)}</ul>
            </section>
          )}
        </div>
      </div>
    </ToolFrame>
  );
}
