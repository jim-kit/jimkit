import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BaseRecord, Records } from "@jimkit/sdk";
import { config } from "./config";

/**
 * Small persistent collections for addons (uploads, jobs, ...). One process owns them: the index lives in memory and each
 * record is mirrored to <dataDir>/addons/<addon>/<collection>/<id>/record.json, so a restart keeps what was finished.
 * The host sweeps them: records past the retention period go, and the oldest go first when the disk cap is exceeded.
 * Kept on globalThis because Next may evaluate this module more than once, and there must only ever be one set.
 */
interface Collection {
  key: string;
  root: string;
  map: Map<string, BaseRecord>;
  isBusy: (r: never) => boolean;
  ready: Promise<void>;
  /** the last queued disk write per record, so writes to one record happen in order */
  writes: Map<string, Promise<void>>;
}
const g = globalThis as unknown as { __jkCollections?: Map<string, Collection>; __jkSweep?: ReturnType<typeof setInterval> };
const collections = (g.__jkCollections ??= new Map());

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function openCollection<T extends BaseRecord>(addon: string, name: string, isBusy: (r: T) => boolean = () => false): Records<T> {
  const key = `${addon}/${name}`;
  let c = collections.get(key);
  if (!c) {
    const root = join(config().dataDir, "addons", addon, name);
    c = { key, root, map: new Map(), isBusy: isBusy as (r: never) => boolean, ready: Promise.resolve(), writes: new Map() };
    const col = c;
    c.ready = (async () => {
      await mkdir(root, { recursive: true });
      for (const id of await readdir(root).catch(() => [])) {
        try {
          const rec = JSON.parse(await readFile(join(root, id, "record.json"), "utf8")) as BaseRecord;
          col.map.set(rec.id, rec);
        } catch {
          await rm(join(root, id), { recursive: true, force: true }); // half-written leftovers
        }
      }
    })();
    collections.set(key, c);
    startSweeper();
  }
  const col = c;
  const dir = (id: string) => {
    if (!SAFE_ID.test(id)) throw new Error("bad record id");
    return join(col.root, id);
  };
  return {
    get: (id) => col.map.get(id) as T | undefined,
    all: () => [...col.map.values()] as T[],
    async put(rec) {
      const folder = dir(rec.id);
      const json = JSON.stringify(rec);
      col.map.set(rec.id, rec);
      // Writes to one record run one after another (progress saves and the final save can overlap), each through a temp file so
      // a crash never leaves half a record.json. A write that was waiting when its record was removed is dropped.
      const write = (col.writes.get(rec.id) ?? Promise.resolve()).then(async () => {
        if (!col.map.has(rec.id)) return;
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, "record.json.tmp"), json);
        await rename(join(folder, "record.json.tmp"), join(folder, "record.json"));
      });
      const settled = write.catch(() => {});
      col.writes.set(rec.id, settled);
      void settled.then(() => col.writes.get(rec.id) === settled && col.writes.delete(rec.id));
      await write;
    },
    touch(rec) {
      if (col.map.has(rec.id)) col.map.set(rec.id, rec);
    },
    async remove(id) {
      const folder = dir(id);
      col.map.delete(id);
      await col.writes.get(id);
      await rm(folder, { recursive: true, force: true });
    },
    dir,
  };
}

/** Wait until every collection has been read from disk. */
export async function recordsReady(): Promise<void> {
  await Promise.all([...collections.values()].map((c) => c.ready));
}

export function bytesHeldBy(ip: string): number {
  let n = 0;
  for (const c of collections.values()) for (const r of c.map.values()) if (r.ip === ip) n += r.bytes ?? 0;
  return n;
}

export function totalBytes(): number {
  let n = 0;
  for (const c of collections.values()) for (const r of c.map.values()) n += r.bytes ?? 0;
  return n;
}

async function dropRecord(c: Collection, id: string) {
  c.map.delete(id);
  await rm(join(c.root, id), { recursive: true, force: true });
}

/** Drop anything past its retention, then the oldest of the rest while the store is over its cap. */
export async function sweep(now = Date.now()): Promise<void> {
  const { retentionMs, scratchCapBytes } = config();
  for (const c of collections.values()) {
    for (const r of [...c.map.values()]) {
      if (!c.isBusy(r as never) && now - (r.finished ?? r.created) > retentionMs) await dropRecord(c, r.id);
    }
  }
  if (totalBytes() > scratchCapBytes) {
    const old: { t: number; drop: () => Promise<void> }[] = [];
    for (const c of collections.values()) {
      for (const r of c.map.values()) if (!c.isBusy(r as never)) old.push({ t: r.finished ?? r.created, drop: () => dropRecord(c, r.id) });
    }
    old.sort((a, b) => a.t - b.t);
    for (const o of old) {
      if (totalBytes() <= scratchCapBytes * 0.9) break;
      await o.drop();
    }
  }
}

function startSweeper() {
  g.__jkSweep ??= setInterval(() => void sweep().catch(() => {}), 5 * 60_000).unref();
}

/** test helper */
export function _resetRecords(): void {
  collections.clear();
}
