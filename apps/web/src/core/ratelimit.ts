// In-memory brute-force limiter for the unlock code. One instance of the app runs, so memory is enough.
export interface AttemptState {
  allowed: boolean;
  retryAfterMs: number;
  attemptsLeft: number;
}

interface Options {
  maxFailures: number;
  windowMs: number;
  lockoutMs: number;
  now?: () => number;
}

interface Entry {
  failures: number[];
  lockedUntil: number;
}

export class AttemptLimiter {
  private entries = new Map<string, Entry>();
  private now: () => number;

  constructor(private opts: Options) {
    this.now = opts.now ?? Date.now;
  }

  check(key: string): AttemptState {
    const t = this.now();
    const e = this.entries.get(key);
    if (!e) return { allowed: true, retryAfterMs: 0, attemptsLeft: this.opts.maxFailures };
    if (e.lockedUntil > t) return { allowed: false, retryAfterMs: e.lockedUntil - t, attemptsLeft: 0 };
    e.failures = e.failures.filter((f) => t - f < this.opts.windowMs);
    return { allowed: true, retryAfterMs: 0, attemptsLeft: Math.max(0, this.opts.maxFailures - e.failures.length) };
  }

  fail(key: string): AttemptState {
    const t = this.now();
    const e = this.entries.get(key) ?? { failures: [], lockedUntil: 0 };
    e.failures = e.failures.filter((f) => t - f < this.opts.windowMs);
    e.failures.push(t);
    if (e.failures.length >= this.opts.maxFailures) {
      e.lockedUntil = t + this.opts.lockoutMs;
      e.failures = [];
    }
    this.entries.set(key, e);
    this.prune();
    return this.check(key);
  }

  success(key: string): void {
    this.entries.delete(key);
  }

  private prune(): void {
    if (this.entries.size < 5000) return;
    const t = this.now();
    for (const [k, e] of this.entries) {
      if (e.lockedUntil < t && e.failures.every((f) => t - f > this.opts.windowMs)) this.entries.delete(k);
    }
  }
}

// 5 wrong codes per IP in 15 minutes locks that IP out for an hour.
export const perIpLimiter = new AttemptLimiter({ maxFailures: 5, windowMs: 15 * 60_000, lockoutMs: 60 * 60_000 });
// A slower global brake against a distributed guesser.
export const globalLimiter = new AttemptLimiter({ maxFailures: 40, windowMs: 15 * 60_000, lockoutMs: 15 * 60_000 });
