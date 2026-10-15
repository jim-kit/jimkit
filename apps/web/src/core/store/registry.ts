import { parseSource } from "@jimkit/sdk/bundle";
import { fetchText, type Fetcher } from "./source";
import type { RegistryKit, RegistryReview, RegistryVersion, RegistryView } from "./types";

/**
 * The registry is a git repository of "user/name" links with the reviews next to them; a script in it writes index.json, which
 * is all Jimkit reads. JIMKIT_REGISTRY changes where: "user/name" for another GitHub repository, an https URL for an index.json
 * served anywhere, or "off" for none (installing straight from a GitHub link still works).
 */
export const DEFAULT_REGISTRY = "jim-kit/registry";
const MAX_INDEX_BYTES = 4 * 1024 * 1024;
const TTL_MS = 10 * 60_000;

export function registryLocation(env: NodeJS.ProcessEnv = process.env): { repo: string | null; url: string; host: string } | null {
  const v = (env.JIMKIT_REGISTRY ?? DEFAULT_REGISTRY).trim();
  if (!v || v.toLowerCase() === "off") return null;
  if (/^https:\/\//i.test(v)) {
    try { return { repo: null, url: v, host: new URL(v).hostname }; } catch { return null; }
  }
  const s = parseSource(v);
  return s ? { repo: s.key, url: `https://raw.githubusercontent.com/${s.user}/${s.name}/main/index.json`, host: "raw.githubusercontent.com" } : null;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function version(v: Record<string, unknown>): RegistryVersion | null {
  if (typeof v.version !== "string" || typeof v.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(v.sha256)) return null;
  return {
    version: str(v.version, 40), tag: str(v.tag, 80) || `v${str(v.version, 40)}`, sha256: v.sha256, size: num(v.size), date: str(v.date, 40), server: v.server === true,
    apt: Array.isArray(v.apt) ? v.apt.filter((p): p is string => typeof p === "string").slice(0, 40) : undefined,
  };
}

/** Keeps what the screen needs and drops anything malformed or oversized: the index is somebody else's file. */
export function normalizeIndex(json: unknown): RegistryKit[] {
  const list = (json as { kits?: unknown })?.kits;
  if (!Array.isArray(list)) return [];
  const out: RegistryKit[] = [];
  for (const raw of list.slice(0, 2000)) {
    if (!raw || typeof raw !== "object") continue;
    const k = raw as Record<string, unknown>;
    const src = parseSource(String(k.repo ?? ""));
    const versions = (Array.isArray(k.versions) ? k.versions : []).map((v) => (v && typeof v === "object" ? version(v as Record<string, unknown>) : null)).filter((v): v is RegistryVersion => !!v).slice(0, 100);
    if (!src || !str(k.name, 60) || !versions.length) continue;
    const reviews = (Array.isArray(k.reviews) ? k.reviews : []).flatMap((r): RegistryReview[] => {
      const x = r as Record<string, unknown>;
      return x && typeof x.user === "string" && parseSource(`${x.user}/x`) && typeof x.rating === "number" && x.rating >= 1 && x.rating <= 5
        ? [{ user: str(x.user, 39), rating: Math.round(x.rating), text: str(x.text, 600), version: str(x.version, 40) || undefined, date: str(x.date, 40) }]
        : [];
    }).slice(0, 30);
    const rating = k.rating && typeof k.rating === "object" && num((k.rating as { count?: unknown }).count) > 0
      ? { average: Math.min(5, Math.max(1, num((k.rating as { average?: unknown }).average))), count: num((k.rating as { count?: unknown }).count) }
      : null;
    const homepage = typeof k.homepage === "string" && /^https?:\/\//.test(k.homepage) ? k.homepage.slice(0, 200) : undefined;
    out.push({
      repo: src.key, name: str(k.name, 60), description: str(k.description, 300), author: str(k.author, 80) || undefined, homepage,
      tools: (Array.isArray(k.tools) ? k.tools : []).slice(0, 20).map((t) => ({ name: str((t as Record<string, unknown>)?.name, 60), blurb: str((t as Record<string, unknown>)?.blurb, 120), icon: str((t as Record<string, unknown>)?.icon, 40) })),
      themes: (Array.isArray(k.themes) ? k.themes : []).slice(0, 4).map((t) => ({ name: str((t as Record<string, unknown>)?.name, 30), blurb: str((t as Record<string, unknown>)?.blurb, 80) })),
      latest: str(k.latest, 40) || versions[0].version, versions, rating, reviews, stars: typeof k.stars === "number" ? k.stars : undefined,
    });
  }
  return out;
}

const g = globalThis as unknown as { __jkRegistry?: { at: number; url: string; kits: RegistryKit[] } };

/** The registry's kits, cached for ten minutes. If GitHub can't be reached the last good copy is shown, marked as stale. */
export async function loadRegistry({ fetchFn, refresh = false, now = Date.now(), env = process.env }: { fetchFn?: Fetcher; refresh?: boolean; now?: number; env?: NodeJS.ProcessEnv } = {}): Promise<RegistryView> {
  const loc = registryLocation(env);
  if (!loc) return { repo: null, ok: false, error: "No registry is set up. You can still add a kit from a GitHub link.", kits: [] };
  const cached = g.__jkRegistry?.url === loc.url ? g.__jkRegistry : undefined;
  if (cached && !refresh && now - cached.at < TTL_MS) return { repo: loc.repo, ok: true, kits: cached.kits };
  try {
    const r = await fetchText(loc.url, { fetchFn, maxBytes: MAX_INDEX_BYTES, hosts: new Set([loc.host]) });
    if (r.status >= 400 || !r.text) throw new Error(`answered ${r.status}`);
    const kits = normalizeIndex(JSON.parse(r.text));
    g.__jkRegistry = { at: now, url: loc.url, kits };
    return { repo: loc.repo, ok: true, kits };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    if (cached) return { repo: loc.repo, ok: true, stale: true, kits: cached.kits };
    return { repo: loc.repo, ok: false, error: `Couldn't read the registry (${why}). You can still add a kit from a GitHub link.`, kits: [] };
  }
}

export const forgetRegistry = () => { delete g.__jkRegistry; };
