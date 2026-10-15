import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let cached: string | undefined;

/**
 * The version of this Jimkit: the root package.json, which the image copies next to the app (/app/package.json) and `npm run dev` finds two
 * folders up. JIMKIT_VERSION overrides it; "dev" when neither is there.
 */
export function appVersion(): string {
  if (cached) return cached;
  let v = process.env.JIMKIT_VERSION?.trim();
  if (!v) {
    try { v = (JSON.parse(readFileSync(resolve(process.cwd(), "../../package.json"), "utf8")) as { version?: string }).version; } catch { /* not found */ }
  }
  return (cached = v || "dev");
}

/** For tests: forget what was read. */
export const resetVersion = () => { cached = undefined; };
