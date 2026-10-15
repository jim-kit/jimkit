/**
 * Test helpers for addon server code: a stand-in for the host's ServerContext and a way to call a route handler without
 * starting Jimkit. Records live in memory, the queue runs tasks inline, nothing is limited unless you ask. See docs/addons.md.
 *
 *   const t = createTestContext();
 *   const res = await callRoute(server, t, "POST", "items", { json: { name: "x" }, tier: "trusted" });
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseRecord, Handler, Limits, Queue, Records, ServerClient, ServerContext, ServerModule, SettingDef, Tier } from "./index";
import { matchPattern } from "./server";
import { resolveSettings } from "./settings";

const GB = 1024 ** 3;
/** The host's default limits per tier (apps/web/src/core/limits.ts), for tests that look at client.limits. */
export const TEST_LIMITS: Record<Tier, Limits> = {
  trusted: { maxFileBytes: 5 * GB, maxBatchBytes: 10 * GB, maxFiles: 50, concurrentJobs: 2, jobTimeoutSec: 7200, dailyBytes: null, bandwidthMbit: null },
  unlocked: { maxFileBytes: 5 * GB, maxBatchBytes: 10 * GB, maxFiles: 50, concurrentJobs: 2, jobTimeoutSec: 7200, dailyBytes: null, bandwidthMbit: 30 },
  public: { maxFileBytes: 2 * GB, maxBatchBytes: 4 * GB, maxFiles: 20, concurrentJobs: 1, jobTimeoutSec: 1800, dailyBytes: 10 * GB, bandwidthMbit: 30 },
};
const RANK: Record<Tier, number> = { public: 0, unlocked: 1, trusted: 2 };

export interface LogEntry { level: "info" | "warn" | "error"; args: unknown[] }

export interface TestContext extends ServerContext {
  /** everything the addon logged */
  logs: LogEntry[];
  /** remove the temporary data directory */
  cleanup(): void;
}

export interface TestContextOptions {
  /** the addon id (default "test") */
  addon?: string;
  /** stored settings, as in addonConfig[<addon id>] */
  config?: Record<string, unknown>;
  /** the manifest's `settings`: when given, defaults are filled into ctx.config as the host does */
  settings?: SettingDef[];
  retentionMs?: number;
  engineThreads?: number;
}

export function createTestContext(opts: TestContextOptions = {}): TestContext {
  const addon = opts.addon ?? "test";
  const dataDir = mkdtempSync(join(tmpdir(), `jimkit-${addon}-`));
  const logs: LogEntry[] = [];
  const log = (level: LogEntry["level"]) => (...args: unknown[]) => void logs.push({ level, args });
  const collections = new Map<string, Map<string, BaseRecord>>();
  const used = new Map<string, number>();

  const records = <T extends BaseRecord>(name: string): Records<T> => {
    let map = collections.get(name);
    if (!map) collections.set(name, (map = new Map()));
    const m = map as unknown as Map<string, T>;
    const dir = (id: string) => {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("bad record id");
      return join(dataDir, name, id);
    };
    return {
      get: (id) => m.get(id),
      all: () => [...m.values()],
      async put(rec) { mkdirSync(dir(rec.id), { recursive: true }); m.set(rec.id, rec); },
      touch(rec) { m.set(rec.id, rec); },
      async remove(id) { m.delete(id); rmSync(dir(id), { recursive: true, force: true }); },
      dir,
    };
  };

  // runs tasks right away, one call at a time per caller; per-key limits and the global limit are not simulated
  const running = new Map<string, AbortController>();
  const queue: Queue = {
    async submit(task) {
      const ctl = new AbortController();
      running.set(task.id, ctl);
      try { await task.run(ctl.signal); } finally { running.delete(task.id); }
    },
    cancel: (id) => running.get(id)?.abort(),
    position: () => null,
    running: () => running.size,
    runningFor: () => running.size,
  };

  const reply: ServerContext["reply"] = (client, data, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Content-Type", "application/json");
    if (client.setCookie) headers.append("Set-Cookie", client.setCookie);
    return new Response(JSON.stringify(data), { ...init, headers });
  };

  return {
    addon,
    dataDir,
    config: { ...opts.config, ...resolveSettings(opts.settings, opts.config) },
    retentionMs: opts.retentionMs ?? 6 * 3_600_000,
    engineThreads: opts.engineThreads ?? 1,
    records,
    queue,
    bytesHeldBy: (ip) => [...collections.values()].flatMap((m) => [...m.values()]).filter((r) => r.ip === ip).reduce((n, r) => n + (r.bytes ?? 0), 0),
    daily: {
      used: (ip) => used.get(ip) ?? 0,
      canUse: (ip, bytes, limit) => limit === null || (used.get(ip) ?? 0) + bytes <= limit,
      add: (ip, bytes) => void used.set(ip, (used.get(ip) ?? 0) + bytes),
    },
    ready: async () => {},
    log: { info: log("info"), warn: log("warn"), error: log("error") },
    reply,
    fail: (client, status, message, extra = {}) => reply(client, { error: message, ...extra }, { status }),
    logs,
    cleanup: () => rmSync(dataDir, { recursive: true, force: true }),
  };
}

export interface CallOptions {
  /** default "public" */
  tier?: Tier;
  /** default 203.0.113.7 */
  ip?: string;
  /** the client's cookie id (default: a fixed one) */
  clientId?: string;
  /** replace parts of the client, e.g. { limits: { ...TEST_LIMITS.public, maxFiles: 1 } } */
  client?: Partial<ServerClient>;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  /** sent as JSON with the matching Content-Type */
  json?: unknown;
  /** sent as is (a string, bytes, a stream, FormData) */
  body?: BodyInit;
}

/**
 * Calls a route as the host would: finds it by method and path, refuses a client below the route's `minTier`, then runs the
 * handler with a request, client and params. HEAD falls back to the GET route and drops the body. Not simulated: the same-origin
 * check, the Set-Cookie the host adds, and turning a thrown error into a 500 (a throw reaches your test).
 */
export async function callRoute(server: ServerModule, ctx: ServerContext, method: string, path: string, opts: CallOptions = {}): Promise<Response> {
  const tier = opts.tier ?? "public";
  const client: ServerClient = { id: opts.clientId ?? "0".repeat(32), ip: opts.ip ?? "203.0.113.7", tier, limits: TEST_LIMITS[tier], expiresAt: null, ...opts.client };
  const m = method.toUpperCase();
  const [pathname, search = ""] = path.split("?");
  const sub = pathname.replace(/^\/+/, "");
  const find = (want: string) => {
    for (const [key, def] of Object.entries(server.routes)) {
      const [verb, ...rest] = key.split(" ");
      const params = verb.toUpperCase() === want ? matchPattern(rest.join(" "), sub) : null;
      if (params) return { params, handler: (typeof def === "function" ? def : def.handler) as Handler, minTier: typeof def === "function" ? "public" : def.minTier ?? "public" };
    }
    return null;
  };
  const hit = find(m) ?? (m === "HEAD" ? find("GET") : null);
  if (!hit) return ctx.fail(client, 404, "Not found.");
  if (RANK[tier] < RANK[hit.minTier as Tier]) return ctx.fail(client, 403, hit.minTier === "unlocked" ? "This needs the unlock code." : "This is only available on your own network.");

  const url = new URL(`http://jimkit.test/api/a/${ctx.addon}/${sub}`);
  url.search = search;
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const headers = new Headers(opts.headers);
  let body = opts.body;
  if (opts.json !== undefined) { body = JSON.stringify(opts.json); if (!headers.has("content-type")) headers.set("content-type", "application/json"); }
  const req = new Request(url, { method: m === "HEAD" ? "GET" : m, headers, body: m === "GET" || m === "HEAD" ? undefined : body, ...(body ? { duplex: "half" } : {}) } as RequestInit);
  const res = await hit.handler({ req, url, client, params: hit.params }, ctx);
  if (m === "HEAD" && find("HEAD") === null) {
    void res.body?.cancel();
    return new Response(null, { status: res.status, statusText: res.statusText, headers: res.headers });
  }
  return res;
}
