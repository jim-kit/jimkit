"use client";

import type { Limits, Tier } from "@jimkit/sdk";
import { formatBytes, haptic, toast } from "@jimkit/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectKind, type FileKind } from "../lib/filekinds";
import { extOf } from "../lib/registry/formats";
import { canConvertFrom, targetsFor, type TargetGroup } from "../lib/registry/plan";
import type { JobView } from "../server/types";
import { ApiError, downloadHref, pollJobs, removeJob, removeUpload, startJobs, uploadFile, zipHref } from "./api";

export interface ConvertState {
  /** chosen target extension */
  to: string | null;
  phase: "idle" | "uploading" | "queued" | "running" | "done" | "failed";
  uploadProgress: number;
  /** 0..1 while converting, -1 when the engine can't say */
  jobProgress: number;
  queuePosition?: number;
  step: number;
  steps: number;
  uploadId?: string;
  jobId?: string;
  error?: string;
  outName?: string;
  outSize?: number;
}

export interface Item {
  id: string;
  file: File;
  kind: FileKind;
  ext: string;
  status: "ok" | "rejected";
  reason?: string;
  /** false when the registry has no conversions for this type */
  convertible: boolean;
  convert: ConvertState;
}

export type QualityLevel = "low" | "balanced" | "high";
export interface QualitySettings { level: QualityLevel; maxDim: number }

const IDLE: ConvertState = { to: null, phase: "idle", uploadProgress: 0, jobProgress: 0, step: 0, steps: 1 };
const active = (p: ConvertState["phase"]) => p === "uploading" || p === "queued" || p === "running";

/** The converter's state: the file list, uploads (two at a time), job polling and downloads. */
export function useConverter(limits: Limits, tier: Tier) {
  const [items, setItems] = useState<Item[]>([]);
  const [quality, setQualityState] = useState<QualitySettings>({ level: "balanced", maxDim: 0 });
  const limitsRef = useRef(limits);
  limitsRef.current = limits;
  const tierRef = useRef(tier);
  tierRef.current = tier;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const seq = useRef(0);
  // Mirror of `items`, so callers decide synchronously with no side effects inside a state updater.
  const itemsRef = useRef<Item[]>([]);
  const aborts = useRef(new Map<string, AbortController>());
  const uploading = useRef(0);
  const waiting = useRef<string[]>([]);

  const commit = useCallback((next: Item[]) => { itemsRef.current = next; setItems(next); }, []);
  const patch = useCallback((id: string, fn: (c: ConvertState) => Partial<ConvertState>) => {
    commit(itemsRef.current.map((i) => (i.id === id ? { ...i, convert: { ...i.convert, ...fn(i.convert) } } : i)));
  }, [commit]);

  const add = useCallback((input: File[] | FileList) => {
    const files = Array.from(input);
    if (!files.length) return;
    const L = limitsRef.current;
    const prev = itemsRef.current;
    let count = prev.filter((i) => i.status === "ok").length;
    let bytes = prev.filter((i) => i.status === "ok").reduce((n, i) => n + i.file.size, 0);
    let rejected = 0, accepted = 0;
    const next: Item[] = [];
    for (const file of files) {
      const kind = detectKind(file.name, file.type);
      const ext = extOf(file.name);
      const id = `f${Date.now().toString(36)}${seq.current++}`;
      let reason: string | undefined;
      if (file.size > L.maxFileBytes) reason = `Over the ${formatBytes(L.maxFileBytes, 0)} per-file limit`;
      else if (count >= L.maxFiles) reason = `Max ${L.maxFiles} files per batch`;
      else if (bytes + file.size > L.maxBatchBytes) reason = `Would pass the ${formatBytes(L.maxBatchBytes, 0)} batch limit`;
      const base = { id, file, kind, ext, convertible: canConvertFrom(ext), convert: { ...IDLE } };
      if (reason) { rejected++; next.push({ ...base, status: "rejected", reason }); }
      else { accepted++; count++; bytes += file.size; next.push({ ...base, status: "ok" }); }
    }
    commit([...prev, ...next]);
    if (accepted) { haptic("success"); toast.success(accepted === 1 ? "File added" : `${accepted} files added`); }
    if (rejected) {
      haptic("error");
      toast.error(`${rejected} ${rejected === 1 ? "file" : "files"} over the limits`, { description: tierRef.current === "public" ? "Unlock with your code for the full limits." : undefined });
    }
  }, [commit]);

  const dropServerSide = useCallback((it: Item) => {
    aborts.current.get(it.id)?.abort();
    aborts.current.delete(it.id);
    waiting.current = waiting.current.filter((x) => x !== it.id);
    if (it.convert.jobId) void removeJob(it.convert.jobId);
    else if (it.convert.uploadId) void removeUpload(it.convert.uploadId);
  }, []);

  const remove = useCallback((id: string) => {
    const it = itemsRef.current.find((i) => i.id === id);
    if (it) dropServerSide(it);
    commit(itemsRef.current.filter((i) => i.id !== id));
  }, [commit, dropServerSide]);

  const clear = useCallback(() => { itemsRef.current.forEach(dropServerSide); commit([]); }, [commit, dropServerSide]);

  const setTarget = useCallback((id: string, to: string | null) => {
    patch(id, (c) => (active(c.phase) ? {} : { to, phase: "idle", error: undefined, outName: undefined, outSize: undefined, jobId: undefined }));
  }, [patch]);

  const setAllTargets = useCallback((to: string) => {
    commit(itemsRef.current.map((i) => {
      if (i.status !== "ok" || !i.convertible || active(i.convert.phase)) return i;
      const reachable = targetsFor(i.ext).some((g) => g.targets.some((t) => t.format.id === to));
      return reachable ? { ...i, convert: { ...i.convert, to, phase: "idle", error: undefined, outName: undefined, outSize: undefined, jobId: undefined } } : i;
    }));
  }, [commit]);

  const setQuality = useCallback((q: Partial<QualitySettings>) => setQualityState((p) => ({ ...p, ...q })), []);

  const fail = useCallback((id: string, e: unknown) => {
    if (e instanceof ApiError && e.code === "aborted") return;
    patch(id, () => ({ phase: "failed", error: e instanceof ApiError ? e.message : "Something went wrong." }));
    haptic("error");
  }, [patch]);

  // Upload, then create the job. Two uploads at a time; the server decides how many jobs run.
  const pipeline = useCallback(async (id: string) => {
    const it = itemsRef.current.find((i) => i.id === id);
    if (!it || !it.convert.to) return;
    const ctl = new AbortController();
    aborts.current.set(id, ctl);
    uploading.current++;
    try {
      patch(id, () => ({ phase: "uploading", uploadProgress: 0, error: undefined }));
      // the browser reports upload progress every few dozen ms; the screen only shows whole percents
      let shown = -1;
      const up = await uploadFile(it.file, (p) => {
        const pct = Math.floor(p * 100);
        if (pct !== shown) { shown = pct; patch(id, () => ({ uploadProgress: p })); }
      }, ctl.signal);
      patch(id, () => ({ uploadId: up.id, uploadProgress: 1 }));
      const [job] = await startJobs([{ uploadId: up.id, to: it.convert.to!, level: qualityRef.current.level, maxDim: qualityRef.current.maxDim }]);
      patch(id, () => ({ phase: job.state === "running" ? "running" : "queued", jobId: job.id, jobProgress: job.progress, steps: job.steps, queuePosition: job.queuePosition }));
    } catch (e) {
      fail(id, e);
    } finally {
      uploading.current--;
      aborts.current.delete(id);
      const nextId = waiting.current.shift();
      if (nextId) void pipeline(nextId);
    }
  }, [patch, fail]);

  const launch = useCallback((id: string) => {
    if (uploading.current >= 2) waiting.current.push(id);
    else void pipeline(id);
  }, [pipeline]);

  const convertOne = useCallback((id: string) => {
    const it = itemsRef.current.find((i) => i.id === id);
    if (it && it.status === "ok" && it.convert.to && (it.convert.phase === "idle" || it.convert.phase === "failed")) launch(id);
  }, [launch]);

  const convertAll = useCallback(() => {
    const todo = itemsRef.current.filter((i) => i.status === "ok" && i.convert.to && (i.convert.phase === "idle" || i.convert.phase === "failed"));
    if (!todo.length) return;
    haptic("select");
    todo.forEach((i) => launch(i.id));
  }, [launch]);

  // Poll the server while anything is in flight.
  const activeKey = items.filter((i) => i.convert.jobId && (i.convert.phase === "queued" || i.convert.phase === "running")).map((i) => i.convert.jobId!).join(",");
  useEffect(() => {
    if (!activeKey) return;
    let stop = false;
    const tick = async () => {
      try {
        const jobs = await pollJobs(activeKey.split(","));
        if (stop) return;
        const byId = new Map<string, JobView>(jobs.map((j) => [j.id, j]));
        commit(itemsRef.current.map((i) => {
          const j = i.convert.jobId ? byId.get(i.convert.jobId) : undefined;
          if (!j || (i.convert.phase !== "queued" && i.convert.phase !== "running")) return i;
          if (j.state === "done") { haptic("success"); return { ...i, convert: { ...i.convert, phase: "done", jobProgress: 1, outName: j.outputs[0]?.name, outSize: j.outputs[0]?.size, queuePosition: undefined } }; }
          if (j.state === "failed") return { ...i, convert: { ...i.convert, phase: "failed", error: j.error ?? "The conversion failed." } };
          return { ...i, convert: { ...i.convert, phase: j.state, jobProgress: j.progress, step: j.step, steps: j.steps, queuePosition: j.queuePosition } };
        }));
      } catch { /* transient: try again next tick */ }
    };
    const id = setInterval(tick, 800);
    return () => { stop = true; clearInterval(id); };
  }, [activeKey, commit]);

  // leaving the tool drops what the server holds for it
  useEffect(() => () => { itemsRef.current.forEach(dropServerSide); }, [dropServerSide]);

  const commonTargets = useCallback((): TargetGroup[] => {
    const eligible = itemsRef.current.filter((i) => i.status === "ok" && i.convertible);
    if (!eligible.length) return [];
    const sets = eligible.map((i) => targetsFor(i.ext));
    return sets[0]
      .map((g) => ({ kind: g.kind, targets: g.targets.filter((t) => sets.every((s) => s.some((sg) => sg.targets.some((x) => x.format.id === t.format.id)))) }))
      .filter((g) => g.targets.length);
  }, []);

  const ok = items.filter((i) => i.status === "ok");
  const doneJobIds = ok.filter((i) => i.convert.phase === "done" && i.convert.jobId).map((i) => i.convert.jobId!);
  return useMemo(() => ({
    items, okCount: ok.length, okBytes: ok.reduce((n, i) => n + i.file.size, 0),
    add, remove, clear, setTarget, setAllTargets, quality, setQuality, convertAll, convertOne, commonTargets,
    readyToConvert: ok.filter((i) => i.convert.to && (i.convert.phase === "idle" || i.convert.phase === "failed")).length,
    busy: ok.filter((i) => active(i.convert.phase)).length,
    zipUrl: doneJobIds.length > 1 ? zipHref(doneJobIds) : null,
    downloadUrl: (i: Item) => (i.convert.phase === "done" && i.convert.jobId ? downloadHref(i.convert.jobId) : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [items, quality, add, remove, clear, setTarget, setAllTargets, setQuality, convertAll, convertOne, commonTargets]);
}
