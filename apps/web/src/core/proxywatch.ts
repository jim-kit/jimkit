import { proxyMismatch } from "./net";

/**
 * Remembers (in memory, since the last start) the last time a page request didn't fit JIMKIT_PROXY_HOPS. `jimkit doctor` reads it
 * through /api/health to tell the owner their proxy setting is off. Nothing here changes who is trusted.
 */
export interface ProxyWatch {
  /** hops is 0 but forwarding headers arrived */
  unexpectedAt: number | null;
  /** hops is above 0 but a request came without enough X-Forwarded-For entries */
  missingAt: number | null;
}

const g = globalThis as unknown as { __jkProxyWatch?: ProxyWatch };
const state = (): ProxyWatch => (g.__jkProxyWatch ??= { unexpectedAt: null, missingAt: null });

export function noteProxy(h: { get(name: string): string | null }, hops: number, now = Date.now()): void {
  const m = proxyMismatch(h, hops);
  if (m === "unexpected") state().unexpectedAt = now;
  else if (m === "missing") state().missingAt = now;
}

export function proxyWatch(): ProxyWatch {
  return { ...state() };
}
