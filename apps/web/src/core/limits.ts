import type { Limits, Tier } from "@jimkit/sdk";

const GB = 1024 ** 3;

const TRUSTED: Limits = {
  maxFileBytes: 5 * GB,
  maxBatchBytes: 10 * GB,
  maxFiles: 50,
  concurrentJobs: 2,
  jobTimeoutSec: 2 * 60 * 60,
  dailyBytes: null,
  bandwidthMbit: null,
};

export const DEFAULT_LIMITS: Record<Tier, Limits> = {
  trusted: TRUSTED,
  // same as trusted, but egress stays shaped so one big download can't starve everything else
  unlocked: { ...TRUSTED, bandwidthMbit: 30 },
  public: {
    maxFileBytes: 2 * GB,
    maxBatchBytes: 4 * GB,
    maxFiles: 20,
    concurrentJobs: 1,
    jobTimeoutSec: 30 * 60,
    dailyBytes: 10 * GB,
    bandwidthMbit: 30,
  },
};

export const TIER_RANK: Record<Tier, number> = { public: 0, unlocked: 1, trusted: 2 };

/** What the config file may say for a limit: a number, or for sizes and times a readable string. */
export type LimitsInput = { [K in keyof Limits]?: Limits[K] | string };

const UNITS: Record<string, number> = { "": 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4 };

/** "5GB", "512 MB", "16k", "1.5g" (1024-based, any case, the B is optional) or a plain number of bytes. Anything else is undefined. */
export function parseBytes(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : undefined;
  if (typeof v !== "string") return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*([kmgt]?)(?:i?b)?\s*$/i.exec(v);
  return m ? Math.round(Number(m[1]) * UNITS[m[2].toLowerCase()]) : undefined;
}

/** "90", "90s", "30m", "2h", "1.5h": seconds, with an optional unit. Anything else is undefined. */
export function parseSeconds(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : undefined;
  if (typeof v !== "string") return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*([smh]?)\s*$/i.exec(v);
  return m ? Math.round(Number(m[1]) * ({ "": 1, s: 1, m: 60, h: 3600 } as Record<string, number>)[m[2].toLowerCase()]) : undefined;
}

const BYTE_KEYS = new Set<keyof Limits>(["maxFileBytes", "maxBatchBytes", "dailyBytes"]);

/** Merge per-tier overrides from the config file over the defaults. Unknown or invalid values are ignored. */
export function mergeLimits(overrides: Partial<Record<Tier, LimitsInput>> | undefined): Record<Tier, Limits> {
  const out = { trusted: { ...DEFAULT_LIMITS.trusted }, unlocked: { ...DEFAULT_LIMITS.unlocked }, public: { ...DEFAULT_LIMITS.public } };
  for (const tier of Object.keys(out) as Tier[]) {
    const o = overrides?.[tier];
    if (!o) continue;
    for (const key of Object.keys(out[tier]) as (keyof Limits)[]) {
      const raw = o[key];
      if (raw === undefined) continue;
      if ((key === "dailyBytes" || key === "bandwidthMbit") && raw === null) { (out[tier][key] as number | null) = null; continue; }
      const v = BYTE_KEYS.has(key) ? parseBytes(raw) : key === "jobTimeoutSec" ? parseSeconds(raw) : typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
      if (v !== undefined) (out[tier][key] as number | null) = v;
    }
  }
  return out;
}
