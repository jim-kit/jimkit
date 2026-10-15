import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ExecError, run } from "../src/server";

const cwd = mkdtempSync(join(tmpdir(), "jimkit-exec-"));

describe("run", () => {
  it("resolves on exit 0 and rejects with the tail of stderr otherwise", async () => {
    await run("sh", ["-c", "exit 0"], { cwd, timeoutMs: 5000 });
    const err = await run("sh", ["-c", "echo boom >&2; exit 3"], { cwd, timeoutMs: 5000 }).catch((e) => e);
    expect(err).toBeInstanceOf(ExecError);
    expect((err as ExecError).detail).toContain("boom");
  });
  it("kills the whole process group on timeout", async () => {
    const t0 = Date.now();
    const err = await run("sh", ["-c", "sleep 30 & sleep 30"], { cwd, timeoutMs: 200 }).catch((e) => e);
    expect((err as Error).message).toMatch(/too long/);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it("aborting kills a running child, and an already-aborted signal never lets it run", async () => {
    const ctl = new AbortController();
    const running = run("sleep", ["30"], { cwd, timeoutMs: 60_000, signal: ctl.signal }).catch((e) => e);
    setTimeout(() => ctl.abort(), 100);
    expect(((await running) as Error).message).toBe("Cancelled.");

    const t0 = Date.now();
    const gone = await run("sleep", ["30"], { cwd, timeoutMs: 60_000, signal: AbortSignal.abort() }).catch((e) => e);
    expect((gone as Error).message).toBe("Cancelled.");
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it("reports a failure without the machine's paths in the message, and keeps only the tail of stderr", async () => {
    const err = await run("sh", ["-c", "echo secret-path-/data/x >&2; exit 3"], { cwd, timeoutMs: 5000 }).catch((e) => e);
    expect(err).toBeInstanceOf(ExecError);
    expect(err.message).not.toContain("/data");
    expect(err.detail).toContain("/data"); // for the server log only
    const chatty = await run("sh", ["-c", "yes error-line | head -c 500000 >&2; exit 1"], { cwd, timeoutMs: 10_000 }).catch((e) => e);
    expect(chatty.detail.length).toBeLessThanOrEqual(4000);
  });
  it("starts the program with a minimal environment", async () => {
    process.env.JIMKIT_SESSION_SECRET = "must-not-leak";
    let out = "";
    await run("sh", ["-c", "env"], { cwd, timeoutMs: 5000, onStdout: (c) => (out += c) });
    delete process.env.JIMKIT_SESSION_SECRET;
    expect(out).not.toContain("must-not-leak");
    expect(out).toContain("PATH=");
  });
});
