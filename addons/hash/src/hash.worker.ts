// Hashing runs here so the page stays responsive; the page cancels by terminating the worker.
import { hashBlob, hashBytes, type Job, type Results } from "./lib/engine";

export type WorkerRequest = { source: Blob | Uint8Array; job: Job };
export type WorkerReply = { type: "progress"; fraction: number } | { type: "done"; results: Results } | { type: "error"; message: string };

const ctx = self as unknown as { onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null; postMessage(m: WorkerReply): void };

ctx.onmessage = async (e) => {
  const { source, job } = e.data;
  let last = 0;
  const progress = (fraction: number) => {
    const now = performance.now();
    if (now - last < 100) return;
    last = now;
    ctx.postMessage({ type: "progress", fraction });
  };
  try {
    const results = source instanceof Blob ? await hashBlob(source, job, progress) : await hashBytes(source, job, progress);
    ctx.postMessage({ type: "done", results });
  } catch (err) {
    ctx.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
