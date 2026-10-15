/** Pure text helpers for the editor: transforms, counts and find/replace. */

export interface Stats { chars: number; charsNoSpace: number; words: number; lines: number; paragraphs: number; bytes: number; readMinutes: number }

/** The characters JavaScript's \s and trim() treat as whitespace. */
const isSpace = (c: number) => c === 32 || (c >= 9 && c <= 13) || c === 160 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;

/** One pass and no allocation, so a 5 MB document can be counted on every pause in typing. */
export function stats(text: string): Stats {
  let chars = 0, charsNoSpace = 0, words = 0, breaks = 1, paragraphs = 0, bytes = 0, lineCount = text === "" ? 0 : 1;
  let inWord = false, runNewlines = 0, seenWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const pair = c >= 0xd800 && c <= 0xdbff && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00;
    chars++;
    bytes += pair ? 4 : c < 0x80 ? 1 : c < 0x800 ? 2 : 3; // a lone surrogate is encoded as U+FFFD, 3 bytes
    if (pair) i++;
    if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10)) lineCount++;
    if (isSpace(c)) {
      inWord = false;
      if (c === 10) runNewlines++;
    } else {
      charsNoSpace++;
      if (!inWord) words++;
      // a whitespace run with two or more newlines, between words, is a paragraph break
      if (seenWord && runNewlines >= 2) breaks++;
      runNewlines = 0; inWord = true; seenWord = true;
    }
  }
  paragraphs = words ? breaks : 0;
  return { chars, charsNoSpace, words, lines: lineCount, paragraphs, bytes, readMinutes: words / 230 };
}

const lines = (t: string) => t.split("\n");
const keepEnd = (t: string, out: string[]) => out.join("\n") + (t.endsWith("\n") && out.length ? "\n" : "");
const body = (t: string) => (t.endsWith("\n") ? t.slice(0, -1) : t);

export const sortLines = (t: string, o: { desc?: boolean; numeric?: boolean; ignoreCase?: boolean } = {}) => {
  const out = lines(body(t)).sort((a, b) => {
    const x = o.ignoreCase ? a.toLowerCase() : a, y = o.ignoreCase ? b.toLowerCase() : b;
    return o.numeric ? (parseFloat(x) || 0) - (parseFloat(y) || 0) || x.localeCompare(y) : x.localeCompare(y, undefined, { numeric: true });
  });
  if (o.desc) out.reverse();
  return keepEnd(t, out);
};
export const reverseLines = (t: string) => keepEnd(t, lines(body(t)).reverse());
export const dedupeLines = (t: string) => keepEnd(t, [...new Set(lines(body(t)))]);
export const removeBlankLines = (t: string) => keepEnd(t, lines(body(t)).filter((l) => l.trim() !== ""));
export const trimLines = (t: string) => keepEnd(t, lines(body(t)).map((l) => l.trim()));
export const trimTrailing = (t: string) => keepEnd(t, lines(body(t)).map((l) => l.replace(/[ \t]+$/, "")));
export const numberLines = (t: string) => { const l = lines(body(t)); const w = String(l.length).length; return keepEnd(t, l.map((x, i) => `${String(i + 1).padStart(w, " ")}  ${x}`)); };
export const joinLines = (t: string, sep = " ") => body(t).split("\n").join(sep);
export const collapseSpaces = (t: string) => t.replace(/[ \t]{2,}/g, " ");

/**
 * Splits an identifier or a phrase into words: at separators, at camelCase humps and after acronyms
 * ("XMLHttpRequest" is XML, Http, Request). Letters and digits stay together ("md5Hash" is md5, Hash).
 */
export const words = (s: string): string[] =>
  s.replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, "$1 $2").replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2").split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export const upper = (t: string) => t.toUpperCase();
export const lower = (t: string) => t.toLowerCase();
export const titleCase = (t: string) => t.toLowerCase().replace(/(^|[\s"(\[{-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
export const sentenceCase = (t: string) => t.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
export const swapCase = (t: string) => [...t].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join("");

export type CaseStyle = "upper" | "lower" | "swap" | "title" | "sentence" | "camel" | "pascal" | "snake" | "kebab" | "constant" | "dot";

/**
 * What the last case conversion knew about each line: its words. Lowercasing "someThing" gives "something", and
 * nothing in that text says where the words were, so the words are kept for the next conversion. It only applies to
 * the very text it produced (ignoring case): any edit in between starts fresh.
 */
export interface CaseMemory { out: string; lines: string[][] }

const cap = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w);
const JOIN: Partial<Record<CaseStyle, (w: string[]) => string>> = {
  camel: (w) => w.map((x, i) => (i ? cap(x) : x.toLowerCase())).join(""),
  pascal: (w) => w.map(cap).join(""),
  snake: (w) => w.map((x) => x.toLowerCase()).join("_"),
  kebab: (w) => w.map((x) => x.toLowerCase()).join("-"),
  constant: (w) => w.map((x) => x.toUpperCase()).join("_"),
  dot: (w) => w.map((x) => x.toLowerCase()).join("."),
  title: (w) => w.map(cap).join(" "),
  sentence: (w) => w.map((x, i) => (i ? x.toLowerCase() : cap(x))).join(" "),
};

/**
 * Converts the case of every line on its own, so a list of names stays a list. Identifier styles (camel, snake...)
 * read each line as one name; upper, lower and swap only change letters; title and sentence case keep ordinary
 * sentences as they are and split a name like some_thing into "Some Thing".
 */
export function convertCase(text: string, style: CaseStyle, prev?: CaseMemory): { text: string; memory: CaseMemory } {
  const parts = text.split(/(\r?\n)/);
  const lineCount = Math.ceil(parts.length / 2);
  const remembered = prev && prev.out === text.toLowerCase() && prev.lines.length === lineCount ? prev.lines : null;
  const known: string[][] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i];
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(line)!;
    const core = m[2];
    const w = core ? (remembered?.[i / 2]?.length ? remembered[i / 2] : words(core)) : [];
    known.push(w);
    if (!core || !w.length) continue;
    let out: string;
    if (style === "upper") out = core.toUpperCase();
    else if (style === "lower") out = core.toLowerCase();
    else if (style === "swap") out = swapCase(core);
    else if ((style === "title" || style === "sentence") && !/\s/.test(core) && (w.length > 1 || remembered)) out = JOIN[style]!(w);
    else if (style === "title") out = titleCase(core);
    else if (style === "sentence") out = sentenceCase(core);
    else out = JOIN[style]!(w);
    parts[i] = m[1] + out + m[3];
  }
  const result = parts.join("");
  return { text: result, memory: { out: result.toLowerCase(), lines: known } };
}

const one = (style: CaseStyle) => (t: string) => convertCase(t, style).text;
export const camelCase = one("camel");
export const pascalCase = one("pascal");
export const snakeCase = one("snake");
export const kebabCase = one("kebab");
export const constantCase = one("constant");
export const dotCase = one("dot");
export const slugify = (t: string) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Wrap long lines at `width` columns without splitting words. */
export function wrapLines(t: string, width = 80): string {
  return t.split("\n").map((line) => {
    if (line.length <= width) return line;
    const out: string[] = [];
    let cur = "";
    for (const w of line.split(/(\s+)/)) {
      if ((cur + w).length > width && cur.trim()) { out.push(cur.trimEnd()); cur = w.trimStart(); } else cur += w;
    }
    if (cur) out.push(cur);
    return out.join("\n");
  }).join("\n");
}

export interface FindOptions { regex?: boolean; caseSensitive?: boolean; wholeWord?: boolean }
export interface Match { index: number; length: number }

export function buildPattern(query: string, o: FindOptions): RegExp | string {
  if (!query) return "Type something to find";
  let src = o.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (o.wholeWord) src = `\\b(?:${src})\\b`;
  try { return new RegExp(src, `g${o.caseSensitive ? "" : "i"}mu`); } catch (e) {
    try { return new RegExp(src, `g${o.caseSensitive ? "" : "i"}m`); } catch { return (e as Error).message.replace(/^Invalid regular expression: /, ""); }
  }
}

export function findAll(text: string, query: string, o: FindOptions = {}, limit = 5000): { matches: Match[]; error?: string } {
  const re = buildPattern(query, o);
  if (typeof re === "string") return { matches: [], error: query ? re : undefined };
  const matches: Match[] = [];
  for (const m of text.matchAll(re)) {
    if (m[0] === "") { if (re.lastIndex >= text.length) break; continue; }
    matches.push({ index: m.index!, length: m[0].length });
    if (matches.length >= limit) break;
  }
  return { matches };
}

/** The replacement text for one match, with $1, $&, $<name> expanded the way String.replace would (`args` is what a replace callback gets). */
function expand(replacement: string, args: unknown[], regex: boolean): string {
  if (!regex) return replacement;
  const groups = typeof args[args.length - 1] === "object" ? (args[args.length - 1] as Record<string, string>) : undefined;
  const caps = args.slice(1, groups ? -3 : -2) as string[];
  return replacement.replace(/\$(\$|&|\d{1,2}|<([^>]+)>)/g, (_, k: string, name?: string) => (k === "$" ? "$" : k === "&" ? (args[0] as string) : name ? groups?.[name] ?? "" : caps[Number(k) - 1] ?? ""));
}

export function replaceAll(text: string, query: string, replacement: string, o: FindOptions = {}): { text: string; count: number; error?: string } {
  const re = buildPattern(query, o);
  if (typeof re === "string") return { text, count: 0, error: query ? re : undefined };
  let count = 0;
  const out = text.replace(re, (...args) => { count++; return expand(replacement, args, !!o.regex); });
  return { text: out, count };
}

/**
 * What the single match that starts at `index` is replaced with, read in the whole text: look-behind and look-ahead (and \b) see their
 * surroundings, which they would not if the match were cut out and searched alone. Null when no match starts there.
 */
export function replacementAt(text: string, query: string, replacement: string, o: FindOptions, index: number): string | null {
  const built = buildPattern(query, o);
  if (typeof built === "string") return null;
  const re = new RegExp(built.source, built.flags.replace("g", "") + "y");
  re.lastIndex = index;
  const m = re.exec(text);
  if (!m) return null;
  const rest: unknown[] = [...m, m.index, text];
  if (m.groups) rest.push(m.groups);
  return expand(replacement, rest, !!o.regex);
}

/** The extension a file should get for a text mode. */
export const MODES = [
  { id: "plain", label: "Plain text", ext: "txt" },
  { id: "markdown", label: "Markdown", ext: "md" },
  { id: "json", label: "JSON", ext: "json" },
  { id: "yaml", label: "YAML", ext: "yaml" },
  { id: "csv", label: "CSV", ext: "csv" },
  { id: "html", label: "HTML", ext: "html" },
  { id: "code", label: "Code", ext: "txt" },
] as const;
export type ModeId = (typeof MODES)[number]["id"];

export function modeFor(filename: string): ModeId {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["md", "markdown", "mdx"].includes(ext)) return "markdown";
  if (ext === "json" || ext === "jsonc") return "json";
  if (["yaml", "yml"].includes(ext)) return "yaml";
  if (["csv", "tsv"].includes(ext)) return "csv";
  if (["html", "htm"].includes(ext)) return "html";
  if (["js", "ts", "tsx", "jsx", "py", "rs", "go", "c", "h", "cpp", "java", "sh", "css", "sql", "rb", "php", "toml", "ini", "xml", "lua"].includes(ext)) return "code";
  return "plain";
}

/** Extensions the editor opens as text. Keep it a superset of the `open-text` list in package.json (a test checks), so a file the chooser offers is a file the editor accepts. */
export const TEXT_EXT = new Set("txt md markdown mdx json jsonc yaml yml csv tsv html htm xml log ini toml conf cfg env js ts tsx jsx mjs cjs py rs go c h cpp hpp java sh bash zsh css scss sql rb php lua tex srt vtt rst adoc asciidoc org textile wiki bib diff patch properties gitignore dockerfile mk cmake gradle kt kts swift cs scala r pl dart vue svelte less graphql gql proto ps1 bat nfo".split(" "));
export const isTextFile = (name: string, mime = "") => TEXT_EXT.has(name.split(".").pop()?.toLowerCase() ?? "") || mime.startsWith("text/") || mime === "application/json";
