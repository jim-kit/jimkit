import type { Limits, Tier } from "@jimkit/sdk";
import type { Config } from "./config";
import { clientIp, hostAllowed, isTrustedIp } from "./net";
import { verifyToken } from "./unlock";

export interface Session {
  tier: Tier;
  ip: string | null;
  limits: Limits;
  /** ms epoch, only for the unlocked tier */
  expiresAt: number | null;
  unlockAvailable: boolean;
  /** the address in the browser's bar is not one this instance answers to, so it is treated as public (see hostAllowed in net.ts) */
  hostRefused: boolean;
}

interface Reader {
  get(name: string): string | null;
}

/** Pure, so it can be tested without Next. */
export function resolveSession(h: Reader, cookie: string | undefined, cfg: Config, now = Date.now(), assume?: Tier): Session {
  const ip = clientIp(h, cfg.proxyHops);
  let tier: Tier = "public";
  let expiresAt: number | null = null;
  const host = (cfg.proxyHops > 0 ? h.get("x-forwarded-host") : null) ?? h.get("host");
  const hostRefused = !hostAllowed(host, { allowed: cfg.allowedHosts, proxyHops: cfg.proxyHops });

  if (hostRefused) {
    // a page of someone else's pointing its own name at this machine: whatever the peer address says, it is not your own page
  } else if (isTrustedIp(ip, cfg.trusted)) {
    tier = "trusted";
  } else if (cfg.unlockEnabled) {
    const payload = verifyToken(cookie, cfg.sessionSecret, now);
    if (payload) {
      tier = "unlocked";
      expiresAt = payload.exp;
    }
  }

  // development convenience for screenshots, never honoured in production
  if (assume && process.env.NODE_ENV !== "production") {
    tier = assume;
    expiresAt = assume === "unlocked" ? now + 47 * 60_000 : null;
  }
  return { tier, ip, limits: cfg.limits[tier], expiresAt, unlockAvailable: cfg.unlockEnabled, hostRefused };
}

