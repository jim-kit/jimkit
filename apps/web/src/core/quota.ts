// Daily processing allowance per address, for tiers that have one. In memory: a restart resets it, which is fine.
const used = new Map<string, { day: string; bytes: number }>();
const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

export function dailyUsed(ip: string, now = Date.now()): number {
  const e = used.get(ip);
  return e && e.day === dayKey(now) ? e.bytes : 0;
}

export function canUseDaily(ip: string, bytes: number, limit: number | null, now = Date.now()): boolean {
  return limit === null || dailyUsed(ip, now) + bytes <= limit;
}

export function addDaily(ip: string, bytes: number, now = Date.now()): void {
  used.set(ip, { day: dayKey(now), bytes: dailyUsed(ip, now) + bytes });
  if (used.size > 10_000) for (const [k, v] of used) if (v.day !== dayKey(now)) used.delete(k);
}

export function _resetQuota(): void {
  used.clear();
}
