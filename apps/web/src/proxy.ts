import { NextResponse, type NextRequest } from "next/server";

/**
 * A strict Content-Security-Policy with a fresh nonce per request. Scripts run only if they come from this origin or carry the
 * nonce Next puts on its own tags (and anything those load, via 'strict-dynamic'), so an injected <script> does nothing, and a
 * badly behaved addon can't quietly load code from somewhere else or send data to another site.
 */
export function proxy(req: NextRequest) {
  const dev = process.env.NODE_ENV !== "production";
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // React sets style attributes, which a nonce can't cover
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);
  return res;
}

export const config = {
  // pages only: the API and static files don't need a policy (JSON and assets), and skipping them keeps them cacheable
  matcher: [{ source: "/((?!api|_next/static|_next/image|icon.svg|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] }],
};
