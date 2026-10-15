import type { Queue } from "@jimkit/sdk";
import { config } from "./config";

interface Task {
  id: string;
  key: string;
  perKey: number;
  run(signal: AbortSignal): Promise<void>;
  created: number;
  resolve(): void;
  reject(e: unknown): void;
}

// One scheduler per process (same globalThis trick as the records).
const g = globalThis as unknown as { __jkq?: { waiting: Task[]; running: Map<string, { task: Task; ctl: AbortController }> } };
const state = (g.__jkq ??= { waiting: [] as Task[], running: new Map<string, { task: Task; ctl: AbortController }>() });

function runningFor(key: string): number {
  let n = 0;
  for (const { task } of state.running.values()) if (task.key === key) n++;
  return n;
}

/** Start waiting tasks, oldest first, while there is room globally and for each task's key. */
function pump(): void {
  const limit = config().globalConcurrency;
  while (state.running.size < limit) {
    const idx = state.waiting.findIndex((t) => runningFor(t.key) < t.perKey);
    if (idx < 0) return;
    const [task] = state.waiting.splice(idx, 1);
    const ctl = new AbortController();
    state.running.set(task.id, { task, ctl });
    // a run() that throws before returning a promise must not leave its slot taken
    new Promise<void>((res) => res(task.run(ctl.signal))).then(task.resolve, task.reject).finally(() => {
      state.running.delete(task.id);
      pump();
    });
  }
}

export const queue: Queue = {
  submit(t) {
    return new Promise<void>((resolve, reject) => {
      state.waiting.push({ ...t, created: Date.now(), resolve, reject });
      pump();
    });
  },
  cancel(id) {
    const i = state.waiting.findIndex((t) => t.id === id);
    if (i >= 0) {
      const [t] = state.waiting.splice(i, 1);
      t.reject(new Error("Cancelled."));
      return;
    }
    state.running.get(id)?.ctl.abort();
  },
  position(id) {
    const i = state.waiting.findIndex((t) => t.id === id);
    return i < 0 ? null : i + 1;
  },
  running: () => state.running.size,
  runningFor,
};

export function _resetQueue(): void {
  state.waiting.length = 0;
  state.running.clear();
}
