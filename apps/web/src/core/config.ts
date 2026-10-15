import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Limits, Tier } from "@jimkit/sdk";
import { mergeLimits, type LimitsInput } from "./limits";
import { isAccent } from "@/ui/accent";
import { parseCidrs, type Cidr } from "./net";

/**
 * Settings come from two places. Secrets and deployment facts are environment variables (docs/configuration.md); everything a
 * person might change from the Settings page lives in DATA_DIR/jimkit.config.json, so it survives upgrades and needs no restart.
 */
export interface FileConfig {
  siteName?: string;
  /** default look for visitors who haven't chosen one: basic | paper | glass | metro */
  theme?: string;
  /** dark | light */
  mode?: string;
  /** a preset name, or a colour as "hex-rrggbb" */
  accent?: string;
  /** addons to switch off without rebuilding */
  disabledAddons?: string[];
  /** CIDRs treated as "your network" */
  trustedCidrs?: string[];
  allowedHosts?: string[];
  limits?: Partial<Record<Tier, LimitsInput>>;
  /** per-addon settings, handed to the addon as ctx.config */
  addonConfig?: Record<string, Record<string, unknown>>;
}

export interface Config {
  dataDir: string;
  siteName: string;
  theme: string;
  mode: string;
  accent: string;
  disabledAddons: string[];
  trusted: Cidr[];
  /** names this instance answers to (JIMKIT_ALLOWED_HOSTS); empty means the default rule in net.ts hostAllowed */
  allowedHosts: string[];
  /** reverse proxies in front of Jimkit (0 = none, the TCP peer is the client) */
  proxyHops: number;
  unlockEnabled: boolean;
  sessionSecret: string;
  codeHash: string | undefined;
  ttlMs: number;
  limits: Record<Tier, Limits>;
  addonConfig: Record<string, Record<string, unknown>>;
  retentionMs: number;
  scratchCapBytes: number;
  globalConcurrency: number;
  engineThreads: number;
}

/** The themes that ship with Jimkit: Basic is part of the core, the others are theme kits that come with the image and can be switched off. */
export const THEMES = ["basic", "paper", "glass", "metro"] as const;
export const MODES = ["dark", "light"] as const;

/** Whatever a cookie or the config file holds, made into a look that exists. "light" used to be a theme of its own. */
export function normalizeLook(theme: string | undefined, mode: string | undefined, accent: string | undefined, fallback = { theme: "basic", mode: "dark", accent: "blue" }, available: readonly string[] | ((id: string) => boolean) = THEMES) {
  const legacyLight = theme === "light";
  // a theme that is not installed, or is switched off, is the same as none chosen: the install's default, and Basic if even that is gone
  const ok = (t: string | undefined) => !!t && (typeof available === "function" ? available(t) : available.includes(t));
  const t = legacyLight ? "basic" : ok(theme) ? theme! : ok(fallback.theme) ? fallback.theme : "basic";
  const m = (MODES as readonly string[]).includes(mode ?? "") ? mode! : legacyLight ? "light" : fallback.mode;
  return { theme: t, mode: m, accent: isAccent(accent) ? accent : fallback.accent };
}

/** Private ranges plus Tailscale's. A fresh install on a home network recognises the home network. */
const DEFAULT_TRUSTED = "127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,100.64.0.0/10";

const GB = 1024 ** 3;
const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export const configPath = (dataDir: string) => join(dataDir, "jimkit.config.json");

export function readFileConfig(dataDir: string): FileConfig {
  try {
    const p = configPath(dataDir);
    if (!existsSync(p)) return {};
    const parsed: unknown = JSON.parse(readFileSync(p, "utf8"));
    // valid JSON that isn't an object (null, a list, a number) would blow up the field reads below
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as FileConfig) : {};
  } catch {
    return {};
  }
}

export function writeFileConfig(dataDir: string, cfg: FileConfig): void {
  mkdirSync(dataDir, { recursive: true });
  const tmp = `${configPath(dataDir)}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, configPath(dataDir));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const prod = env.NODE_ENV === "production";
  const dataDir = env.JIMKIT_DATA_DIR || (prod ? "/data" : join(process.cwd(), ".jimkit-data"));
  const file = readFileConfig(dataDir);
  const sessionSecret = env.JIMKIT_SESSION_SECRET ?? (prod ? "" : "dev-only-secret-not-for-production-use");
  const codeHash = env.JIMKIT_UNLOCK_HASH || undefined;
  const ttlMin = Number(env.JIMKIT_UNLOCK_TTL_MINUTES);
  const env_disabled = (env.JIMKIT_DISABLED_ADDONS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    dataDir,
    siteName: file.siteName || env.JIMKIT_SITE_NAME || "Jimkit",
    // which themes exist is only known once the addons are loaded (currentLook checks it); here an id that could be one will do
    ...normalizeLook(file.theme, file.mode, file.accent, undefined, (id) => /^[a-z][a-z0-9-]{1,24}$/.test(id)),
    disabledAddons: [...new Set([...(Array.isArray(file.disabledAddons) ? file.disabledAddons : []), ...env_disabled])],
    trusted: parseCidrs(file.trustedCidrs?.length ? file.trustedCidrs : env.JIMKIT_TRUSTED_CIDRS || DEFAULT_TRUSTED),
    allowedHosts: (Array.isArray(file.allowedHosts) && file.allowedHosts.length ? file.allowedHosts : (env.JIMKIT_ALLOWED_HOSTS ?? "").split(/[\s,]+/)).map((h) => String(h).trim().toLowerCase().replace(/\.$/, "")).filter(Boolean),
    proxyHops: Math.max(0, Math.floor(Number(env.JIMKIT_PROXY_HOPS ?? 0)) || 0),
    unlockEnabled: sessionSecret.length >= 32 && !!codeHash,
    sessionSecret,
    codeHash,
    ttlMs: (Number.isFinite(ttlMin) && ttlMin > 0 ? ttlMin : 60) * 60_000,
    limits: mergeLimits(file.limits),
    addonConfig: file.addonConfig ?? {},
    retentionMs: num(env.JIMKIT_RETENTION_HOURS, 6) * 3_600_000,
    scratchCapBytes: num(env.JIMKIT_SCRATCH_CAP_GB, 30) * GB,
    globalConcurrency: num(env.JIMKIT_GLOBAL_JOBS, 2),
    engineThreads: num(env.JIMKIT_ENGINE_THREADS, 3),
  };
}

/** One config per process, re-read when the Settings page saves. */
const g = globalThis as unknown as { __jkConfig?: Config };
export function config(): Config {
  return (g.__jkConfig ??= loadConfig());
}
export function reloadConfig(): Config {
  return (g.__jkConfig = loadConfig());
}
