import { compareVersions } from "@jimkit/sdk/bundle";
import { appVersion } from "./version";

/**
 * "Is there a newer Jimkit?" An occasional look at where releases are published, so the Settings screen can say so. It never installs
 * anything: a container can't replace itself, and the update is `jimkit update` on the machine that runs it.
 *
 * JIMKIT_UPDATES: `off`, a GitHub `user/name` (its latest release), or an https URL that answers `{"version": "1.2.0", "url": "...", "notes": "..."}`.
 * The default is the project's own releases. Nothing about you is sent beyond what any request carries.
 */
export const DEFAULT_UPDATE_SOURCE = "jim-kit/jimkit";
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;
const RETRY_AFTER_ERROR_MS = 30 * 60 * 1000;

export interface UpdateInfo {
  current: string;
  /** null when it could not be looked up, or checking is off */
  latest: string | null;
  newer: boolean;
  url: string | null;
  notes: string | null;
  /** ms epoch of the last look, null if never */
  checkedAt: number | null;
  /** where it looked, null when off */
  source: string | null;
  error?: string;
}

type Source = { kind: "github"; repo: string } | { kind: "url"; url: string };

export function updateSource(value = process.env.JIMKIT_UPDATES): Source | null {
  const v = (value ?? DEFAULT_UPDATE_SOURCE).trim();
  if (!v || v.toLowerCase() === "off") return null;
  if (/^https:\/\//i.test(v)) return { kind: "url", url: v };
  return /^[\w.-]+\/[\w.-]+$/.test(v) ? { kind: "github", repo: v } : null;
}

const cleanVersion = (v: unknown) => (typeof v === "string" ? v.trim().replace(/^v(?=\d)/i, "") : "");
const isVersion = (v: string) => /^\d+\.\d+\.\d+([-+][\w.-]+)?$/.test(v);
const clip = (s: unknown, n: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);
const https = (u: unknown) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : null);

/** Pure: what a release answer means for this install. */
export function readRelease(source: Source, body: unknown, current: string): Omit<UpdateInfo, "checkedAt" | "source"> {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const latest = cleanVersion(source.kind === "github" ? o.tag_name : o.version);
  if (!isVersion(latest)) return { current, latest: null, newer: false, url: null, notes: null, error: "The release information did not contain a version." };
  const url = https(source.kind === "github" ? o.html_url : o.url);
  const notes = clip(source.kind === "github" ? o.body : o.notes, 1500);
  return { current, latest, newer: isVersion(current) && compareVersions(latest, current) > 0, url, notes };
}

let memo: { info: UpdateInfo; at: number } | undefined;

export async function checkForUpdate(opts: { force?: boolean; fetchImpl?: typeof fetch; now?: number; value?: string } = {}): Promise<UpdateInfo> {
  const current = appVersion();
  const now = opts.now ?? Date.now();
  const source = updateSource(opts.value ?? process.env.JIMKIT_UPDATES);
  if (!source) return { current, latest: null, newer: false, url: null, notes: null, checkedAt: null, source: null };
  const label = source.kind === "github" ? source.repo : source.url;
  const ttl = memo?.info.error ? RETRY_AFTER_ERROR_MS : CHECK_EVERY_MS;
  if (!opts.force && memo && memo.info.source === label && now - memo.at < ttl) return { ...memo.info, current };
  let info: UpdateInfo;
  try {
    const url = source.kind === "github" ? `https://api.github.com/repos/${source.repo}/releases/latest` : source.url;
    const res = await (opts.fetchImpl ?? fetch)(url, { headers: { accept: "application/vnd.github+json, application/json", "user-agent": `jimkit/${current}` }, signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (res.status === 404) info = { current, latest: null, newer: false, url: null, notes: null, checkedAt: now, source: label, error: "No release has been published there yet." };
    else if (!res.ok) throw new Error(`HTTP ${res.status}`);
    else info = { ...readRelease(source, await res.json(), current), checkedAt: now, source: label };
  } catch (e) {
    info = { current, latest: null, newer: false, url: null, notes: null, checkedAt: now, source: label, error: `Could not check: ${e instanceof Error ? e.message : "unknown error"}.` };
  }
  memo = { info, at: now };
  return info;
}

/** For tests. */
export const resetUpdateCache = () => { memo = undefined; };
