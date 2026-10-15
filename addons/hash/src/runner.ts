import { hashBlob, hashBytes, type Job, type Results } from "./lib/engine";
import type { WorkerReply } from "./hash.worker";

export class Cancelled extends Error {
  constructor() { super("Cancelled"); }
}

export interface Run { promise: Promise<Results>; cancel(): void }

/** Hash in a worker. If the browser won't start one, fall back to the page itself (it can't be cancelled there, but it still works). */
export function startHash(source: Blob | Uint8Array, job: Job, onProgress: (fraction: number) => void): Run {
  let worker: Worker | null = null;
  try { worker = new Worker(new URL("./hash.worker.ts", import.meta.url), { type: "module" }); } catch { worker = null; }
  if (!worker) {
    let off = false;
    const promise = (source instanceof Blob ? hashBlob(source, job, onProgress) : hashBytes(source, job, onProgress)).then((r) => { if (off) throw new Cancelled(); return r; });
    return { promise, cancel: () => { off = true; } };
  }
  const w = worker;
  let fail: (e: Error) => void = () => {};
  const promise = new Promise<Results>((resolve, reject) => {
    fail = reject;
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      const m = e.data;
      if (m.type === "progress") onProgress(m.fraction);
      else { w.terminate(); if (m.type === "done") resolve(m.results); else reject(new Error(m.message)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "The hash worker failed")); };
    w.postMessage({ source, job });
  });
  return { promise, cancel: () => { w.terminate(); fail(new Cancelled()); } };
}
