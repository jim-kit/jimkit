import { cookies, headers } from "next/headers";
import type { SessionView, Tier } from "@jimkit/sdk";
import { config } from "./config";
import { noteProxy } from "./proxywatch";
import { resolveSession, type Session } from "./resolve";
import { COOKIE_NAME } from "./unlock";

export { resolveSession, type Session };

export async function getServerSession(assume?: Tier): Promise<Session> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  const cfg = config();
  noteProxy(h, cfg.proxyHops);
  return resolveSession(h, c.get(COOKIE_NAME)?.value, cfg, Date.now(), assume);
}

export function sessionView(s: Session): SessionView {
  return {
    tier: s.tier,
    ip: s.ip,
    limits: s.limits,
    expiresAt: s.expiresAt,
    now: Date.now(),
    unlockAvailable: s.unlockAvailable,
    hostRefused: s.hostRefused || undefined,
    ttlMinutes: Math.round(config().ttlMs / 60_000),
  };
}
