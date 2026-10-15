import { randomBytes } from "node:crypto";
import type { ServerClient } from "@jimkit/sdk";
import { config } from "./config";
import { isHttps } from "./http";
import { clientIp, isTrustedIp } from "./net";
import { resolveSession } from "./session";
import { COOKIE_NAME } from "./unlock";

const COOKIE = "jk_cid";

function readCookie(req: Request, name: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.get("cookie") ?? "");
  return m ? m[1] : null;
}

/** Who is calling: their session tier and limits, and a stable random id (cookie) that owns their uploads and jobs. */
export function identify(req: Request): ServerClient {
  const cfg = config();
  const s = resolveSession(req.headers, readCookie(req, COOKIE_NAME) ?? undefined, cfg);
  const existing = readCookie(req, COOKIE);
  const id = existing && /^[0-9a-f]{32}$/.test(existing) ? existing : randomBytes(16).toString("hex");
  const secure = isHttps(req) ? "; Secure" : "";
  return {
    id,
    ip: s.ip ?? "unknown",
    tier: s.tier,
    limits: s.limits,
    expiresAt: s.expiresAt,
    setCookie: existing === id ? undefined : `${COOKIE}=${id}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`,
  };
}

export { clientIp, isTrustedIp };
