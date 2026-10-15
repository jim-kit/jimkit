/**
 * The community kits, from the registry's index.json. This module has no server-only code, so the browser uses it too: the pages read the index
 * when they are opened, which means a new kit or review shows up as soon as the registry's index is rebuilt, with no new deploy of the site.
 *   NEXT_PUBLIC_REGISTRY_INDEX_URL   another https address that serves an index.json (a fork's registry), set when the site is built
 */
export const REGISTRY_INDEX_URL = process.env.NEXT_PUBLIC_REGISTRY_INDEX_URL || "https://raw.githubusercontent.com/jim-kit/registry/main/index.json";

export interface CommunityKit {
  repo: string; name: string; description: string; author?: string; homepage?: string;
  tools: { name: string; blurb: string }[]; looks: { name: string; blurb: string }[];
  latest: string;
  versions: { version: string; date: string; size: number; server: boolean }[];
  rating: { average: number; count: number } | null;
  reviews: { user: string; rating: number; text: string; version?: string; date: string }[];
  stars?: number;
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

/** The index as it is right now. Throws if it can't be read. */
export async function fetchCommunityKits(fetchFn: typeof fetch = fetch): Promise<CommunityKit[]> {
  const res = await fetchFn(REGISTRY_INDEX_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return normalizeKits(await res.json());
}
