/** Five-field cron expressions: parsing, a plain-English description and the next run times. */
import { wallTime, zonedToEpoch } from "./time";

export interface Field { name: string; min: number; max: number; any: boolean; values: number[]; raw: string }
export interface Cron { fields: Field[]; minute: Field; hour: Field; dom: Field; month: Field; dow: Field }
export type Parsed = { ok: true; cron: Cron } | { ok: false; error: string };

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *",
};

const SPECS = [
  { name: "Minute", min: 0, max: 59 },
  { name: "Hour", min: 0, max: 23 },
  { name: "Day of month", min: 1, max: 31 },
  { name: "Month", min: 1, max: 12, names: MONTHS, offset: 1 },
  { name: "Day of week", min: 0, max: 7, names: DAYS, offset: 0 },
];

function parseField(raw: string, spec: (typeof SPECS)[number]): Field | string {
  const num = (s: string): number | null => {
    const up = s.toUpperCase();
    const i = spec.names?.indexOf(up) ?? -1;
    if (i >= 0) return i + (spec.offset ?? 0);
    return /^\d+$/.test(s) ? Number(s) : null;
  };
  const set = new Set<number>();
  const fail = (msg: string) => `${spec.name}: ${msg}`;
  if (/[LW#]/i.test(raw.replace(/[A-Z]{3}/gi, ""))) return fail(`"${raw}" uses L, W or #, which this tool does not read`);
  for (const part of raw.split(",")) {
    const [rangeText, stepText, extra] = part.split("/");
    if (extra !== undefined || part === "") return fail(`"${part}" is not valid`);
    const step = stepText === undefined ? 1 : /^\d+$/.test(stepText) ? Number(stepText) : NaN;
    if (!(step >= 1)) return fail(`step "${stepText}" must be a whole number of 1 or more`);
    let lo: number, hi: number;
    if (rangeText === "*" || rangeText === "?") { lo = spec.min; hi = spec.name === "Day of week" ? 6 : spec.max; }
    else if (rangeText.includes("-")) {
      const [a, b, more] = rangeText.split("-");
      const x = num(a), y = num(b);
      if (more !== undefined || x === null || y === null) return fail(`"${rangeText}" is not a valid range`);
      [lo, hi] = [x, y];
      if (lo > hi) return fail(`range ${rangeText} runs backwards`);
    } else {
      const x = num(rangeText);
      if (x === null) return fail(`"${rangeText}" is not a number${spec.names ? " or name" : ""}`);
      lo = x; hi = stepText === undefined ? x : spec.max;
    }
    if (lo < spec.min || hi > spec.max) return fail(`${lo < spec.min ? lo : hi} is outside ${spec.min}-${spec.max}`);
    for (let v = lo; v <= hi; v += step) set.add(spec.name === "Day of week" && v === 7 ? 0 : v);
  }
  const values = [...set].sort((a, b) => a - b);
  const full = spec.name === "Day of week" ? 7 : spec.max - spec.min + 1;
  // for the two day fields cron looks at the text, not the values: a field that starts with * (even "*/2") counts as "any" for the
  // either-or rule, and "1-31" or "0-6" does not
  const isDayField = spec.name === "Day of month" || spec.name === "Day of week";
  const any = isDayField ? /^[*?]/.test(raw.trim()) : values.length === full;
  return { name: spec.name, min: spec.min, max: spec.max, any, values, raw };
}

export function parseCron(input: string): Parsed {
  let text = input.trim().replace(/\s+/g, " ");
  if (!text) return { ok: false, error: "Enter a cron expression" };
  if (text.startsWith("@")) {
    const m = MACROS[text.toLowerCase()];
    if (!m) return { ok: false, error: `${text} is not a known shortcut. Use @hourly, @daily, @weekly, @monthly or @yearly` };
    text = m;
  }
  const parts = text.split(" ");
  if (parts.length !== 5) return { ok: false, error: `Expected 5 fields (minute hour day-of-month month day-of-week), found ${parts.length}` };
  const fields: Field[] = [];
  for (let i = 0; i < 5; i++) {
    const f = parseField(parts[i], SPECS[i]);
    if (typeof f === "string") return { ok: false, error: f };
    fields.push(f);
  }
  const [minute, hour, dom, month, dow] = fields;
  return { ok: true, cron: { fields, minute, hour, dom, month, dow } };
}

/** Does the day match? When both day fields are restricted, a day matches if either does (as cron does). */
function dayMatches(c: Cron, y: number, mo: number, d: number, weekday: number): boolean {
  if (!c.month.values.includes(mo)) return false;
  const domOk = c.dom.values.includes(d), dowOk = c.dow.values.includes(weekday);
  if (!c.dom.any && !c.dow.any) return domOk || dowOk;
  return domOk && dowOk;
}

/** The next `count` run times (ms) strictly after `from`, in the wall-clock of `zone`. Times a daylight-saving jump skips are left out; a repeated hour runs once. */
export function nextRuns(c: Cron, from: number, count: number, zone: string): number[] {
  const out: number[] = [];
  const start = wallTime(from, zone);
  let day = Date.UTC(start.y, start.mo - 1, start.d);
  for (let i = 0; i < 366 * 8 && out.length < count; i++, day += 86400e3) {
    const dt = new Date(day);
    const y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    if (!dayMatches(c, y, mo, d, dt.getUTCDay())) continue;
    for (const h of c.hour.values) for (const mi of c.minute.values) {
      const t = zonedToEpoch(y, mo, d, h, mi, 0, 0, zone);
      if (t <= from) continue;
      const w = wallTime(t, zone);
      if (w.d !== d || w.h !== h || w.mi !== mi) continue; // that wall-clock time doesn't exist on this day
      if (out.length && t <= out[out.length - 1]) continue;
      out.push(t);
      if (out.length >= count) return out;
    }
  }
  return out;
}

/* ───────── description ───────── */

const pad = (n: number) => String(n).padStart(2, "0");
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** "*" and "*\/n" and "a-b" and lists read as words; anything stranger falls back to the values */
function isStep(raw: string): number | null { const m = /^(\*|\d+-\d+|\d+)\/(\d+)$/.exec(raw); return m ? Number(m[2]) : null; }
const isRange = (raw: string) => /^[a-z0-9]+-[a-z0-9]+$/i.test(raw);

export function describeCron(c: Cron): string {
  const { minute, hour, dom, month, dow } = c;
  const single = (f: Field) => f.values.length === 1;
  let time: string;
  if (single(minute) && single(hour)) time = `At ${pad(hour.values[0])}:${pad(minute.values[0])}`;
  else {
    let m: string;
    if (minute.any && minute.raw === "*") m = "Every minute";
    else if (isStep(minute.raw) && minute.raw.startsWith("*")) m = `Every ${isStep(minute.raw)} minutes`;
    else if (isRange(minute.raw)) m = `Every minute from ${minute.values[0]} through ${minute.values[minute.values.length - 1]}`;
    else if (single(minute)) m = `At minute ${minute.values[0]}`;
    else m = `At minutes ${list(minute.values.map(String))}`;
    let h = "";
    if (!hour.any) {
      if (isStep(hour.raw) && hour.raw.startsWith("*")) h = `every ${isStep(hour.raw)} hours`;
      else if (isRange(hour.raw)) h = `between ${pad(hour.values[0])}:00 and ${pad(hour.values[hour.values.length - 1])}:59`;
      else if (single(hour)) h = `during hour ${hour.values[0]}`;
      else h = `at hours ${list(hour.values.map(String))}`;
    }
    time = h ? `${m}, ${h}` : m;
  }
  // weekday names for the ends of a range as written: 5-7 is Friday through Sunday (7 is Sunday too), which the sorted values (0, 5, 6) can't say
  const dayIndex = (x: string) => (/^\d+$/.test(x) ? Number(x) % 7 : DAY_NAMES.findIndex((n) => n.toLowerCase().startsWith(x.toLowerCase().slice(0, 3))));
  const dayText = (f: Field) => {
    if (isRange(f.raw) && f === dow) {
      const [a, b] = f.raw.split("/")[0].split("-");
      return `${DAY_NAMES[dayIndex(a)]} through ${DAY_NAMES[dayIndex(b)]}`;
    }
    return list(dow === f ? f.values.map((v) => DAY_NAMES[v]) : f.values.map(String));
  };
  const plain = (f: Field) => f.raw === "*" || f.raw === "?";
  const domText = isStep(dom.raw) && dom.raw.startsWith("*") ? `every ${isStep(dom.raw)} days of the month` : `day ${list(dom.values.map(String))} of the month`;
  let days: string;
  if (plain(dom) && plain(dow)) days = "every day";
  else if (plain(dom)) days = `on ${dayText(dow)}`;
  else if (plain(dow)) days = `on ${domText}`;
  // one of them is a star with a step ("*/2"): cron then needs both to match, rather than either
  else if (dom.any || dow.any) days = `on ${dayText(dow)}, but only on ${domText}`;
  else days = `on ${domText}, or on ${dayText(dow)}`;
  const months = month.any ? "" : ` in ${list(month.values.map((v) => MONTH_NAMES[v - 1]))}`;
  return `${time}, ${days}${months}`.replace(/, every day$/, ", every day");
}
