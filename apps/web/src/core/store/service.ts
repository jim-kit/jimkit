import { compareVersions, parseSource, validateBundle } from "@jimkit/sdk/bundle";
import { addonStatuses, allManifests, builtIn, enabledManifests, forgetAddon, loadAddon, hasServer } from "../addons";
import { config } from "../config";
import { conflictWith, installBundle, installedKits, KitError, kitsLocked, removeKit, sha256, type KitRecord } from "./kits";
import { loadRegistry } from "./registry";
import { downloadKit, type Fetcher } from "./source";
import type { Preview, StoreView, Trust } from "./types";

interface Pending {
  text: string;
  repo: string;
  at: number;
  trust: Trust;
}
const PENDING_MS = 15 * 60_000;
const g = globalThis as unknown as { __jkPending?: Map<string, Pending> };
const pending = (g.__jkPending ??= new Map());

function remember(sha: string, p: Pending) {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.at > PENDING_MS) pending.delete(k);
  while (pending.size >= 10) pending.delete(pending.keys().next().value as string);
  pending.set(sha, p);
}

/**
 * Downloads a kit and says what installing it would do, without installing anything. The file is held here, so `commit` installs
 * exactly the bytes that were shown, not whatever the release holds a minute later.
 */
export async function inspect(input: string, opts: { version?: string; fetchFn?: Fetcher } = {}): Promise<Preview> {
  const source = parseSource(input);
  if (!source) throw new KitError("That isn't a GitHub link or a user/name.");
  const registry = await loadRegistry({ fetchFn: opts.fetchFn });
  const entry = registry.kits.find((k) => k.repo === source.key);
  const wanted = opts.version ?? source.version ?? entry?.latest;
  const listed = entry?.versions.find((v) => v.version === wanted);

  const text = await downloadKit(source, { fetchFn: opts.fetchFn, version: wanted, tag: listed?.tag });
  const sha = sha256(text);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new KitError("The release's kit file isn't valid JSON."); }
  const checked = validateBundle(parsed);
  if (!checked.ok) throw new KitError(checked.error);
  const { manifest, files } = checked.bundle;
  if (wanted && manifest.version !== wanted) throw new KitError(`That release is ${wanted}, but the file inside says ${manifest.version}.`);

  let trust: Trust = "unlisted";
  if (entry) {
    if (!listed) trust = "unrecorded";
    else if (listed.sha256 === sha) trust = "verified";
    else throw new KitError(`This file isn't the one the registry recorded for ${entry.repo} ${listed.version}. The release was changed after it was listed, so it isn't installed.`, 409);
  }

  const previous = installedKits().find((k) => k.repo === source.key);
  const conflict = conflictWith(manifest, allManifests().filter((m) => m.id !== previous?.id)) ?? undefined;
  const change = !previous ? "new" : compareVersions(manifest.version, previous.version) > 0 ? "update" : compareVersions(manifest.version, previous.version) < 0 ? "older" : sha === previous.sha256 ? "same" : "update";
  remember(sha, { text, repo: source.key, at: Date.now(), trust });
  return {
    sha256: sha, repo: source.key, id: manifest.id, name: manifest.name, version: manifest.version, description: manifest.description,
    author: manifest.author, homepage: manifest.homepage,
    tools: manifest.tools.map((t) => ({ name: t.name, blurb: t.blurb, icon: t.icon })),
    themes: (manifest.themes ?? []).map((t) => ({ name: t.name, blurb: t.blurb })),
    server: !!files["server.js"], apt: manifest.system?.apt ?? [], settings: manifest.settings?.length ?? 0, bytes: Buffer.byteLength(text),
    trust, conflict, change, installed: previous?.version,
  };
}

/** What the browser needs after the set of kits changed: the manifests and their status, so the new tools appear without a reload. */
export async function snapshot() {
  return { manifests: enabledManifests(), status: await addonStatuses() };
}

/** Installs the file `inspect` showed. */
export async function commit(sha: string, acknowledged = false): Promise<{ record: KitRecord; warning?: string }> {
  const p = pending.get(sha);
  if (!p || Date.now() - p.at > PENDING_MS) throw new KitError("That was a while ago. Look at the kit again, then install.", 410);
  if (p.trust !== "verified" && !acknowledged) throw new KitError("Confirm that you trust this kit's author: the registry hasn't vouched for this file.", 400);
  const record = installBundle(p.text, p.repo, allManifests());
  pending.delete(sha);
  forgetAddon(record.id);
  let warning: string | undefined;
  if (hasServer(record.id)) {
    try { await loadAddon(record.id); } catch (e) { warning = `It is installed, but its server part didn't start: ${e instanceof Error ? e.message : e}`; }
  }
  return { record, warning };
}

export function uninstall(id: string): KitRecord {
  const removed = removeKit(id);
  forgetAddon(id);
  return removed;
}

export async function storeView(refresh = false, fetchFn?: Fetcher): Promise<StoreView> {
  const off = new Set(config().disabledAddons);
  const locked = kitsLocked();
  return {
    locked,
    builtIn: builtIn.map((m) => ({ id: m.id, name: m.name, version: m.version, description: m.description, enabled: !off.has(m.id), themes: (m.themes ?? []).map((t) => t.name) })),
    kits: installedKits().map((k) => ({ id: k.id, repo: k.repo, version: k.version, name: k.manifest.name, description: k.manifest.description, installedAt: k.installedAt, enabled: !off.has(k.id), themes: (k.manifest.themes ?? []).map((t) => t.name) })),
    registry: locked ? { repo: null, ok: false, kits: [] } : await loadRegistry({ refresh, fetchFn }),
  };
}
