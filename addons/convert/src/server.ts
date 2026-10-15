import { defineServer, type Handler } from "@jimkit/sdk";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebStream } from "node:stream/web";
import archiver from "archiver";
import { safeBase, throttle } from "@jimkit/sdk/server";
import { MAX_ACTIVE_JOBS_PER_CLIENT, UPLOAD_IDLE_MS, settings } from "./server/config";
import { warmLibreOffice } from "./server/engines/office";
import { probeEngines, type Probe } from "./server/probe";
import { activeFor, enqueue, failInterrupted, openStores, stores, uploadFile, viewOf } from "./server/jobs";
import type { JobRecord, Quality } from "./server/types";
import { canConvertFrom, planRoute, setAvailableEngines } from "./lib/registry/plan";
import { extOf, isKnown } from "./lib/registry/formats";

const GB = 1024 ** 3;
const fmt = (n: number) => `${Math.round((n / GB) * 10) / 10} GB`;

const contentDisposition = (name: string) => `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

/** Uploads that are still arriving, per address. They aren't records yet, so without this a burst of parallel uploads would each pass the limits. */
const arriving = new Map<string, { files: number; bytes: number }>();

/** PUT upload?name=<file name>  body: the raw file. The declared length is checked against the tier's limits before a byte is stored. */
const upload: Handler = async ({ req, url, client: c }, ctx) => {
  const { uploads } = stores();
  const L = c.limits;
  const name = (url.searchParams.get("name") ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, 200);
  const ext = extOf(name);
  if (!name || !isKnown(ext) || !canConvertFrom(ext)) return ctx.fail(c, 415, "That file type can't be converted yet.", { code: "unsupported_type" });

  const size = Number(req.headers.get("content-length"));
  if (!Number.isFinite(size) || size <= 0 || !req.body) return ctx.fail(c, 411, "Empty or unsized upload.", { code: "length_required" });
  const pending = arriving.get(c.ip) ?? { files: 0, bytes: 0 };
  if (size > L.maxFileBytes) return ctx.fail(c, 413, `Over the ${fmt(L.maxFileBytes)} per-file limit.`, { code: "file_too_large" });
  if (ctx.bytesHeldBy(c.ip) + pending.bytes + size > L.maxBatchBytes) return ctx.fail(c, 413, `That would pass the ${fmt(L.maxBatchBytes)} limit. Remove some files first.`, { code: "batch_too_large" });
  if (uploads.all().filter((u) => u.ip === c.ip).length + pending.files >= L.maxFiles) return ctx.fail(c, 429, `Up to ${L.maxFiles} files at a time.`, { code: "too_many_files" });
  if (!ctx.daily.canUse(c.ip, pending.bytes + size, L.dailyBytes)) return ctx.fail(c, 429, "Daily limit reached. Unlock for more, or try tomorrow.", { code: "daily_limit" });

  const id = randomBytes(12).toString("hex");
  const record = { id, clientId: c.id, ip: c.ip, name, ext, size, bytes: size, created: Date.now() };
  arriving.set(c.ip, { files: pending.files + 1, bytes: pending.bytes + size });
  const idle = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const alive = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(), UPLOAD_IDLE_MS);
  };
  try {
    await mkdir(uploads.dir(id), { recursive: true });
    let seen = 0;
    const guard = new Transform({
      transform(chunk: Buffer, _e, cb) {
        alive();
        seen += chunk.length;
        if (seen > size) return cb(new Error("longer than declared"));
        cb(null, chunk);
      },
    });
    alive();
    try {
      const copy = pipeline(Readable.fromWeb(req.body as unknown as WebStream), guard, createWriteStream(uploadFile(stores(), record)), { signal: idle.signal });
      copy.catch(() => {});
      // pipeline() only settles once the request body's cancel() has finished, and that can hang on a dead connection, so the
      // idle abort is raced against it instead of waited for
      const stalled = new Promise<never>((_, reject) => idle.signal.addEventListener("abort", () => reject(new Error("stalled")), { once: true }));
      await Promise.race([copy, stalled]);
      if (seen !== size) throw new Error("shorter than declared");
    } catch {
      await rm(uploads.dir(id), { recursive: true, force: true });
      return ctx.fail(c, 400, "The upload was interrupted.", { code: "upload_failed" });
    }
    await uploads.put(record);
    ctx.daily.add(c.ip, size);
    return ctx.reply(c, { id, name, ext, size });
  } finally {
    clearTimeout(timer);
    const left = arriving.get(c.ip);
    if (left && left.files > 1) arriving.set(c.ip, { files: left.files - 1, bytes: left.bytes - size });
    else arriving.delete(c.ip);
  }
};

const removeUpload: Handler = async ({ params, client: c }, ctx) => {
  const { uploads } = stores();
  const u = uploads.get(params.id);
  if (!u || u.clientId !== c.id) return ctx.fail(c, 404, "Not found.", { code: "not_found" });
  await uploads.remove(params.id);
  return ctx.reply(c, { ok: true });
};

interface Item { uploadId?: unknown; to?: unknown; level?: unknown; maxDim?: unknown }

/** POST convert  { items: [{ uploadId, to, level?, maxDim? }] } -> one job per item */
const convert: Handler = async ({ req, client: c }, ctx) => {
  const s = stores();
  const L = c.limits;
  const body = (await req.json().catch(() => null)) as { items?: Item[] } | null;
  const items = Array.isArray(body?.items) ? body!.items.filter((it): it is Item => !!it && typeof it === "object").slice(0, L.maxFiles) : [];
  if (!items.length) return ctx.fail(c, 400, "Nothing to convert.", { code: "no_items" });
  if (activeFor(s, c.ip) + items.length > MAX_ACTIVE_JOBS_PER_CLIENT) return ctx.fail(c, 429, "Too many conversions waiting. Let some finish first.", { code: "too_many_jobs" });

  const jobs: JobRecord[] = [];
  const taken = new Set(s.jobs.all().map((j) => j.uploadId));
  for (const it of items) {
    const up = typeof it.uploadId === "string" ? s.uploads.get(it.uploadId) : undefined;
    if (!up || up.clientId !== c.id) return ctx.fail(c, 404, "That upload expired or was removed. Add the file again.", { code: "unknown_upload" });
    // an upload is used up by its job (the first to finish removes it): a second job on it would fail, or run on a file that vanishes under it
    if (taken.has(up.id)) return ctx.fail(c, 409, "That file is already being converted. Add it again to convert it to another format.", { code: "upload_in_use" });
    taken.add(up.id);
    const to = typeof it.to === "string" ? it.to : "";
    const route = planRoute(up.ext, to);
    if (!route) return ctx.fail(c, 400, `Can't convert ${up.ext.toUpperCase()} to ${to.toUpperCase()}.`, { code: "no_route" });
    const level: Quality["level"] = it.level === "low" || it.level === "high" ? it.level : "balanced";
    const maxDim = Number.isInteger(it.maxDim) && (it.maxDim as number) > 0 ? Math.min(it.maxDim as number, 8192) : 0;
    jobs.push({
      id: randomBytes(12).toString("hex"), clientId: c.id, ip: c.ip, uploadId: up.id, name: up.name, from: up.ext, to: route.to, route,
      quality: { level, maxDim }, state: "queued", progress: 0, step: 0, outputs: [], created: Date.now(),
      timeoutSec: L.jobTimeoutSec, concurrency: L.concurrentJobs, bandwidthMbit: L.bandwidthMbit,
    });
  }
  for (const j of jobs) await enqueue(ctx, s, j);
  return ctx.reply(c, { jobs: jobs.map((j) => viewOf(ctx, j)) });
};

/** GET jobs?ids=a,b,c -> the state of those jobs (only the ones this client owns) */
const listJobs: Handler = async ({ url, client: c }, ctx) => {
  const s = stores();
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 100);
  const jobs = ids.map((id) => s.jobs.get(id)).filter((j): j is JobRecord => !!j && j.clientId === c.id).map((j) => viewOf(ctx, j));
  return ctx.reply(c, { jobs });
};

/** DELETE jobs/:id cancels a running job and removes it and its files. */
const removeJob: Handler = async ({ params, client: c }, ctx) => {
  const s = stores();
  const j = s.jobs.get(params.id);
  if (!j || j.clientId !== c.id) return ctx.fail(c, 404, "Not found.", { code: "not_found" });
  if (j.state === "running" || j.state === "queued") ctx.queue.cancel(params.id);
  await s.jobs.remove(params.id);
  return ctx.reply(c, { ok: true });
};

const download: Handler = async ({ params, client: c }, ctx) => {
  const s = stores();
  const j = s.jobs.get(params.id);
  if (!j || j.clientId !== c.id) return ctx.fail(c, 404, "Not found.", { code: "not_found" });
  if (j.state !== "done" || !j.outputs.length) return ctx.fail(c, 409, "Not ready.", { code: "not_ready" });
  const out = j.outputs[0];
  const file = createReadStream(join(s.jobs.dir(j.id), out.file));
  const slow = throttle(j.bandwidthMbit);
  let body: Readable = file;
  if (slow) {
    // pipeline (not .pipe) so the file is closed when the client goes away
    void pipeline(file, slow).catch(() => {});
    body = slow;
  }
  return new Response(Readable.toWeb(body) as unknown as ReadableStream, {
    headers: {
      "Content-Type": out.name.endsWith(".zip") ? "application/zip" : "application/octet-stream",
      "Content-Length": String(out.size),
      "Content-Disposition": contentDisposition(out.name),
      "Cache-Control": "no-store",
    },
  });
};

/** GET zip?ids=a,b,c -> every finished result of those jobs in one streamed ZIP */
const zip: Handler = async ({ url, client: c }, ctx) => {
  const s = stores();
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 100);
  const jobs = ids.map((id) => s.jobs.get(id)).filter((j): j is JobRecord => !!j && j.clientId === c.id && j.state === "done" && j.outputs.length > 0);
  if (!jobs.length) return ctx.fail(c, 404, "Nothing to zip.", { code: "nothing_to_zip" });

  const archive = archiver("zip", { store: true }); // results are mostly compressed already
  // archive.abort() doesn't close the file it is in the middle of reading, so the sources are ours to close
  const sources: Readable[] = [];
  const used = new Set<string>();
  for (const j of jobs) {
    let name = j.outputs[0].name;
    for (let n = 2; used.has(name); n++) name = `${safeBase(j.outputs[0].name)}-${n}${name.slice(name.lastIndexOf("."))}`;
    const path = join(s.jobs.dir(j.id), j.outputs[0].file);
    const st = await stat(path).catch(() => null);
    if (!st) continue; // swept since the job list was read
    used.add(name);
    const src = createReadStream(path);
    // a file swept or unreadable after the stat above: an error with nobody listening would take the whole server down
    src.on("error", () => archive.abort());
    sources.push(src);
    archive.append(src, { name, date: st.mtime });
  }
  if (!sources.length) return ctx.fail(c, 404, "Nothing to zip.", { code: "nothing_to_zip" });
  const caps = jobs.map((j) => j.bandwidthMbit).filter((v): v is number => v !== null);
  const body = throttle(caps.length === jobs.length ? Math.min(...caps) : null) ?? new PassThrough();
  // pipeline attaches the error handler archiver needs (an unhandled 'error' would take the whole server down) and, when the
  // client disconnects or the archive fails, stops the archive and closes the files; the no-op listener covers an error that
  // arrives after the pipeline has finished
  archive.on("error", () => {});
  void pipeline(archive, body).catch(() => {
    archive.abort();
    for (const src of sources) src.destroy();
  });
  void archive.finalize().catch(() => {});
  return new Response(Readable.toWeb(body) as unknown as ReadableStream, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="jimkit-results.zip"', "Cache-Control": "no-store" },
  });
};

let probe: Probe = { engines: [], missing: [] };

/** GET engines -> what this machine can actually run, so the browser only offers real conversions */
const engines: Handler = ({ client: c }, ctx) => ctx.reply(c, { engines: probe.engines, missing: probe.missing });

export default defineServer({
  check() {
    const pkgs = [...new Set(probe.missing.map((m) => m.package))];
    const heavy = probe.engines.filter((e) => e !== "data");
    if (!heavy.length) {
      return { ok: true, note: "Only CSV, TSV, JSON and YAML in this image. Video, images, documents and PDFs need the full one." };
    }
    if (pkgs.length) return { ok: true, note: `Some conversions are unavailable: missing ${pkgs.join(", ")}.` };
    return { ok: true };
  },
  async onStart(ctx) {
    probe = probeEngines();
    setAvailableEngines(probe.engines);
    ctx.log.info(`engines: ${probe.engines.join(", ")}${probe.missing.length ? ` (missing: ${probe.missing.map((m) => m.engine).join(", ")})` : ""}`);
    settings.threads = ctx.engineThreads;
    settings.dataDir = ctx.dataDir;
    const s = openStores(ctx);
    await ctx.ready();
    await failInterrupted(s).catch(() => {});
    // warm LibreOffice in the background so the first document conversion doesn't pay for building its profile (only where it is installed)
    if (probe.engines.includes("libreoffice")) void warmLibreOffice();
  },
  routes: {
    "GET engines": engines,
    "PUT upload": upload,
    "DELETE upload/:id": removeUpload,
    "POST convert": convert,
    "GET jobs": listJobs,
    "GET jobs/zip": zip,
    "DELETE jobs/:id": removeJob,
    "GET jobs/:id/download": download,
  },
});
