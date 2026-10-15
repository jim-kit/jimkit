import { compareVersions, parseSource } from "@jimkit/sdk/bundle";
import type { InstalledView, RegistryKit } from "@/core/store/types";

/** The kits whose name, author, description, tools or "user/name" contain every word of the query. */
export function matchKits(kits: RegistryKit[], query: string): RegistryKit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = (k: RegistryKit) => [k.repo, k.name, k.description, k.author ?? "", ...k.tools.flatMap((t) => [t.name, t.blurb])].join(" ").toLowerCase();
  return kits.filter((k) => words.every((w) => hay(k).includes(w))).sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0) || a.name.localeCompare(b.name));
}

/** What typing in the search box means: a GitHub source to add (a link, or user/name) or just words to search for. */
export function sourceFromQuery(query: string): string | null {
  const q = query.trim();
  if (!q || /\s/.test(q)) return null;
  return /^(https?:\/\/)?(www\.)?github\.com\//i.test(q) || /^[\w.-]+\/[\w.-]+(@\S+)?$/.test(q) ? (parseSource(q) ? q : null) : null;
}

/** A newer version in the registry than the installed one, or null. */
export function updateFor(installed: InstalledView, kits: RegistryKit[]): string | null {
  const entry = kits.find((k) => k.repo === installed.repo);
  return entry && compareVersions(entry.latest, installed.version) > 0 ? entry.latest : null;
}

export interface ReviewDraft {
  rating: number;
  text: string;
  version?: string;
}

/** Where the project's own registry takes reviews: its website, where a reviewer signs in with GitHub. Another registry keeps the pull-request way below. */
export const DEFAULT_REGISTRY_REPO = "jim-kit/registry";
export const REGISTRY_SITE = "https://jimkit.thejimmy.dev";
export function reviewPage(registry: string, kit: string): string | null {
  const k = parseSource(kit);
  return registry.toLowerCase() === DEFAULT_REGISTRY_REPO && k ? `${REGISTRY_SITE}/kits/view/?repo=${k.user.toLowerCase()}/${k.name.toLowerCase()}#review` : null;
}

/**
 * GitHub's "create a new file" page, filled in: the reviewer commits the file to their fork and opens a pull request, so the
 * registry knows the review comes from that GitHub account. No Jimkit server, no accounts of ours.
 */
export function reviewUrl(registry: string, kit: string, reviewer: string, draft: ReviewDraft): string | null {
  const k = parseSource(kit);
  const me = parseSource(`${reviewer}/x`);
  if (!k || !me) return null;
  const body = { rating: Math.min(5, Math.max(1, Math.round(draft.rating))), ...(draft.version ? { version: draft.version } : {}), text: draft.text.trim().slice(0, 600) };
  const path = `reviews/${k.user.toLowerCase()}/${k.name.toLowerCase()}/${me.user.toLowerCase()}.json`;
  return `https://github.com/${registry}/new/main?filename=${encodeURIComponent(path)}&value=${encodeURIComponent(JSON.stringify(body, null, 2) + "\n")}`;
}

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} kB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
