import type { Quality } from "../types";

export interface StepContext {
  input: string;
  inputExt: string;
  /** target extension */
  to: string;
  /** where a single-file result must be written */
  output: string;
  /** a scratch directory this step may fill (multi-file results, profiles) */
  outDir: string;
  quality: Quality;
  timeoutMs: number;
  signal: AbortSignal;
  /** 0..1 */
  onProgress: (p: number) => void;
}

/** Returns the absolute paths of the files it produced. */
export type Engine = (ctx: StepContext) => Promise<string[]>;
