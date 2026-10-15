import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AddonManifest, AddonRequest, AddonStatus, Handler, ServerClient, ServerContext, ServerModule } from "@jimkit/sdk";
import { matchPattern, resolveSettings } from "@jimkit/sdk/server";
import { serverLoaders } from "@/generated/addons.server";
import manifestsJson from "@/generated/manifests.json";
import { config } from "./config";
import { kitManifests, kitServerFile } from "./store/kits";
import { importKitServer } from "./store/runtime";
import { identify } from "./client";
import { json, sameOrigin } from "./http";
import { TIER_RANK } from "./limits";
import { queue } from "./queue";
import { addDaily, canUseDaily, dailyUsed } from "./quota";
import { bytesHeldBy, openCollection, recordsReady } from "./records";

/** Every addon built into this install, enabled or not. */
export const builtIn: AddonManifest[] = manifestsJson as AddonManifest[];

/** Built-in addons plus the kits installed from GitHub, enabled or not. */
export const allManifests = (): AddonManifest[] => [...builtIn, ...kitManifests()];

export function enabledManifests(): AddonManifest[] {
  const off = new Set(config().disabledAddons);
  return allManifests().filter((m) => !off.has(m.id));
}

/** How to load an addon's server module: from the build for a built-in one, from the data directory for an installed kit. */
function serverLoader(id: string): (() => Promise<ServerModule>) | undefined {
  const built = serverLoaders[id];
  if (built) return async () => (await built()).default;
  const kit = kitServerFile(id);
  return kit ? () => importKitServer(kit) : undefined;
}
export const hasServer = (id: string) => !!serverLoader(id);

/** Forget a loaded addon, so the next request loads it again (after an update) or finds it gone (after a removal). */
export const forgetAddon = (id: string) => { loaded.delete(id); };

export const isEnabled = (id: string) => enabledManifests().some((m) => m.id === id);

export function reply(client: ServerClient, data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");
  if (client.setCookie) headers.append("Set-Cookie", client.setCookie);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export const fail = (client: ServerClient, status: number, message: string, extra: Record<string, unknown> = {}) => reply(client, { error: message, ...extra }, { status });

interface Loaded {
  mod: ServerModule;
  ctx: ServerContext;
  status: AddonStatus;
  routes: { method: string; pattern: string; handler: Handler; minTier: keyof typeof TIER_RANK }[];
}

const g = globalThis as unknown as { __jkAddons?: Map<string, Promise<Loaded>> };
const loaded = (g.__jkAddons ??= new Map());

/** `config` and `retentionMs` are getters: a Settings save replaces the config object, and a captured copy would go stale. */
export function contextFor(id: string): ServerContext {
  const cfg = config();
  const dataDir = join(cfg.dataDir, "addons", id, "files");
  const prefix = `[${id}]`;
  return {
    addon: id,
    dataDir,
    get config() {
      const stored = config().addonConfig[id] ?? {};
      return { ...stored, ...resolveSettings(allManifests().find((m) => m.id === id)?.settings, stored) };
    },
    get retentionMs() { return config().retentionMs; },
    records: (name, opts) => openCollection(id, name, opts?.isBusy as never),
    queue,
    bytesHeldBy,
    daily: { used: (ip) => dailyUsed(ip), canUse: (ip, b, l) => canUseDaily(ip, b, l), add: (ip, b) => addDaily(ip, b) },
    engineThreads: cfg.engineThreads,
    ready: recordsReady,
    log: { info: (...a) => console.log(prefix, ...a), warn: (...a) => console.warn(prefix, ...a), error: (...a) => console.error(prefix, ...a) },
    reply,
    fail,
  };
}

/** Loads an addon's server module once: builds its context, runs onStart, indexes its routes. */
export function loadAddon(id: string): Promise<Loaded> {
  let p = loaded.get(id);
  if (!p) {
    p = (async () => {
      const loader = serverLoader(id);
      if (!loader) throw new Error(`addon "${id}" has no server module`);
      const mod = await loader();
      const ctx = contextFor(id);
      await mkdir(ctx.dataDir, { recursive: true });
      await mod.onStart?.(ctx);
      await recordsReady();
      let status: AddonStatus = { ok: true };
      try {
        status = (await mod.check?.(ctx)) ?? status;
      } catch (e) {
        status = { ok: false, reason: `Its start-up check failed: ${e instanceof Error ? e.message : e}` };
      }
      if (!status.ok) ctx.log.warn(`unavailable: ${status.reason}`);
      const routes = Object.entries(mod.routes).map(([key, def]) => {
        const [method, ...rest] = key.split(" ");
        const handler = typeof def === "function" ? def : def.handler;
        return { method: method.toUpperCase(), pattern: rest.join(" "), handler, minTier: (typeof def === "function" ? "public" : def.minTier ?? "public") as keyof typeof TIER_RANK };
      });
      return { mod, ctx, routes, status };
    })();
    loaded.set(id, p);
    p.catch(() => loaded.delete(id)); // a failed start can be retried
  }
  return p;
}

/** What each enabled addon says about itself: working, working with a limitation, or unable to run here. */
export async function addonStatuses(): Promise<Record<string, AddonStatus>> {
  const out: Record<string, AddonStatus> = {};
  for (const m of enabledManifests()) {
    if (!hasServer(m.id)) { out[m.id] = { ok: true }; continue; }
    try { out[m.id] = (await loadAddon(m.id)).status; } catch { out[m.id] = { ok: false, reason: "It failed to start. See the server log." }; }
  }
  return out;
}

/** Start every enabled addon that has a server, at boot, so uploads and jobs from before a restart are loaded. */
export async function startAddons(): Promise<void> {
  for (const m of enabledManifests()) {
    if (!hasServer(m.id)) continue;
    try {
      await loadAddon(m.id);
    } catch (e) {
      console.error(`addon ${m.id} failed to start:`, e);
    }
  }
}

/** The /api/a/<addon>/<path> dispatcher. */
export async function dispatch(req: Request, addon: string, path: string[]): Promise<Response> {
  const client = identify(req);
  if (!isEnabled(addon) || !hasServer(addon)) return fail(client, 404, "No such addon.");
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !sameOrigin(req, config().proxyHops)) return fail(client, 403, "Bad origin.");

  let l: Loaded;
  try {
    l = await loadAddon(addon);
  } catch (e) {
    console.error(`addon ${addon}:`, e);
    return fail(client, 500, "This addon failed to start.");
  }
  const sub = path.join("/");
  // HEAD is answered by the GET route (same status and headers, no body) unless the addon defines its own HEAD
  const find = (m: string) => {
    for (const r of l.routes) {
      const params = r.method === m ? matchPattern(r.pattern, sub) : null;
      if (params) return { r, params };
    }
    return null;
  };
  const hit = find(method) ?? (method === "HEAD" ? find("GET") : null);
  if (hit) {
    const { r, params } = hit;
    if (TIER_RANK[client.tier] < TIER_RANK[r.minTier]) return fail(client, 403, r.minTier === "unlocked" ? "This needs the unlock code." : "This is only available on your own network.");
    const areq: AddonRequest = { req, url: new URL(req.url), client, params };
    try {
      let res = await r.handler(areq, l.ctx);
      if (method === "HEAD" && r.method === "GET") {
        void res.body?.cancel();
        res = new Response(null, { status: res.status, statusText: res.statusText, headers: res.headers });
      }
      if (client.setCookie && !res.headers.has("set-cookie")) {
        const headers = new Headers(res.headers);
        headers.append("Set-Cookie", client.setCookie);
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      }
      return res;
    } catch (e) {
      console.error(`addon ${addon} ${method} /${sub}:`, e);
      return fail(client, 500, "Something went wrong.");
    }
  }
  return json({ error: "Not found." }, { status: 404 });
}
