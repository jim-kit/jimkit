import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseRecord } from "@jimkit/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, reloadConfig, writeFileConfig } from "@/core/config";
import { DEFAULT_LIMITS, mergeLimits } from "@/core/limits";
import { _resetQueue, queue } from "@/core/queue";
import { addDaily, canUseDaily, dailyUsed, _resetQuota } from "@/core/quota";
import { _resetRecords, bytesHeldBy, openCollection, recordsReady, sweep, totalBytes } from "@/core/records";
import { matchPattern } from "@jimkit/sdk/server";

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jimkit-test-"));
  process.env.JIMKIT_DATA_DIR = dir;
  _resetRecords();
  _resetQueue();
  _resetQuota();
  reloadConfig();
});
afterEach(() => {
  delete process.env.JIMKIT_DATA_DIR;
  delete process.env.JIMKIT_RETENTION_HOURS;
  delete process.env.JIMKIT_SCRATCH_CAP_GB;
  rmSync(dir, { recursive: true, force: true });
});

interface Rec extends BaseRecord { note: string }
const rec = (id: string, over: Partial<Rec> = {}): Rec => ({ id, clientId: "c", ip: "1.1.1.1", created: Date.now(), bytes: 0, note: "", ...over });

describe("config", () => {
  it("defaults are safe: no proxy, private ranges trusted, unlock off without a secret and hash", () => {
    const c = loadConfig({ NODE_ENV: "production", JIMKIT_DATA_DIR: dir } as NodeJS.ProcessEnv);
    expect(c.proxyHops).toBe(0);
    expect(c.unlockEnabled).toBe(false);
    expect(c.theme).toBe("basic");
    expect(c.trusted.length).toBeGreaterThan(3);
  });
  it("reads the settings file and lets env disable addons too", () => {
    writeFileConfig(dir, { theme: "glass", accent: "teal", disabledAddons: ["convert"], siteName: "My Kit" });
    const c = loadConfig({ NODE_ENV: "production", JIMKIT_DATA_DIR: dir, JIMKIT_DISABLED_ADDONS: "hash" } as NodeJS.ProcessEnv);
    expect(c.theme).toBe("glass");
    expect(c.accent).toBe("teal");
    expect(c.siteName).toBe("My Kit");
    expect(c.disabledAddons.sort()).toEqual(["convert", "hash"]);
  });
  it("a settings file that is JSON but not a settings object doesn't take the app down", () => {
    const env = { NODE_ENV: "production", JIMKIT_DATA_DIR: dir } as NodeJS.ProcessEnv;
    for (const text of ["null", "[]", "42", '{"disabledAddons": 5, "limits": "x"}']) {
      writeFileSync(join(dir, "jimkit.config.json"), text);
      const c = loadConfig(env);
      expect(c.disabledAddons).toEqual([]);
      expect(c.theme).toBe("basic");
    }
  });
  it("ignores unknown themes and bad limit overrides", () => {
    writeFileConfig(dir, { theme: "Not a theme!" });
    expect(loadConfig({ NODE_ENV: "production", JIMKIT_DATA_DIR: dir } as NodeJS.ProcessEnv).theme).toBe("basic");
    // a well-formed id may be a theme some kit brings: whether it exists is decided where the addons are known (normalizeLook, currentLook)
    writeFileConfig(dir, { theme: "dusk" });
    expect(loadConfig({ NODE_ENV: "production", JIMKIT_DATA_DIR: dir } as NodeJS.ProcessEnv).theme).toBe("dusk");
    const L = mergeLimits({ public: { maxFileBytes: -5, maxFiles: 3, dailyBytes: null } as never });
    expect(L.public.maxFileBytes).toBe(DEFAULT_LIMITS.public.maxFileBytes);
    expect(L.public.maxFiles).toBe(3);
    expect(L.public.dailyBytes).toBeNull();
  });
});

describe("records", () => {
  it("persist across a restart and are indexed per collection", async () => {
    const a = openCollection<Rec>("t", "things");
    await recordsReady();
    await a.put(rec("one", { note: "hello", bytes: 10 }));
    expect(a.get("one")?.note).toBe("hello");
    _resetRecords(); // a restart
    const b = openCollection<Rec>("t", "things");
    await recordsReady();
    expect(b.get("one")?.note).toBe("hello");
    await b.remove("one");
    expect(b.get("one")).toBeUndefined();
  });
  it("refuse ids that could escape the folder", async () => {
    const a = openCollection<Rec>("t", "things");
    await recordsReady();
    await expect(a.put(rec("../evil"))).rejects.toThrow();
    expect(() => a.dir("a/b")).toThrow();
  });
  it("writes to one record land in order, and a save can't bring back a record that was removed", async () => {
    const a = openCollection<Rec>("t", "things");
    await recordsReady();
    const file = () => join(a.dir("w"), "record.json");
    await Promise.all([a.put(rec("w", { note: "x".repeat(300_000) })), a.put(rec("w", { note: "last" }))]);
    expect(JSON.parse(readFileSync(file(), "utf8")).note).toBe("last");
    const late = a.put(rec("w", { note: "too late" }));
    await a.remove("w");
    await late;
    expect(a.get("w")).toBeUndefined();
    expect(existsSync(a.dir("w"))).toBe(false);
  });
  it("count bytes per address and in total", async () => {
    const a = openCollection<Rec>("t", "things");
    await recordsReady();
    await a.put(rec("a", { ip: "1.1.1.1", bytes: 100 }));
    await a.put(rec("b", { ip: "2.2.2.2", bytes: 50 }));
    expect(bytesHeldBy("1.1.1.1")).toBe(100);
    expect(totalBytes()).toBe(150);
  });
  it("the sweep drops expired records but never busy ones, and trims to the cap oldest first", async () => {
    process.env.JIMKIT_RETENTION_HOURS = "1";
    reloadConfig();
    const a = openCollection<Rec>("t", "things", (r) => r.note === "busy");
    await recordsReady();
    const old = Date.now() - 2 * 3_600_000;
    await a.put(rec("old", { created: old }));
    await a.put(rec("oldbusy", { created: old, note: "busy" }));
    await a.put(rec("fresh"));
    await sweep();
    expect(a.get("old")).toBeUndefined();
    expect(a.get("oldbusy")).toBeDefined();
    expect(a.get("fresh")).toBeDefined();

    process.env.JIMKIT_SCRATCH_CAP_GB = "0.000001"; // about 1 KB
    reloadConfig();
    await a.put(rec("big1", { bytes: 800, created: Date.now() - 5000 }));
    await a.put(rec("big2", { bytes: 800, created: Date.now() - 1000 }));
    await sweep();
    expect(a.get("big1")).toBeUndefined(); // the oldest goes first
  });
});

describe("queue", () => {
  it("runs at most GLOBAL_JOBS tasks at once and each key's own limit, in order", async () => {
    process.env.JIMKIT_GLOBAL_JOBS = "2";
    reloadConfig();
    let live = 0, peak = 0;
    const order: string[] = [];
    const gate: (() => void)[] = [];
    const task = (id: string, key: string) =>
      queue.submit({ id, key, perKey: 1, run: async () => { live++; peak = Math.max(peak, live); order.push(id); await new Promise<void>((r) => gate.push(r)); live--; } });
    const all = [task("a1", "A"), task("a2", "A"), task("b1", "B"), task("c1", "C")];
    await new Promise((r) => setTimeout(r, 20));
    expect(queue.running()).toBe(2);
    expect(order).toEqual(["a1", "b1"]); // a2 waits for a1 (per-key 1), c1 for a free slot
    expect(queue.position("a2")).toBe(1);
    gate.shift()!(); // a1 finishes: a2 may start
    await new Promise((r) => setTimeout(r, 20));
    expect(order).toContain("a2");
    while (gate.length || queue.running()) { gate.shift()?.(); await new Promise((r) => setTimeout(r, 10)); }
    await Promise.all(all);
    expect(peak).toBeLessThanOrEqual(2);
    delete process.env.JIMKIT_GLOBAL_JOBS;
  });
  it("a run() that throws straight away frees its slot", async () => {
    process.env.JIMKIT_GLOBAL_JOBS = "1";
    reloadConfig();
    const bad = queue.submit({ id: "bad", key: "K", perKey: 1, run: (() => { throw new Error("sync boom"); }) as never });
    await expect(bad).rejects.toThrow("sync boom");
    expect(queue.running()).toBe(0);
    let ran = false;
    await queue.submit({ id: "next", key: "K", perKey: 1, run: async () => { ran = true; } });
    expect(ran).toBe(true);
    delete process.env.JIMKIT_GLOBAL_JOBS;
  });
  it("cancelling a waiting task rejects it, cancelling a running one aborts its signal", async () => {
    process.env.JIMKIT_GLOBAL_JOBS = "1";
    reloadConfig();
    let aborted = false;
    const running = queue.submit({ id: "r", key: "k", perKey: 1, run: (signal) => new Promise<void>((res) => signal.addEventListener("abort", () => { aborted = true; res(); })) });
    const waiting = queue.submit({ id: "w", key: "k2", perKey: 1, run: async () => {} });
    await new Promise((r) => setTimeout(r, 10));
    queue.cancel("w");
    await expect(waiting).rejects.toThrow("Cancelled.");
    queue.cancel("r");
    await running;
    expect(aborted).toBe(true);
    delete process.env.JIMKIT_GLOBAL_JOBS;
  });
});

describe("daily quota", () => {
  it("counts per address per day and allows null (unlimited)", () => {
    expect(canUseDaily("1.1.1.1", 5, 10)).toBe(true);
    addDaily("1.1.1.1", 8);
    expect(dailyUsed("1.1.1.1")).toBe(8);
    expect(canUseDaily("1.1.1.1", 5, 10)).toBe(false);
    expect(canUseDaily("2.2.2.2", 5, 10)).toBe(true);
    expect(canUseDaily("1.1.1.1", 1e12, null)).toBe(true);
  });
});

describe("route patterns", () => {
  it("match :params and nothing else", () => {
    expect(matchPattern("jobs/:id/download", "jobs/abc/download")).toEqual({ id: "abc" });
    expect(matchPattern("jobs/zip", "jobs/zip")).toEqual({});
    expect(matchPattern("jobs/:id", "jobs/a%20b")).toEqual({ id: "a b" });
    expect(matchPattern("jobs/:id", "jobs/a/b")).toBeNull();
    expect(matchPattern("upload", "uploads")).toBeNull();
    expect(matchPattern("jobs/:id", "jobs/%E0%A4%A")).toBeNull(); // broken escape
  });
});
