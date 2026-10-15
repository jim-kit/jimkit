"use client";

import { Icon } from "@jimkit/ui";
import { FileUp, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileAction } from "@/lib/catalog";
import { offersFor } from "@/lib/offers";
import { nativeHash, sha256 } from "@/lib/sha256";

interface Dropped { name: string; size: number; type: string; sha?: string; skipped?: boolean }

const human = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`);
// the page reads the whole file into memory; the real tool streams it. Without crypto.subtle (plain http) hashing is slower, so the cap is lower.
const maxHash = () => (nativeHash() ? 256 : 24) * 1024 ** 2;

/** Drop a file anywhere on the page: it is hashed here and the tools Jimkit would offer for it are listed, by the app's own rules. */
export function DropZone({ actions }: { actions: FileAction[] }) {
  const [over, setOver] = useState(false);
  const [files, setFiles] = useState<Dropped[]>([]);
  const depth = useRef(0);

  const take = useCallback(async (list: File[]) => {
    const first = list.slice(0, 4);
    setFiles(first.map((f) => ({ name: f.name, size: f.size, type: f.type })));
    for (const [i, f] of first.entries()) {
      if (f.size > maxHash()) { setFiles((cur) => cur.map((c, k) => (k === i ? { ...c, skipped: true } : c))); continue; }
      const sha = await sha256(await f.arrayBuffer());
      setFiles((cur) => cur.map((c, k) => (k === i ? { ...c, sha } : c)));
    }
  }, []);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth.current++; setOver(true); } };
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth.current <= 0) { depth.current = 0; setOver(false); } };
    const overEv = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current = 0; setOver(false); void take([...(e.dataTransfer?.files ?? [])]); };
    const pick = (e: Event) => void take((e as CustomEvent<File[]>).detail);
    window.addEventListener("dragenter", enter); window.addEventListener("dragleave", leave); window.addEventListener("dragover", overEv); window.addEventListener("drop", drop);
    window.addEventListener("jk-files", pick);
    return () => { window.removeEventListener("dragenter", enter); window.removeEventListener("dragleave", leave); window.removeEventListener("dragover", overEv); window.removeEventListener("drop", drop); window.removeEventListener("jk-files", pick); };
  }, [take]);

  return (
    <>
      {over && (
        <div aria-hidden className="jk-fade pointer-events-none fixed inset-0 z-[80] grid place-items-center bg-bg/80 backdrop-blur-sm">
          <div className="m-6 grid place-items-center rounded-3xl border-2 border-dashed border-accent px-16 py-20 text-center">
            <FileUp size={46} className="text-accent" strokeWidth={1.4} />
            <p className="font-display mt-5 text-[clamp(1.6rem,4vw,2.6rem)]">Drop it.</p>
            <p className="font-mono-label mt-3 text-faint">The page hashes it and lists what Jimkit would offer.</p>
          </div>
        </div>
      )}
      {files.length > 0 && (
        <div className="jk-pop fixed bottom-5 right-5 z-[75] w-[min(440px,calc(100vw-2.5rem))] max-h-[80vh] overflow-y-auto rounded-2xl border border-line-strong bg-surface shadow-2xl" role="dialog" aria-label="What Jimkit would do with these files">
          <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-4 py-3"><span className="font-mono-label text-faint">What Jimkit would do</span><button onClick={() => setFiles([])} aria-label="Close" className="grid size-7 place-items-center rounded-md text-dim hover:bg-tint-2"><X size={16} /></button></div>
          <ul className="divide-y divide-line">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="p-4">
                <p className="truncate text-[15px] font-semibold">{f.name}</p>
                <p className="font-mono-label mt-1 text-faint">{human(f.size)} · {f.type || "unknown type"}</p>
                <p className="mt-2 break-all font-mono text-[11.5px] leading-relaxed text-dim">{f.skipped ? "Too big for the page to hash. The real hash tool streams files of any size." : f.sha ? <><span className="text-faint">sha-256 </span>{f.sha}</> : "hashing…"}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {offersFor(f, actions).map((a) => <span key={a.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-tint px-2.5 py-1.5 text-[12.5px]"><Icon name={a.icon} size={14} /> {a.label}</span>)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
