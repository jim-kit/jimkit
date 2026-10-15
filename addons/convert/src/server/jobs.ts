import { ExecError } from "@jimkit/sdk/server";
import type { Records, ServerContext } from "@jimkit/sdk";
import { join } from "node:path";
import { ENGINE_LABEL } from "./engines";
import { runJob } from "./runner";
import type { JobRecord, JobView, UploadRecord } from "./types";

export interface Stores {
  uploads: Records<UploadRecord>;
  jobs: Records<JobRecord>;
}

const g = globalThis as unknown as { __jkConvert?: Stores };
export const stores = (): Stores => g.__jkConvert!;

/** Uploads referenced by a job that hasn't finished must not be swept. */
export function openStores(ctx: ServerContext): Stores {
  const jobs = ctx.records<JobRecord>("jobs", { isBusy: (j) => j.state === "queued" || j.state === "running" });
  const uploads = ctx.records<UploadRecord>("uploads", { isBusy: (u) => jobs.all().some((j) => j.uploadId === u.id && (j.state === "queued" || j.state === "running")) });
  return (g.__jkConvert = { uploads, jobs });
}

export const uploadFile = (s: Stores, u: UploadRecord) => join(s.uploads.dir(u.id), `input.${u.ext}`);

/** A restart leaves jobs that were running or waiting. They can't resume, so say so instead of leaving them spinning. */
export async function failInterrupted(s: Stores): Promise<void> {
  for (const j of s.jobs.all()) {
    if (j.state === "queued" || j.state === "running") {
      await s.jobs.put({ ...j, state: "failed", error: "The server restarted while this was running. Try again.", finished: Date.now() });
    }
  }
}

export const activeFor = (s: Stores, ip: string) => s.jobs.all().filter((j) => j.ip === ip && (j.state === "queued" || j.state === "running")).length;

export function viewOf(ctx: ServerContext, job: JobRecord): JobView {
  return {
    id: job.id,
    name: job.name,
    from: job.from,
    to: job.to,
    state: job.state,
    progress: job.progress,
    step: job.step,
    steps: job.route.steps.length,
    error: job.error,
    outputs: job.outputs.map((o) => ({ name: o.name, size: o.size })),
    queuePosition: job.state === "queued" ? ctx.queue.position(job.id) ?? undefined : undefined,
  };
}

/** Save the job, then hand it to the host's queue. The promise resolves when the job is finished (done or failed). */
export async function enqueue(ctx: ServerContext, s: Stores, job: JobRecord): Promise<void> {
  await s.jobs.put({ ...job, bytes: 0 });
  void ctx.queue
    .submit({ id: job.id, key: job.ip, perKey: job.concurrency, run: (signal) => start(ctx, s, job.id, signal) })
    .catch(async (e) => {
      // cancelled while waiting
      const j = s.jobs.get(job.id);
      if (j && j.state === "queued") await s.jobs.put({ ...j, state: "failed", error: e instanceof Error ? e.message : "Cancelled.", finished: Date.now() });
    })
    .catch((e) => ctx.log.error(`job ${job.id}: couldn't record its failure:`, e));
}

async function start(ctx: ServerContext, s: Stores, id: string, signal: AbortSignal): Promise<void> {
  const job = s.jobs.get(id);
  if (!job) return;
  const upload = s.uploads.get(job.uploadId);
  let cur: JobRecord = { ...job, state: "running", started: Date.now(), progress: 0 };
  await s.jobs.put(cur);
  let lastSave = 0;
  try {
    if (!upload) throw new Error("The uploaded file is gone. Upload it again.");
    const outputs = await runJob(cur, uploadFile(s, upload), s.jobs.dir(id), (p, step) => {
      if (!s.jobs.get(id)) return; // removed while running: don't write it back
      cur = { ...cur, progress: p, step };
      s.jobs.touch(cur);
      if (Date.now() - lastSave > 1500) {
        lastSave = Date.now();
        void s.jobs.put(cur).catch(() => {});
      }
    }, signal);
    cur = { ...cur, state: "done", progress: 1, outputs, bytes: outputs.reduce((n, o) => n + o.size, 0) };
  } catch (e) {
    const step = cur.route.steps[Math.min(cur.step, cur.route.steps.length - 1)];
    const label = ENGINE_LABEL[step.engine];
    let error: string;
    if (e instanceof ExecError) {
      ctx.log.error(`job ${id} (${step.engine}): ${e.message}\n${e.detail}`);
      error = e.message.includes("too long") || e.message === "Cancelled." ? e.message : `The ${label} couldn't read this file. It may be damaged or not really ${step.from.toUpperCase()}.`;
    } else {
      ctx.log.error(`job ${id}:`, e);
      // our own messages are written for people; file system errors carry paths from the data directory and stay in the log
      const own = e instanceof Error && e.message.length < 200 && !("syscall" in e) && !("errno" in e);
      error = own ? e.message : `The ${label} failed.`;
    }
    cur = { ...cur, state: "failed", error };
  } finally {
    cur = { ...cur, finished: Date.now() };
    if (s.jobs.get(id)) await s.jobs.put(cur).catch(() => {});
    // the uploaded original is no longer needed: free its space and its place in the client's limits
    await s.uploads.remove(job.uploadId).catch(() => {});
  }
}
