import { BUNDLE_ASSET, MAX_BUNDLE_BYTES, type Source } from "@jimkit/sdk/bundle";
import { KitError } from "./kits";

/** The only hosts a kit is ever downloaded from: GitHub's release pages and the storage they redirect to. */
export const GITHUB_HOSTS = new Set(["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "raw.githubusercontent.com"]);

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface Limits {
  fetchFn?: Fetcher;
  maxBytes?: number;
  hosts?: Set<string>;
  timeoutMs?: number;
}

/** GETs a URL as text. Follows redirects by hand so every hop is checked; refuses other hosts and plain HTTP; stops reading at the size limit. */
export async function fetchText(url: string, { fetchFn = fetch, maxBytes = MAX_BUNDLE_BYTES + 4096, hosts = GITHUB_HOSTS, timeoutMs = 30_000 }: Limits = {}): Promise<{ status: number; text: string }> {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    const u = new URL(current);
    if (u.protocol !== "https:" || !hosts.has(u.hostname)) throw new KitError(`Won't download from ${u.hostname}.`, 400);
    let res: Response;
    try {
      res = await fetchFn(current, { redirect: "manual", signal, headers: { "user-agent": "jimkit", accept: "application/json, application/octet-stream" } });
    } catch {
      throw new KitError("Couldn't reach GitHub. Check this machine's internet connection and DNS.", 502);
    }
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      void res.body?.cancel();
      current = new URL(next, current).href;
      continue;
    }
    if (!res.ok) {
      void res.body?.cancel();
      return { status: res.status, text: "" };
    }
    const declared = Number(res.headers.get("content-length"));
    if (declared > maxBytes) { void res.body?.cancel(); throw new KitError("That file is too large to be a kit.", 413); }
    const reader = res.body?.getReader();
    if (!reader) return { status: res.status, text: await res.text() };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { void reader.cancel(); throw new KitError("That file is too large to be a kit.", 413); }
      chunks.push(value);
    }
    return { status: res.status, text: Buffer.concat(chunks).toString("utf8") };
  }
  throw new KitError("Too many redirects.", 502);
}

/** The release asset URLs to try, newest first, for a version. A tag is usually "v1.2.0" but some people leave the v off. */
export function assetUrls(source: Pick<Source, "user" | "name">, version?: string, tag?: string): string[] {
  const base = `https://github.com/${encodeURIComponent(source.user)}/${encodeURIComponent(source.name)}/releases`;
  if (tag) return [`${base}/download/${encodeURIComponent(tag)}/${BUNDLE_ASSET}`];
  if (!version) return [`${base}/latest/download/${BUNDLE_ASSET}`];
  return [`${base}/download/v${version}/${BUNDLE_ASSET}`, `${base}/download/${version}/${BUNDLE_ASSET}`];
}

/** Downloads a kit's bundle from its GitHub release. */
export async function downloadKit(source: Source, opts: Limits & { version?: string; tag?: string } = {}): Promise<string> {
  for (const url of assetUrls(source, opts.version ?? source.version, opts.tag)) {
    const r = await fetchText(url, opts);
    if (r.status === 404) continue;
    if (r.status >= 400 || !r.text) throw new KitError(`GitHub answered ${r.status}.`, 502);
    return r.text;
  }
  throw new KitError(`No release of ${source.key}${opts.version ?? source.version ? ` at ${opts.version ?? source.version}` : ""} has a ${BUNDLE_ASSET} attached. Has the author published one?`, 404);
}
