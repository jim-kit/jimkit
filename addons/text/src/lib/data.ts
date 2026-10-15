import YAML from "yaml";

export type Parsed = { ok: true; value: unknown } | { ok: false; message: string; line?: number; col?: number };
export type Result = { ok: true; text: string } | { ok: false; message: string; line?: number; col?: number };

export type DataFormat = "json" | "yaml";

const posToLineCol = (text: string, pos: number) => {
  const before = text.slice(0, Math.max(0, Math.min(pos, text.length)));
  const nl = before.split("\n");
  return { line: nl.length, col: nl[nl.length - 1].length + 1 };
};

/** Where does this text stop being JSON? (V8 doesn't always say, so a tiny validator finds the offset.) */
export function jsonErrorOffset(t: string): number | null {
  let i = 0;
  const ws = () => { while (i < t.length && " \t\n\r".includes(t[i])) i++; };
  const fail = () => { throw i; };
  const str = () => {
    i++;
    while (i < t.length && t[i] !== '"') { if (t[i] === "\\") i++; else if (t[i] < " ") fail(); i++; }
    if (i >= t.length) fail();
    i++;
  };
  const value = (): void => {
    ws();
    const c = t[i];
    if (c === "{") {
      i++; ws();
      if (t[i] === "}") { i++; return; }
      for (;;) {
        ws(); if (t[i] !== '"') fail();
        str(); ws(); if (t[i] !== ":") fail();
        i++; value(); ws();
        if (t[i] === ",") { i++; continue; }
        if (t[i] === "}") { i++; return; }
        fail();
      }
    } else if (c === "[") {
      i++; ws();
      if (t[i] === "]") { i++; return; }
      for (;;) {
        value(); ws();
        if (t[i] === ",") { i++; continue; }
        if (t[i] === "]") { i++; return; }
        fail();
      }
    } else if (c === '"') str();
    else {
      const m = /^(-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(t.slice(i));
      if (!m) fail();
      i += m![0].length;
    }
  };
  try { value(); ws(); if (i < t.length) return i; return null; } catch (e) { return typeof e === "number" ? e : null; }
}

export function parseJson(text: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const msg = (e as Error).message;
    // V8: "... (line 2 column 5)" or "... at position 12"
    const lc = /line (\d+) column (\d+)/.exec(msg);
    if (lc) return { ok: false, message: msg.replace(/\s*\(line \d+ column \d+\)/, ""), line: Number(lc[1]), col: Number(lc[2]) };
    const p = /position (\d+)/.exec(msg);
    if (p) return { ok: false, message: msg.replace(/\s*(in JSON )?at position \d+.*/, ""), ...posToLineCol(text, Number(p[1])) };
    const off = jsonErrorOffset(text);
    return { ok: false, message: msg.replace(/, ".*" is not valid JSON$/s, ""), ...(off === null ? {} : posToLineCol(text, off)) };
  }
}

export function parseYaml(text: string): Parsed {
  try {
    const doc = YAML.parseDocument(text, { prettyErrors: false });
    if (doc.errors.length) {
      const err = doc.errors[0];
      const lp = err.linePos?.[0];
      return { ok: false, message: err.message.split("\n")[0], line: lp?.line, col: lp?.col };
    }
    return { ok: true, value: doc.toJS() };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export const parse = (text: string, format: DataFormat): Parsed => (format === "json" ? parseJson(text) : parseYaml(text));

const sortDeep = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortDeep) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])])) : v;

export interface Out { indent?: 2 | 4 | "tab"; sortKeys?: boolean }

/**
 * JSON re-printed without going through JavaScript values. `JSON.parse` turns 12345678901234567890 into 12345678901234567000 and
 * 1.0 into 1, so formatting a document the long way would quietly change its numbers. Here every number (and string) keeps the text it had.
 * Only for text that has already parsed: it trusts the grammar.
 */
type Lossless = { k: "lit"; raw: string } | { k: "arr"; items: Lossless[] } | { k: "obj"; entries: [string, Lossless][] };

function readLossless(t: string): Lossless {
  let i = 0;
  const ws = () => { while (i < t.length && (t[i] === " " || t[i] === "\t" || t[i] === "\n" || t[i] === "\r")) i++; };
  const str = () => { const from = i++; while (t[i] !== '"') { if (t[i] === "\\") i++; i++; } i++; return t.slice(from, i); };
  const literal = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?|true|false|null/y;
  const value = (): Lossless => {
    ws();
    const c = t[i];
    if (c === "{") {
      i++; ws();
      const entries: [string, Lossless][] = [];
      if (t[i] === "}") { i++; return { k: "obj", entries }; }
      for (;;) {
        ws(); const key = str(); ws(); i++; // the colon
        entries.push([key, value()]); ws();
        if (t[i] === ",") { i++; continue; }
        i++; return { k: "obj", entries };
      }
    }
    if (c === "[") {
      i++; ws();
      const items: Lossless[] = [];
      if (t[i] === "]") { i++; return { k: "arr", items }; }
      for (;;) {
        items.push(value()); ws();
        if (t[i] === ",") { i++; continue; }
        i++; return { k: "arr", items };
      }
    }
    if (c === '"') return { k: "lit", raw: str() };
    literal.lastIndex = i;
    const m = literal.exec(t)!;
    i += m[0].length;
    return { k: "lit", raw: m[0] };
  };
  return value();
}

function writeLossless(n: Lossless, unit: string, sort: boolean, depth: number): string {
  if (n.k === "lit") return n.raw;
  const items = n.k === "arr" ? n.items.map((x) => writeLossless(x, unit, sort, depth + 1)) : (sort ? [...n.entries].sort((a, b) => (JSON.parse(a[0]) < JSON.parse(b[0]) ? -1 : 1)) : n.entries).map(([k, v]) => `${k}:${unit ? " " : ""}${writeLossless(v, unit, sort, depth + 1)}`);
  const [open, close] = n.k === "arr" ? ["[", "]"] : ["{", "}"];
  if (!items.length) return open + close;
  if (!unit) return open + items.join(",") + close;
  const pad = "\n" + unit.repeat(depth + 1);
  return open + pad + items.join("," + pad) + "\n" + unit.repeat(depth) + close;
}

/** `text` (valid JSON) re-indented, or with `unit` empty, minified: numbers and strings exactly as written. */
export const reprintJson = (text: string, unit: string, sortKeys = false): string => writeLossless(readLossless(text), unit, sortKeys, 0);

export function stringify(value: unknown, format: DataFormat, o: Out = {}): string {
  const v = o.sortKeys ? sortDeep(value) : value;
  if (format === "json") return JSON.stringify(v, null, o.indent === "tab" ? "\t" : o.indent ?? 2) + "\n";
  return YAML.stringify(v, { indent: o.indent === 4 ? 4 : 2, lineWidth: 0 });
}

export function format(text: string, from: DataFormat, to: DataFormat, o: Out = {}): Result {
  if (!text.trim()) return { ok: false, message: "Nothing to format yet" };
  const p = parse(text, from);
  if (!p.ok) return p;
  // JSON to JSON never goes through JavaScript numbers, which would change a long integer or a trailing .0
  if (from === "json" && to === "json") return { ok: true, text: reprintJson(text, o.indent === "tab" ? "\t" : " ".repeat(o.indent ?? 2), o.sortKeys) + "\n" };
  try { return { ok: true, text: stringify(p.value, to, o) }; } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export function minify(text: string): Result {
  const p = parseJson(text);
  return p.ok ? { ok: true, text: reprintJson(text, "") } : p;
}

/** JSON or YAML? Good enough to pick a default. */
export function sniff(text: string): DataFormat {
  const t = text.trimStart();
  return t.startsWith("{") || t.startsWith("[") ? "json" : "yaml";
}

export function describe(value: unknown): string {
  if (Array.isArray(value)) return `array of ${value.length}`;
  if (value && typeof value === "object") return `object with ${Object.keys(value).length} keys`;
  return typeof value;
}
