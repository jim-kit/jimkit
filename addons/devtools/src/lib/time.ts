/** Timestamps, time zones and date differences, using only Intl and Date. */

export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function allZones(): string[] {
  try {
    const z = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (z?.length) return z.includes("UTC") ? z : ["UTC", ...z];
  } catch { /* fall through */ }
  return ["UTC"];
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, zone: string) {
  let f = fmtCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
    fmtCache.set(zone, f);
  }
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(ms)) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: o.weekday };
}

/** Wall-clock fields in a zone */
export function wallTime(ms: number, zone: string) {
  const p = parts(ms, zone);
  return { ...p, ms: ((ms % 1000) + 1000) % 1000 };
}

/** Minutes the zone is ahead of UTC at that instant (negative west of Greenwich) */
export function zoneOffset(ms: number, zone: string): number {
  const p = parts(ms, zone);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** The instant at which the wall clock in `zone` reads these fields. In the hour a DST change repeats, the earlier one wins; in the hour it skips, the time is read as if the change had not happened. */
export function zonedToEpoch(y: number, mo: number, d: number, h: number, mi: number, s: number, msPart: number, zone: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s, msPart);
  // the offsets in force a day before and a day after: one of them holds unless the clock was set forward across this time
  const offsets = [zoneOffset(guess - 86400_000, zone), zoneOffset(guess + 86400_000, zone)];
  const fits = offsets.map((o) => guess - o * 60000).filter((t, i) => zoneOffset(t, zone) === offsets[i]);
  // a repeated hour fits twice: the first one. A skipped hour fits never: read it with the offset from before the jump, as if the
  // clock had not been set forward (02:30 on the spring-forward night in New York is 03:30 EDT)
  return fits.length ? Math.min(...fits) : guess - offsets[0] * 60000;
}

export function offsetLabel(minutes: number, colon = true): string {
  const sign = minutes < 0 ? "-" : "+";
  const a = Math.abs(minutes);
  const hh = String(Math.floor(a / 60)).padStart(2, "0"), mm = String(a % 60).padStart(2, "0");
  return `${sign}${hh}${colon ? ":" : ""}${mm}`;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function isoIn(ms: number, zone: string): string {
  const p = wallTime(ms, zone);
  const off = zoneOffset(ms, zone);
  return `${pad(p.y, 4)}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}.${pad(p.ms, 3)}${off === 0 && zone === "UTC" ? "Z" : offsetLabel(off)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function rfc2822In(ms: number, zone: string): string {
  const p = wallTime(ms, zone);
  return `${p.wd}, ${pad(p.d)} ${MONTHS[p.mo - 1]} ${p.y} ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)} ${offsetLabel(zoneOffset(ms, zone), false)}`;
}

export function readableIn(ms: number, zone: string): string {
  const p = wallTime(ms, zone);
  const long = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(ms);
  const abbr = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(ms).find((x) => x.type === "timeZoneName")?.value ?? "";
  return `${long}, ${pad(p.h)}:${pad(p.mi)}:${pad(p.s)} ${abbr}`.trim();
}

export type Unit = "auto" | "s" | "ms";

export type Parsed = { ok: true; ms: number; how: string } | { ok: false; error: string };

/** Reads a Unix timestamp (seconds, milliseconds, microseconds, nanoseconds), an ISO or RFC 2822 date, or a plain date and time that is taken to be in `zone`. */
export function parseInstant(input: string, zone: string, unit: Unit = "auto"): Parsed {
  const s = input.trim();
  if (!s) return { ok: false, error: "Nothing to read" };
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    const digits = s.replace(/^-/, "").split(".")[0].length;
    let ms: number, how: string;
    if (unit === "s") { ms = n * 1000; how = "seconds"; }
    else if (unit === "ms") { ms = n; how = "milliseconds"; }
    else if (digits <= 11) { ms = n * 1000; how = "seconds"; }
    else if (digits <= 14) { ms = n; how = "milliseconds"; }
    else if (digits <= 17) { ms = n / 1000; how = "microseconds"; }
    else { ms = n / 1e6; how = "nanoseconds"; }
    ms = Math.round(ms);
    return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? { ok: true, ms, how: `Unix ${how}` } : { ok: false, error: "Number is outside the supported date range" };
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?$/.exec(s);
  if (iso) {
    const [y, mo, d, h, mi, sec] = iso.slice(1, 7).map((x) => Number(x ?? 0));
    const frac = iso[7] ? Math.round(Number("0." + iso[7]) * 1000) : 0;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return { ok: false, error: "Month, day, hour, minute or second is out of range" };
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (probe.getUTCDate() !== d) return { ok: false, error: "That day does not exist in that month" };
    return { ok: true, ms: zonedToEpoch(y, mo, d, h, mi, sec, frac, zone), how: `Date and time in ${zone}` };
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? { ok: false, error: "Not a Unix timestamp or a recognised date format" } : { ok: true, ms: t, how: /([zZ]|GMT|UTC|[+-]\d{2}:?\d{2})\s*$/.test(s) ? "Date with its own offset" : "Date, read in this device's time zone" };
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["year", 365.2425 * 86400e3], ["month", 30.436875 * 86400e3], ["week", 7 * 86400e3], ["day", 86400e3], ["hour", 3600e3], ["minute", 60e3], ["second", 1e3]];
export function relative(ms: number, now: number): string {
  const diff = ms - now;
  if (Math.abs(diff) < 1000) return "now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [u, len] of UNITS) if (Math.abs(diff) >= len) return rtf.format(Math.trunc(diff / len), u);
  return "now";
}

/* ───────── difference ───────── */

export interface Diff {
  negative: boolean;
  years: number; months: number; days: number; hours: number; minutes: number; seconds: number; millis: number;
  totalMs: number;
}

const daysIn = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

/** Calendar difference between two instants as the wall clock in `zone` sees them: whole months (a day past the end of a month is clamped, Jan 31 + 1 month is Feb 28/29), then days and time. */
export function dateDiff(a: number, b: number, zone: string): Diff {
  const negative = b < a;
  const [from, to] = negative ? [b, a] : [a, b];
  const f = wallTime(from, zone), t = wallTime(to, zone);
  const asMs = (p: ReturnType<typeof wallTime>) => Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s, p.ms);
  const addMonths = (n: number) => {
    const total = f.y * 12 + (f.mo - 1) + n;
    const y = Math.floor(total / 12), mo = (total % 12) + 1;
    return Date.UTC(y, mo - 1, Math.min(f.d, daysIn(y, mo)), f.h, f.mi, f.s, f.ms);
  };
  const end = asMs(t);
  let months = (t.y - f.y) * 12 + (t.mo - f.mo);
  while (months > 0 && addMonths(months) > end) months--;
  let rest = end - addMonths(months);
  const days = Math.floor(rest / 86400e3); rest -= days * 86400e3;
  const hours = Math.floor(rest / 3600e3); rest -= hours * 3600e3;
  const minutes = Math.floor(rest / 60e3); rest -= minutes * 60e3;
  const seconds = Math.floor(rest / 1e3);
  return { negative, years: Math.floor(months / 12), months: months % 12, days, hours, minutes, seconds, millis: rest - seconds * 1e3, totalMs: to - from };
}

export function describeDiff(d: Diff): string {
  const bits: string[] = [];
  const add = (n: number, w: string) => n && bits.push(`${n} ${w}${n === 1 ? "" : "s"}`);
  add(d.years, "year"); add(d.months, "month"); add(d.days, "day"); add(d.hours, "hour"); add(d.minutes, "minute"); add(d.seconds, "second");
  return bits.length ? bits.join(", ") : d.millis ? `${d.millis} ms` : "No difference";
}
