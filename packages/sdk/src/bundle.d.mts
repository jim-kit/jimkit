import type { AddonManifest } from "./index";

export const BUNDLE_FORMAT: 1;
export const ADDON_API_VERSION: 1;
export const BUNDLE_ASSET: "jimkit-kit.json";
export const BUNDLE_FILES: readonly ["client.js", "client.css", "server.js", "theme.css"];
export const RESERVED_THEMES: readonly string[];
export function themeCssProblem(css: string): string | null;
export const MAX_FILE_BYTES: number;
export const MAX_BUNDLE_BYTES: number;

/** The files of an addon: its browser code, its stylesheet and its server code. */
export interface AddonBundle {
  format: 1;
  manifest: AddonManifest;
  files: Partial<Record<"client.js" | "client.css" | "server.js" | "theme.css", string>>;
}

export function settingsProblem(defs: unknown): string | null;
export function manifestProblem(manifest: unknown): string | null;
export function validateBundle(value: unknown): { ok: true; bundle: AddonBundle } | { ok: false; error: string };
export function compareVersions(a: string, b: string): -1 | 0 | 1;

export interface Source {
  user: string;
  name: string;
  /** lowercase "user/name" */
  key: string;
  version?: string;
}
export function parseSource(input: string): Source | null;
