"use client";

import { motion } from "@jimkit/ui/motion";
import { Check, Download, Forward, LoaderCircle, Link, Unlink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@jimkit/ui";
import { formatBytes } from "@jimkit/ui";
import { haptic } from "@jimkit/ui";
import { estimateBytes, limitsFor, planExport, presetSize } from "./lib/editor/export-size";
import { sizeAfterEdit, type Size } from "./lib/editor/resize";
import type { ExportOptions } from "./lib/editor/render";
import { NumField, Slider, Toggle } from "./controls";
import type { ImageEditor } from "./useImageEditor";

type Type = ExportOptions["type"];
export const FORMATS: { type: Type; label: string; ext: string; lossy: boolean }[] = [
  { type: "image/png", label: "PNG", ext: "png", lossy: false },
  { type: "image/jpeg", label: "JPEG", ext: "jpg", lossy: true },
  { type: "image/webp", label: "WebP", ext: "webp", lossy: true },
  { type: "image/avif", label: "AVIF", ext: "avif", lossy: true },
];
const PRESETS = [25, 50, 100, 200];

const baseName = (name: string) => name.replace(/\.[^.]*$/, "") || "image";

/** Which of these this browser can really encode. A browser that can't quietly hands back a PNG, so ask it. */
function useEncoders(): Set<Type> {
  const [ok, setOk] = useState<Set<Type>>(() => new Set<Type>(["image/png", "image/jpeg"]));
  useEffect(() => {
    let dead = false;
    const c = document.createElement("canvas");
    c.width = c.height = 2;
    c.getContext("2d")!.fillRect(0, 0, 2, 2);
    for (const t of ["image/webp", "image/avif"] as const) {
      c.toBlob((b) => { if (!dead && b?.type === t) setOk((s) => new Set(s).add(t)); }, t);
    }
    return () => { dead = true; };
  }, []);
  return ok;
}

/** Export settings and the two ways out: download it, or send it on to the converter. */
export function ExportPanel({ ed, file, onApply, big, onDone }: { ed: ImageEditor; file: File; onApply?: (f: File) => void; big?: boolean; onDone: () => void }) {
  const encoders = useEncoders();
  const formats = FORMATS.filter((f) => encoders.has(f.type));
  const [fmt, setFmt] = useState(FORMATS[1]);
  const [quality, setQuality] = useState(90);
  const o = ed.outputSize;
  const [size, setSize] = useState<Size>({ w: Math.round(o.w), h: Math.round(o.h) });
  const [lock, setLock] = useState(true);
  const ratio = useRef(o.w / o.h);
  // the picture can still be cropped or turned while this is open: the size to export follows it, and a result for the old size is stale
  useEffect(() => { setSize({ w: Math.round(o.w), h: Math.round(o.h) }); ratio.current = o.w / o.h; setResult(null); }, [o.w, o.h]);
  const [busy, setBusy] = useState<"download" | "apply" | null>(null);
  const [result, setResult] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null);

  const limits = useMemo(() => limitsFor({ userAgent: navigator.userAgent, coarsePointer: matchMedia("(pointer: coarse)").matches }), []);
  const plan = useMemo(() => planExport(size, { w: ed.work.w * (size.w / o.w), h: ed.work.h * (size.h / o.h) }, limits), [size, ed.work.w, ed.work.h, o.w, o.h, limits]);

  const pick = (s: Size) => { setSize(s); setResult(null); };
  const edit = (side: "w" | "h", v: number) => pick(sizeAfterEdit(side, v, size, lock, ratio.current));
  const longest = Math.max(size.w, size.h);

  const opts = (): ExportOptions => ({ type: fmt.type, quality: quality / 100, width: size.w, height: size.h });

  // a small sample, encoded at the same pixel density, says roughly how big the file will be
  useEffect(() => {
    setEstimate(null);
    if (!plan.ok) return;
    let dead = false;
    const t = setTimeout(() => {
      ed.sampleAs({ type: fmt.type, quality: quality / 100, width: size.w, height: size.h }).then(
        (r) => !dead && setEstimate(estimateBytes(r.bytes, r.pixels, size.w * size.h)),
        () => {},
      );
    }, 400);
    return () => { dead = true; clearTimeout(t); };
  }, [ed.state, fmt, quality, size, plan.ok]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(kind: "download" | "apply") {
    setBusy(kind);
    // let the spinner paint before the main thread is taken
    await new Promise((r) => setTimeout(r, 30));
    try {
      const blob = await ed.exportAs(opts());
      const name = `${baseName(file.name)}-edited.${fmt.ext}`;
      setResult(blob.size);
      if (kind === "download") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        haptic("success");
        toast.success("Saved", { description: `${name} · ${formatBytes(blob.size)}` });
      } else if (onApply) {
        onApply(new File([blob], name, { type: fmt.type }));
        haptic("success");
        toast.success("Sent to the converter");
        onDone();
      }
    } catch (e) {
      haptic("error");
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  const chip = big ? "h-12 rounded-2xl px-5 text-[15px]" : "rounded-lg px-3 py-1.5 text-[13px]";
  const heading = `mb-2 ${big ? "text-[12px]" : "text-[11px]"} font-semibold uppercase tracking-[.14em] text-faint`;
  const note = big ? "text-[14px]" : "text-[12px]";
  const mp = (size.w * size.h) / 1e6;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className={heading}>Format</p>
        <div className="flex flex-wrap gap-2">
          {formats.map((f) => (
            <motion.button key={f.type} whileTap={{ scale: 0.94 }} onClick={() => { haptic("select"); setFmt(f); setResult(null); }} aria-pressed={fmt.type === f.type}
              className={`flex items-center gap-1.5 border font-medium ${chip} ${fmt.type === f.type ? "border-transparent text-white" : "border-line bg-raised text-dim"}`}
              style={fmt.type === f.type ? { background: "var(--grad)" } : undefined}>
              {fmt.type === f.type && <Check size={big ? 16 : 13} />} {f.label}
            </motion.button>
          ))}
        </div>
      </div>
      {fmt.lossy && <Slider label="Quality" value={quality} min={40} max={100} neutral={90} onLive={(v) => { setQuality(v); setResult(null); }} onCommit={() => {}} size={big ? "lg" : "md"} format={(v) => `${v}%`} />}
      <div>
        <p className={heading}>Size</p>
        <div className="flex items-end gap-2">
          <NumField label="Width" value={size.w} min={1} max={65535} suffix="px" big={big} className="min-w-0 flex-1" onCommit={(v) => edit("w", v)} />
          <Toggle on={lock} onClick={() => { if (!lock) ratio.current = size.w / size.h; setLock(!lock); }} label={lock ? "Keep the shape" : "Free shape"} big={big}>
            {lock ? <Link size={big ? 18 : 14} /> : <Unlink size={big ? 18 : 14} />}
          </Toggle>
          <NumField label="Height" value={size.h} min={1} max={65535} suffix="px" big={big} className="min-w-0 flex-1" onCommit={(v) => edit("h", v)} />
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {PRESETS.map((p) => {
            const s = presetSize(o, { percent: p });
            const on = s.w === size.w && s.h === size.h;
            return <button key={p} onClick={() => { haptic("select"); pick(s); }} aria-pressed={on} className={`border ${chip} ${on ? "border-accent/50 bg-accent/15 text-accent" : "border-line bg-raised text-dim"}`}>{p}%</button>;
          })}
          <NumField label="Longest side" value={longest} min={1} max={65535} suffix="px" big={big} className="w-32" onCommit={(v) => pick(presetSize(size, { longest: v }))} />
        </div>
        <p className={`mt-3 ${note} tabular-nums text-faint`}>
          {size.w} × {size.h} px · {mp >= 0.1 ? `${mp.toFixed(1)} MP` : "under 0.1 MP"}
          {result ? ` · ${formatBytes(result)}` : estimate !== null ? ` · about ${formatBytes(estimate)}` : plan.ok ? " · estimating…" : ""}
        </p>
        {!plan.ok && (
          <div className={`mt-2 ${big ? "text-[14px]" : "text-[12px]"} text-warn`} role="alert">
            <p>{plan.message}</p>
            <button onClick={() => pick(plan.max)} className="mt-1.5 font-medium underline underline-offset-2">Use {plan.max.w} × {plan.max.h}</button>
          </div>
        )}
      </div>
      <div className={`flex ${big ? "flex-col" : "gap-2"}`}>
        <motion.button whileTap={{ scale: 0.97 }} disabled={!!busy || !plan.ok} onClick={() => run("download")}
          className={`flex items-center justify-center gap-2 font-semibold text-white disabled:opacity-50 ${big ? "h-14 w-full rounded-2xl text-[16px]" : "flex-1 rounded-xl py-2.5 text-[14px]"}`} data-primary="">
          {busy === "download" ? <LoaderCircle size={16} className="jk-spin" /> : <Download size={big ? 18 : 15} />} Download
        </motion.button>
        {onApply && (
          <motion.button whileTap={{ scale: 0.97 }} disabled={!!busy || !plan.ok} onClick={() => run("apply")}
            className={`flex items-center justify-center gap-2 border border-line-strong font-medium text-dim transition hover:bg-tint disabled:opacity-50 ${big ? "mt-2 h-14 w-full rounded-2xl text-[16px]" : "flex-1 rounded-xl py-2.5 text-[14px]"}`}>
            {busy === "apply" ? <LoaderCircle size={16} className="jk-spin" /> : <Forward size={big ? 18 : 15} />} Send to…
          </motion.button>
        )}
      </div>
    </div>
  );
}
