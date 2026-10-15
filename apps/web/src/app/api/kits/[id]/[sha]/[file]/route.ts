import { readFile } from "node:fs/promises";
import { kitFile } from "@/core/store/kits";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { "client.js": "text/javascript; charset=utf-8", "client.css": "text/css; charset=utf-8", "theme.css": "text/css; charset=utf-8" };

/**
 * The browser's half of an installed kit. The hash in the URL names one exact version, so the answer never changes and can be
 * cached for good. server.js is never served.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; sha: string; file: string }> }) {
  const { id, sha, file } = await params;
  const path = kitFile(id, sha, file);
  if (!path) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(await readFile(path)), {
    headers: { "Content-Type": TYPES[file], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
