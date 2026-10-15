/** Integer base conversion (BigInt, so no 2^53 limit), byte sizes in SI and IEC units, and fixed-width bit views. */

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

export type Int = { ok: true; value: bigint } | { ok: false; error: string };

/** Reads an integer in `base`. A 0x, 0b or 0o prefix overrides the base; spaces, commas and underscores between digits are ignored. */
export function parseInteger(input: string, base = 10): Int {
  let s = input.trim().toLowerCase().replace(/[\s,_]/g, "");
  if (!s) return { ok: false, error: "Enter a number" };
  let neg = false;
  if (s[0] === "-" || s[0] === "+") { neg = s[0] === "-"; s = s.slice(1); }
  // 0x, 0b and 0o name a base. When the digits after one are not digits of that base, the letter was a digit of the base we are in
  // ("0bad" typed in a hex field is the number 0xbad, not an error about base 2); when they are, the prefix wins ("0b1010" is ten)
  const prefix = /^0([xbo])/.exec(s);
  if (prefix && s.length > 2) {
    const named = { x: 16, b: 2, o: 8 }[prefix[1] as "x" | "b" | "o"];
    if ([...s.slice(2)].every((ch) => { const d = DIGITS.indexOf(ch); return d >= 0 && d < named; })) { base = named; s = s.slice(2); }
  }
  if (!s) return { ok: false, error: "Enter a number" };
  let n = 0n;
  const b = BigInt(base);
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) return { ok: false, error: `"${ch}" is not a base ${base} digit` };
    n = n * b + BigInt(d);
  }
  return { ok: true, value: neg ? -n : n };
}

export const toBase = (n: bigint, base: number) => n.toString(base);

/** Digits in groups from the right, for reading */
export function group(s: string, size: number, sep = " "): string {
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const out: string[] = [];
  for (let i = body.length; i > 0; i -= size) out.unshift(body.slice(Math.max(0, i - size), i));
  return (neg ? "-" : "") + out.join(sep);
}

/* ───────── byte sizes ───────── */

export type System = "si" | "iec";
const SI = ["B", "kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
const IEC = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
export const unitNames = (s: System) => (s === "si" ? SI : IEC);
const factor = (s: System, i: number) => (s === "si" ? 1000n : 1024n) ** BigInt(i);

/** "1.5 GiB", "512", "2kb": SI units (kB, MB) are powers of 1000, IEC units (KiB, MiB) powers of 1024. Result in whole bytes, rounded. */
export function parseSize(input: string): Int {
  const m = /^\s*([+-]?)(\d[\d,_ ]*(?:\.\d+)?|\.\d+)\s*([a-z]*)\s*$/i.exec(input);
  if (!m) return { ok: false, error: "Use a number and a unit, like 1.5 GiB or 800 MB" };
  if (m[1] === "-") return { ok: false, error: "A size can't be negative" };
  const [intPart, frac = ""] = m[2].replace(/[,_ ]/g, "").split(".");
  const unit = m[3].toLowerCase();
  let idx = -1, sys: System = "si";
  if (unit === "" || unit === "b" || unit === "byte" || unit === "bytes") idx = 0;
  else {
    const si = SI.findIndex((u) => u.toLowerCase() === unit);
    const iec = IEC.findIndex((u) => u.toLowerCase() === unit);
    const short = "kmgtpezy".indexOf(unit.replace(/b$/, "")); // "k", "kb", "m"...
    if (iec > 0) { idx = iec; sys = "iec"; }
    else if (si > 0) idx = si;
    else if (short >= 0 && /^[kmgtpezy]b?$/.test(unit)) idx = short + 1;
  }
  if (idx < 0) return { ok: false, error: `"${m[3]}" is not a unit. Use B, kB, MB, GB, TB or KiB, MiB, GiB, TiB` };
  const scale = 10n ** BigInt(frac.length);
  const whole = BigInt(intPart + frac) * factor(sys, idx);
  return { ok: true, value: (whole * 2n + scale) / (scale * 2n) }; // round half up
}

/** The largest unit that keeps the number at 1 or more, with up to `digits` decimals */
export function formatSize(bytes: bigint, system: System, digits = 2): string {
  const names = unitNames(system);
  let i = 0;
  while (i < names.length - 1 && bytes >= factor(system, i + 1)) i++;
  if (i === 0) return `${bytes} B`;
  const scale = 10n ** BigInt(digits);
  let scaled = (bytes * scale * 2n + factor(system, i)) / (factor(system, i) * 2n);
  // rounded up to the next unit's size ("1024 KiB"): say it in that unit
  while (i < names.length - 1 && scaled >= (factor(system, i + 1) / factor(system, i)) * scale) {
    i++;
    scaled = (bytes * scale * 2n + factor(system, i)) / (factor(system, i) * 2n);
  }
  const whole = scaled / scale, rest = String(scaled % scale).padStart(digits, "0").replace(/0+$/, "");
  return `${whole}${rest ? "." + rest : ""} ${names[i]}`;
}

/* ───────── fixed-width integers ───────── */

export type Width = 8 | 16 | 32 | 64;
export const wrap = (n: bigint, w: Width) => BigInt.asUintN(w, n);
export const signed = (n: bigint, w: Width) => BigInt.asIntN(w, n);

/** Bits from the most significant down, as 0/1 */
export const bitsOf = (n: bigint, w: Width): number[] => Array.from({ length: w }, (_, i) => Number((wrap(n, w) >> BigInt(w - 1 - i)) & 1n));

export const flipBit = (n: bigint, w: Width, index: number) => wrap(n ^ (1n << BigInt(index)), w); // index 0 is the least significant bit

export function bitOps(a: bigint, b: bigint, w: Width, shift: number) {
  const x = wrap(a, w), y = wrap(b, w), s = BigInt(Math.min(Math.max(shift, 0), w));
  return {
    and: x & y, or: x | y, xor: x ^ y, not: wrap(~x, w),
    shl: wrap(x << s, w), shr: x >> s, sar: wrap(signed(x, w) >> s, w),
    popcount: bitsOf(x, w).filter(Boolean).length,
  };
}
