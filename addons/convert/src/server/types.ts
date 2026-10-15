import type { BaseRecord } from "@jimkit/sdk";
import type { Route } from "../lib/registry/plan";

export interface UploadRecord extends BaseRecord {
  name: string;
  ext: string;
  size: number;
}

export type JobState = "queued" | "running" | "done" | "failed";

export interface Quality {
  level: "low" | "balanced" | "high";
  /** longest side in pixels for images and video; 0 keeps the original size */
  maxDim: number;
}

export interface OutputFile {
  name: string;
  size: number;
  /** path relative to the job directory */
  file: string;
}

export interface JobRecord extends BaseRecord {
  uploadId: string;
  name: string;
  from: string;
  to: string;
  route: Route;
  quality: Quality;
  state: JobState;
  /** 0..1, or -1 when the engine can't report it */
  progress: number;
  step: number;
  error?: string;
  outputs: OutputFile[];
  started?: number;
  /** limits that applied when the job was created */
  timeoutSec: number;
  concurrency: number;
  bandwidthMbit: number | null;
}

/** What the browser sees. No paths, no addresses. */
export interface JobView {
  id: string;
  name: string;
  from: string;
  to: string;
  state: JobState;
  progress: number;
  step: number;
  steps: number;
  error?: string;
  outputs: { name: string; size: number }[];
  queuePosition?: number;
}
