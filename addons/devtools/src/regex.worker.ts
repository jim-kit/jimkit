import { runRegex, type RegexRequest } from "./lib/regex";

// Runs off the main thread so a catastrophic pattern only freezes this worker, which the tool kills after a timeout.
const ctx = self as unknown as { onmessage: ((e: MessageEvent<RegexRequest & { id: number }>) => void) | null; postMessage(m: unknown): void };
ctx.onmessage = (e) => ctx.postMessage({ id: e.data.id, result: runRegex(e.data) });
