"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export { toast };

export async function copyText(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // the clipboard API needs https or localhost; fall back to a hidden textarea (the usual case on a plain-http LAN address)
    const before = document.activeElement as HTMLElement | null;
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    t.remove();
    before?.focus({ preventScroll: true });
    if (!ok) { toast.error("Couldn't copy"); return; }
  }
  toast.success(what);
}

export function downloadBlob(name: string, data: BlobPart, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** A hidden file input you open from code. */
export function useFilePicker(accept: string | undefined, onFile: (f: File) => void, multiple = false) {
  const ref = useRef<HTMLInputElement | null>(null);
  const cb = useRef(onFile);
  cb.current = onFile;
  const input = (
    <input ref={ref} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { Array.from(e.target.files ?? []).forEach((f) => cb.current(f)); e.target.value = ""; }} />
  );
  const open = useCallback(() => ref.current?.click(), []);
  return { input, open };
}

export function formatBytes(n: number, digits = 1): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(v >= 10 ? Math.min(digits, 1) : digits)} ${units[i]}`;
}

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
