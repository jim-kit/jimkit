import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { safeBase } from "@jimkit/sdk/server";
import { ENGINES } from "./engines";
import type { JobRecord, OutputFile } from "./types";

const FAST = { level: "high", maxDim: 0 } as const; // intermediate steps keep as much as they can

async function zip(files: string[], dest: string, base: string, to: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(dest);
    const a = archiver("zip", { zlib: { level: 6 } });
    out.on("close", () => resolve());
    // without these a full disk or an unreadable file is an unhandled 'error' event, which ends the whole process
    out.on("error", reject);
    a.on("error", reject);
    a.pipe(out);
    const pad = String(files.length).length;
    files.forEach((f, i) => a.file(f, { name: `${base}-${String(i + 1).padStart(pad, "0")}.${to}` }));
    void a.finalize();
  });
}

/**
 * Runs a job's whole route. `input` is the uploaded file, `dir` the job's own directory.
 * Reports overall progress as 0..1 and returns the files left in `dir/out`.
 */
export async function runJob(job: JobRecord, input: string, dir: string, onProgress: (p: number, step: number) => void, signal: AbortSignal): Promise<OutputFile[]> {
  const work = join(dir, "work");
  const out = join(dir, "out");
  await rm(out, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  await mkdir(out, { recursive: true });

  try {
    const deadline = Date.now() + job.timeoutSec * 1000;
    const steps = job.route.steps;
    let files = [input];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const last = i === steps.length - 1;
      const produced: string[] = [];
      for (let n = 0; n < files.length; n++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("The conversion took too long and was stopped.");
        const stepDir = join(work, `s${i}-${n}`);
        await mkdir(stepDir, { recursive: true });
        const made = await ENGINES[step.engine]({
          input: files[n],
          inputExt: step.from,
          to: step.to,
          output: join(stepDir, `result.${step.to}`),
          outDir: stepDir,
          quality: last ? job.quality : FAST,
          timeoutMs: remaining,
          signal,
          onProgress: (p) => onProgress((i + (n + p) / files.length) / steps.length, i),
        });
        produced.push(...made);
      }
      files = produced;
      if (i > 0) await rm(join(work, `s${i - 1}-0`), { recursive: true, force: true }).catch(() => {});
      onProgress((i + 1) / steps.length, Math.min(i + 1, steps.length - 1));
    }

    const base = safeBase(job.name);
    const finalTo = steps[steps.length - 1].to;
    let outputs: OutputFile[];
    if (files.length === 1) {
      await copyFile(files[0], join(out, "0"));
      outputs = [{ name: `${base}.${finalTo}`, size: (await stat(join(out, "0"))).size, file: "out/0" }];
    } else {
      await zip(files, join(out, "0"), base, finalTo);
      outputs = [{ name: `${base}.zip`, size: (await stat(join(out, "0"))).size, file: "out/0" }];
    }
    return outputs;
  } finally {
    // a failed or cancelled job leaves its half-finished work behind otherwise, and it isn't counted against anyone's quota
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
