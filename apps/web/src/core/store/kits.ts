import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AddonManifest } from "@jimkit/sdk";
import { BUNDLE_FILES, validateBundle } from "@jimkit/sdk/bundle";
import { config } from "../config";

/**
 * Kits installed from GitHub live in DATA_DIR/kits:
 *   installed.json                  which kits, from where, which version
 *   <id>/<sha256>/client.js ...     the files of one version; the hash is also in the URL the browser loads them from
 * Nothing here is built into the image, so installing and removing needs neither a rebuild nor a restart.
 */
export interface KitRecord {
  id: string;
  /** lowercase "user/name" */
  repo: string;
  version: string;
  sha256: string;
  installedAt: number;
  /** the kit ships a stylesheet (remembered, so listing the kits never touches the disk) */
  css?: boolean;
  /** the kit ships theme.css (the stylesheet of the themes it brings) */
  themeCss?: boolean;
  manifest: AddonManifest;
}

/** A refusal with a message for the person at the screen. */
export class KitError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** JIMKIT_KITS=off: kits can still be used, but not added, updated or removed from the screen. */
export const kitsLocked = (env: NodeJS.ProcessEnv = process.env) => /^(off|0|false|no)$/i.test((env.JIMKIT_KITS ?? "").trim());

const SHA = /^[0-9a-f]{64}$/;
const ID = /^[a-z][a-z0-9-]{1,30}$/;

const root = () => join(config().dataDir, "kits");
const indexPath = () => join(root(), "installed.json");

const g = globalThis as unknown as { __jkKits?: { dir: string; list: KitRecord[] } };

function read(): KitRecord[] {
  try {
    const parsed = JSON.parse(readFileSync(indexPath(), "utf8")) as { kits?: KitRecord[] };
    return (parsed.kits ?? []).filter((k) => ID.test(k?.id) && SHA.test(k?.sha256) && existsSync(join(root(), k.id, k.sha256)));
  } catch {
    return [];
  }
}

export function installedKits(): KitRecord[] {
  const dir = root();
  if (g.__jkKits?.dir !== dir) g.__jkKits = { dir, list: read() };
  return g.__jkKits.list;
}

function save(list: KitRecord[]) {
  mkdirSync(root(), { recursive: true });
  const tmp = `${indexPath()}.tmp`;
  writeFileSync(tmp, JSON.stringify({ kits: list }, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, indexPath());
  g.__jkKits = { dir: root(), list };
}

/** The installed kits' manifests, each tagged with where it came from (the browser loads the code by that hash). */
export const kitManifests = (): AddonManifest[] => installedKits().map((k) => ({ ...k.manifest, source: { repo: k.repo, version: k.version, sha256: k.sha256, css: !!k.css, themeCss: !!k.themeCss } }));

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Why this manifest can't be installed next to the addons already here, or null. `others` excludes the kit being updated. */
export function conflictWith(manifest: AddonManifest, others: AddonManifest[]): string | null {
  const same = others.find((o) => o.id === manifest.id);
  if (same) return `The id "${manifest.id}" is already used by ${same.name}.`;
  const taken = new Map(others.flatMap((o) => o.tools.map((t) => [t.id, o.name] as const)));
  for (const t of manifest.tools) {
    const owner = taken.get(t.id);
    if (owner) return `Its tool "${t.id}" clashes with a tool in ${owner}.`;
  }
  const themes = new Map(others.flatMap((o) => (o.themes ?? []).map((t) => [t.id, o.name] as const)));
  for (const t of manifest.themes ?? []) {
    const owner = themes.get(t.id);
    if (owner) return `Its theme "${t.id}" clashes with a theme in ${owner}.`;
  }
  return null;
}

/**
 * Checks and stores a bundle. `others` are the other addons' manifests (built in and installed), for the clash check.
 * A kit installed from the same repository is replaced; the files of its old version are deleted.
 */
export function installBundle(text: string, repo: string, others: AddonManifest[]): KitRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new KitError("That file isn't a kit.");
  }
  const checked = validateBundle(parsed);
  if (!checked.ok) throw new KitError(checked.error);
  const { manifest, files } = checked.bundle;
  const before = installedKits();
  const previous = before.find((k) => k.repo === repo);
  const clash = conflictWith(manifest, others.filter((o) => o.id !== previous?.id));
  if (clash) throw new KitError(clash, 409);
  const sha = sha256(text);

  const dest = join(root(), manifest.id, sha);
  if (!existsSync(dest)) {
    const tmp = join(root(), `.tmp-${randomBytes(6).toString("hex")}`);
    mkdirSync(tmp, { recursive: true });
    try {
      for (const name of BUNDLE_FILES) if (typeof files[name] === "string") writeFileSync(join(tmp, name), files[name]!, { mode: 0o600 });
      mkdirSync(join(root(), manifest.id), { recursive: true });
      renameSync(tmp, dest);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  const record: KitRecord = { id: manifest.id, repo, version: manifest.version, sha256: sha, installedAt: Date.now(), css: typeof files["client.css"] === "string", themeCss: typeof files["theme.css"] === "string", manifest };
  save([...before.filter((k) => k.repo !== repo && k.id !== manifest.id), record]);
  // the old version's files are no longer reachable
  if (previous && previous.id === manifest.id && previous.sha256 !== sha) rmSync(join(root(), previous.id, previous.sha256), { recursive: true, force: true });
  else if (previous && previous.id !== manifest.id) rmSync(join(root(), previous.id), { recursive: true, force: true });
  return record;
}

/** Removes a kit and its files. What it saved under DATA_DIR/addons/<id> is left alone: put the kit back and it is still there. */
export function removeKit(id: string): KitRecord {
  const list = installedKits();
  const found = list.find((k) => k.id === id);
  if (!found) throw new KitError("That kit isn't installed.", 404);
  save(list.filter((k) => k.id !== id));
  rmSync(join(root(), id), { recursive: true, force: true });
  return found;
}

/** The path of one file of an installed version, or null. Only the browser's files are ever served; server.js is not. */
export function kitFile(id: string, sha: string, name: string): string | null {
  if (!ID.test(id) || !SHA.test(sha) || (name !== "client.js" && name !== "client.css" && name !== "theme.css")) return null;
  if (!installedKits().some((k) => k.id === id && k.sha256 === sha)) return null;
  const file = join(root(), id, sha, name);
  return existsSync(file) ? file : null;
}

/** Where the server code of an installed kit is, for the runtime to import. */
export function kitServerFile(id: string): string | null {
  const k = installedKits().find((x) => x.id === id);
  if (!k?.manifest.server) return null;
  const file = join(root(), k.id, k.sha256, "server.js");
  return existsSync(file) ? file : null;
}
