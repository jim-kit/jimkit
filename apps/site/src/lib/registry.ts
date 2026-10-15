import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * The kits shown on /kits. The built-in ones are read from the addon manifests, like the tool list; the community ones from the registry's
 * index.json, fetched once when the site is built. If the registry can't be reached the page builds with none listed, so a deploy never
 * fails because GitHub was down.
 *   REGISTRY_INDEX_URL   another https address that serves an index.json (a fork's registry)
 *   REGISTRY_INDEX_FILE  a file on disk instead (tests)
 */
/** The repository root: the build runs in apps/site and the tests at the top, so look upward for the folder that holds the addons. */
function findRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++, dir = dirname(dir)) if (existsSync(resolve(dir, "addons")) && existsSync(resolve(dir, "apps/site"))) return dir;
  return resolve(process.cwd(), "../..");
}
const ROOT = findRoot();
const DEFAULT_INDEX = "https://raw.githubusercontent.com/jim-kit/registry/main/index.json";

export interface BuiltInKit { id: string; name: string; description: string; tools: string[]; looks: string[] }
export interface CommunityKit {
  repo: string; name: string; description: string; author?: string; homepage?: string;
  tools: { name: string; blurb: string }[]; looks: { name: string; blurb: string }[];
  latest: string;
  versions: { version: string; date: string; size: number; server: boolean }[];
  rating: { average: number; count: number } | null;
  reviews: { user: string; rating: number; text: string; version?: string; date: string }[];
  stars?: number;
}

export function loadBuiltInKits(): BuiltInKit[] {
  const out: BuiltInKit[] = [];
  for (const dir of readdirSync(resolve(ROOT, "addons")).sort()) {
    const m = JSON.parse(readFileSync(resolve(ROOT, "addons", dir, "package.json"), "utf8")).jimkit;
    if (m) out.push({ id: m.id, name: m.name, description: m.description, tools: (m.tools ?? []).map((t: { name: string }) => t.name), looks: (m.themes ?? []).map((t: { name: string }) => t.name) });
  }
  // the tool kits first, then the looks
  return out.sort((a, b) => Number(a.looks.length > 0 && !a.tools.length) - Number(b.looks.length > 0 && !b.tools.length));
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** Keeps what the pages need and drops anything malformed: the index is somebody else's file. */
export function normalizeKits(json: unknown): CommunityKit[] {
  const list = (json as { kits?: unknown })?.kits;
  if (!Array.isArray(list)) return [];
  const out: CommunityKit[] = [];
  for (const raw of list.slice(0, 2000)) {
    const k = (raw ?? {}) as Record<string, unknown>;
    const repo = text(k.repo, 100).toLowerCase();
    const versions = (Array.isArray(k.versions) ? k.versions : []).slice(0, 100).flatMap((v) => {
      const x = (v ?? {}) as Record<string, unknown>;
      return typeof x.version === "string" ? [{ version: text(x.version, 40), date: text(x.date, 40).slice(0, 10), size: typeof x.size === "number" ? x.size : 0, server: x.server === true }] : [];
    });
    if (!REPO.test(repo) || !text(k.name, 60) || !versions.length) continue;
    const rating = k.rating && typeof k.rating === "object" && typeof (k.rating as { count?: unknown }).count === "number" && (k.rating as { count: number }).count > 0
      ? { average: Math.min(5, Math.max(1, Number((k.rating as { average?: unknown }).average) || 0)), count: (k.rating as { count: number }).count } : null;
    const homepage = typeof k.homepage === "string" && /^https?:\/\//.test(k.homepage) ? k.homepage.slice(0, 200) : undefined;
    out.push({
      repo, name: text(k.name, 60), description: text(k.description, 300), author: text(k.author, 80) || undefined, homepage,
      tools: (Array.isArray(k.tools) ? k.tools : []).slice(0, 20).map((t) => ({ name: text((t as Record<string, unknown>)?.name, 60), blurb: text((t as Record<string, unknown>)?.blurb, 120) })),
      looks: (Array.isArray(k.themes) ? k.themes : []).slice(0, 4).map((t) => ({ name: text((t as Record<string, unknown>)?.name, 30), blurb: text((t as Record<string, unknown>)?.blurb, 80) })),
      latest: text(k.latest, 40) || versions[0].version, versions, rating,
      reviews: (Array.isArray(k.reviews) ? k.reviews : []).slice(0, 30).flatMap((r) => {
        const x = (r ?? {}) as Record<string, unknown>;
        return typeof x.user === "string" && typeof x.rating === "number" && x.rating >= 1 && x.rating <= 5 ? [{ user: text(x.user, 39), rating: Math.round(x.rating), text: text(x.text, 600), version: text(x.version, 40) || undefined, date: text(x.date, 40).slice(0, 10) }] : [];
      }),
      stars: typeof k.stars === "number" ? k.stars : undefined,
    });
  }
  return out;
}

let cache: Promise<CommunityKit[]> | undefined;

export function loadCommunityKits(): Promise<CommunityKit[]> {
  cache ??= (async () => {
    try {
      const file = process.env.REGISTRY_INDEX_FILE;
      if (file) return normalizeKits(JSON.parse(readFileSync(file, "utf8")));
      const res = await fetch(process.env.REGISTRY_INDEX_URL || DEFAULT_INDEX, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return normalizeKits(await res.json());
    } catch (e) {
      console.warn(`The registry could not be read (${e instanceof Error ? e.message : e}); /kits is built without community kits.`);
      return [];
    }
  })();
  return cache;
}
