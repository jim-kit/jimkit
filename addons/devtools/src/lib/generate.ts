/** Random IDs, passwords and byte strings. Every random choice goes through one function that takes the bytes from a `fill`, so tests can feed it known bytes. */

export type Fill = (buf: Uint8Array) => Uint8Array;
export const cryptoFill: Fill = (buf) => crypto.getRandomValues(buf);

/** getRandomValues takes at most 65536 bytes per call */
export function randomBytes(n: number, fill: Fill = cryptoFill): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) fill(out.subarray(i, Math.min(n, i + 65536)));
  return out;
}

/** A uniform integer in [0, max). Draws that fall in the uneven tail of the 32-bit range are thrown away, so there is no modulo bias. */
export function uniformInt(max: number, fill: Fill = cryptoFill): number {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new RangeError("max must be an integer from 1 to 2^32");
  if (max === 1) return 0;
  const limit = 2 ** 32 - (2 ** 32 % max);
  const buf = new Uint32Array(1);
  for (;;) {
    fill(new Uint8Array(buf.buffer));
    if (buf[0] < limit) return buf[0] % max;
  }
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/* ───────── UUID ───────── */

function formatUuid(b: Uint8Array): string {
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function uuid4(fill: Fill = cryptoFill): string {
  const b = randomBytes(16, fill);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return formatUuid(b);
}

/** RFC 9562 v7 layout: 48 bits of Unix ms, version 7, 12 bits (here a counter), variant 10, 62 random bits. */
export function uuid7Layout(ms: number, counter: number, rest: Uint8Array): string {
  const b = new Uint8Array(16);
  const t = BigInt(ms);
  for (let i = 0; i < 6; i++) b[i] = Number((t >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = 0x70 | ((counter >> 8) & 0x0f);
  b[7] = counter & 0xff;
  b.set(rest.subarray(0, 8), 8);
  b[8] = (b[8] & 0x3f) | 0x80;
  return formatUuid(b);
}

/** `count` v7 UUIDs that sort in the order they were made, even inside one millisecond: the 12-bit field counts up, and rolls into the next millisecond when it runs out. */
export function uuid7Batch(count: number, now = Date.now(), fill: Fill = cryptoFill): string[] {
  const out: string[] = [];
  let ms = now;
  let counter = uniformInt(0x800, fill); // start in the lower half so a normal batch never rolls over
  for (let i = 0; i < count; i++) {
    out.push(uuid7Layout(ms, counter, randomBytes(8, fill)));
    if (++counter > 0xfff) { counter = 0; ms++; }
  }
  return out;
}

/** The time a v7 UUID was made, or null when it isn't one */
export function uuid7Time(id: string): Date | null {
  const m = /^([0-9a-f]{8})-?([0-9a-f]{4})-?7[0-9a-f]{3}-?[89ab][0-9a-f]{3}-?[0-9a-f]{12}$/i.exec(id.trim());
  return m ? new Date(parseInt(m[1] + m[2], 16)) : null;
}

/* ───────── ULID ───────── */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulidFrom(ms: number, rand: Uint8Array): string {
  let n = BigInt(ms);
  for (let i = 0; i < 10; i++) n = (n << 8n) | BigInt(rand[i]);
  let s = "";
  for (let i = 0; i < 26; i++) { s = CROCKFORD[Number(n & 31n)] + s; n >>= 5n; }
  return s;
}

/** Monotonic like the ULID spec asks: inside one millisecond the random part is incremented, so a batch stays sorted. */
export function ulidBatch(count: number, now = Date.now(), fill: Fill = cryptoFill): string[] {
  const out: string[] = [];
  let r = BigInt("0x" + hex(randomBytes(10, fill)));
  for (let i = 0; i < count; i++) {
    const bytes = Uint8Array.from({ length: 10 }, (_, k) => Number((r >> BigInt(8 * (9 - k))) & 0xffn));
    out.push(ulidFrom(now, bytes));
    r = (r + 1n) & ((1n << 80n) - 1n);
    if (r === 0n) now++;
  }
  return out;
}

export function ulidTime(id: string): Date | null {
  const s = id.trim().toUpperCase();
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(s) || s[0] > "7") return null;
  let n = 0;
  for (const c of s.slice(0, 10)) n = n * 32 + CROCKFORD.indexOf(c);
  return new Date(n);
}

/* ───────── NanoID-style ───────── */

export const NANO_ALPHABETS = {
  url: { label: "URL-safe (A-Z a-z 0-9 _ -)", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-" },
  alnum: { label: "Letters and digits", chars: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" },
  lower: { label: "Lowercase and digits", chars: "0123456789abcdefghijklmnopqrstuvwxyz" },
  hex: { label: "Hex", chars: "0123456789abcdef" },
  digits: { label: "Digits", chars: "0123456789" },
} as const;

export function randomString(alphabet: string, length: number, fill: Fill = cryptoFill): string {
  const chars = Array.from(new Set(Array.from(alphabet))); // repeated characters would skew the odds
  if (chars.length < 2) throw new RangeError("The alphabet needs at least two different characters");
  let s = "";
  for (let i = 0; i < length; i++) s += chars[uniformInt(chars.length, fill)];
  return s;
}

/* ───────── passwords ───────── */

export const SETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/~",
} as const;
export type SetId = keyof typeof SETS;
export const AMBIGUOUS = "Il1|O0o";

export interface PasswordOptions { length: number; sets: SetId[]; noAmbiguous: boolean }

export function passwordPools(o: PasswordOptions): string[] {
  return o.sets.map((id) => (o.noAmbiguous ? Array.from(SETS[id]).filter((c) => !AMBIGUOUS.includes(c)).join("") : SETS[id])).filter(Boolean);
}

/** Roughly how hard the password is to guess, in bits. Slightly generous: forcing one of each set removes a few combinations. */
export function passwordBits(o: PasswordOptions): number {
  const size = new Set(passwordPools(o).join("")).size;
  return size > 1 ? o.length * Math.log2(size) : 0;
}

/** One character from every chosen set, the rest from all of them, then a Fisher-Yates shuffle with unbiased picks. */
export function password(o: PasswordOptions, fill: Fill = cryptoFill): string {
  const pools = passwordPools(o);
  if (!pools.length) throw new RangeError("Choose at least one set of characters");
  if (o.length < pools.length) throw new RangeError(`Use at least ${pools.length} characters for these sets`);
  const all = Array.from(new Set(pools.join("")));
  const out = pools.map((p) => p[uniformInt(p.length, fill)]);
  while (out.length < o.length) out.push(all[uniformInt(all.length, fill)]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = uniformInt(i + 1, fill);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

/* ───────── random bytes ───────── */

export type ByteFormat = "hex" | "base64" | "base64url";

export function encodeBytes(b: Uint8Array, format: ByteFormat): string {
  if (format === "hex") return hex(b);
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  const b64 = btoa(bin);
  return format === "base64" ? b64 : b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
