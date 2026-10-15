import { cookies } from "next/headers";
import { config } from "@/core/config";
import { isHttps, json, readJson, sameOrigin } from "@/core/http";
import { limiterKey } from "@/core/net";
import { globalLimiter, perIpLimiter } from "@/core/ratelimit";
import { getServerSession, sessionView } from "@/core/session";
import { COOKIE_NAME, signToken, verifyCode } from "@/core/unlock";

export const dynamic = "force-dynamic";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  if (!sameOrigin(req, config().proxyHops)) return json({ error: "forbidden" }, { status: 403 });

  const cfg = config();
  const session = await getServerSession();
  if (session.tier === "trusted") return json(sessionView(session)); // nothing to unlock
  if (!cfg.unlockEnabled) return json({ error: "unlock_unavailable" }, { status: 503 });

  const body = (await readJson(req, 1024)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim().slice(0, 64) : "";

  // From here to the failure count nothing awaits, so a burst of parallel guesses can't all slip past the limiter before the
  // first miss is recorded.
  const key = limiterKey(session.ip);
  const ip = perIpLimiter.check(key);
  const global = globalLimiter.check("global");
  if (!ip.allowed || !global.allowed) {
    const retryAfter = Math.ceil(Math.max(ip.retryAfterMs, global.retryAfterMs) / 1000);
    return json({ error: "locked_out", retryAfterSec: retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }
  if (!code) return json({ error: "missing_code" }, { status: 400 });

  if (!verifyCode(code, cfg.codeHash)) {
    perIpLimiter.fail(key);
    globalLimiter.fail("global");
    await sleep(400);
    const after = perIpLimiter.check(key);
    if (!after.allowed) {
      const retryAfter = Math.ceil(after.retryAfterMs / 1000);
      return json({ error: "locked_out", retryAfterSec: retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
    }
    return json({ error: "wrong_code", attemptsLeft: after.attemptsLeft }, { status: 401 });
  }

  perIpLimiter.success(key);
  const now = Date.now();
  const exp = now + cfg.ttlMs;
  (await cookies()).set(COOKIE_NAME, signToken({ v: 1, iat: now, exp }, cfg.sessionSecret), {
    httpOnly: true,
    secure: isHttps(req),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(cfg.ttlMs / 1000),
  });
  return json(sessionView({ ...session, tier: "unlocked", limits: cfg.limits.unlocked, expiresAt: exp }));
}
