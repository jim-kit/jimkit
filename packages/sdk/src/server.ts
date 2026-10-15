/** Server-only helpers for addons: running engines safely, shaping a stream, naming downloads. */
import { spawn } from "node:child_process";
import { Transform, type TransformCallback } from "node:stream";

export { resolveSettings, settingOptions, validateSettings, type SettingsCheck } from "./settings";

export interface ExecOptions {
  cwd: string;
  /** milliseconds */
  timeoutMs: number;
  onStdout?: (chunk: string) => void;
  env?: Record<string, string>;
  signal?: AbortSignal;
}

export class ExecError extends Error {
  constructor(message: string, readonly detail: string) {
    super(message);
  }
}

const SAFE_ENV = { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" };

/**
 * Runs one external program. No shell, a minimal environment, its own process group so a timeout takes its children
 * with it, and only the tail of stderr is kept (engines can be very chatty).
 */
export function run(cmd: string, args: string[], opts: ExecOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...SAFE_ENV, HOME: opts.cwd, TMPDIR: opts.cwd, ...opts.env } as unknown as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let err = "";
    let timedOut = false;
    const killGroup = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, opts.timeoutMs);
    // once the child is gone its group id could be handed to someone else, so stop listening
    const settle = () => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", killGroup);
    };
    if (opts.signal?.aborted) killGroup();
    else opts.signal?.addEventListener("abort", killGroup, { once: true });

    child.stdout.on("data", (d: Buffer) => opts.onStdout?.(d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => {
      err = (err + d.toString("utf8")).slice(-4000);
    });
    child.on("error", (e) => {
      settle();
      reject(new ExecError(`Could not start ${cmd}`, String(e)));
    });
    child.on("close", (code, sig) => {
      settle();
      if (timedOut) return reject(new ExecError("The conversion took too long and was stopped.", err));
      if (opts.signal?.aborted) return reject(new ExecError("Cancelled.", err));
      if (code === 0) return resolve();
      reject(new ExecError(`${cmd} failed (${sig ?? code})`, err));
    });
  });
}

/** Limits a stream to about `mbit` megabits per second with a one-second burst. Null means no limit. */
export function throttle(mbit: number | null): Transform | null {
  if (mbit === null) return null;
  const bytesPerSec = (mbit * 1_000_000) / 8;
  let tokens = bytesPerSec;
  let last = Date.now();
  return new Transform({
    transform(chunk: Buffer, _enc: string, cb: TransformCallback) {
      const now = Date.now();
      tokens = Math.min(bytesPerSec, tokens + ((now - last) / 1000) * bytesPerSec);
      last = now;
      tokens -= chunk.length;
      if (tokens >= 0) return cb(null, chunk);
      setTimeout(() => cb(null, chunk), Math.ceil((-tokens / bytesPerSec) * 1000));
    },
  });
}

/** A download name from a user's file name: no paths, no odd characters, bounded length. */
export function safeBase(name: string): string {
  const base = name.replace(/\.[^.]*$/, "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").trim();
  // cut by characters, not UTF-16 units: half of an emoji is not a valid name (and makes encodeURIComponent throw in the download header)
  return (Array.from((base || "file").toWellFormed()).slice(0, 120).join("") || "file");
}

/** Matches "jobs/:id/download" style patterns. Returns the captured params or null. */
export function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) {
      try {
        params[p[i].slice(1)] = decodeURIComponent(s[i]);
      } catch {
        return null;
      }
    } else if (p[i] !== s[i]) return null;
  }
  return params;
}
