export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

/**
 * State-changing requests must come from our own pages. Browsers always send Origin on POST. A proxy may rewrite Host, so
 * X-Forwarded-Host is only believed when one is in front (hops > 0); otherwise a client could send it to match its own Origin.
 */
export function sameOrigin(req: Request, hops: number): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = (hops > 0 ? req.headers.get("x-forwarded-host") : null) ?? req.headers.get("host") ?? new URL(req.url).host;
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Whether the browser reached us over HTTPS, directly or through a reverse proxy. Drives the cookie Secure flag. */
export function isHttps(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return proto.split(",")[0].trim() === "https";
}

/**
 * The JSON body of a request, or null when it is missing, not JSON, or longer than `max` bytes. Nothing past the limit is read:
 * these routes take a code or a short settings object, and anyone may send them.
 */
export async function readJson(req: Request, max = 16 * 1024): Promise<unknown> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) { await reader.cancel().catch(() => {}); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
