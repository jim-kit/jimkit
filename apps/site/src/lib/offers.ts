import type { FileAction } from "./catalog";

/** Which tools can take a file, by the same rules the app uses (apps/web/src/ui/catalog.ts): extension or MIME type, `*` for anything. */
const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export function fileMatches(f: { name: string; type: string }, accept: FileAction["accept"]): boolean {
  if (accept.ext?.includes("*") || accept.mime?.includes("*/*")) return true;
  const ext = extOf(f.name);
  if (accept.ext?.some((e) => e.toLowerCase() === ext)) return true;
  return !!accept.mime?.some((m) => (m.endsWith("/*") ? f.type.startsWith(m.slice(0, -1)) : f.type === m));
}

/** Matching actions, best first. */
export const offersFor = (f: { name: string; type: string }, actions: FileAction[]) =>
  actions.filter((a) => fileMatches(f, a.accept)).sort((a, b) => b.priority - a.priority);
