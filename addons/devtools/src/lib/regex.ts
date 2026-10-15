/** Regex matching for the tester. Pure, so it can run in a Worker (a pattern like (a+)+$ can hang a tab) and in tests. */

export const FLAGS = [
  { id: "g", name: "global", hint: "Find every match, not just the first" },
  { id: "i", name: "ignore case", hint: "A matches a" },
  { id: "m", name: "multiline", hint: "^ and $ match at every line" },
  { id: "s", name: "dotAll", hint: ". also matches a newline" },
  { id: "u", name: "unicode", hint: "Full Unicode, \\p{…} classes, stricter syntax" },
  { id: "y", name: "sticky", hint: "Only match right at the last position" },
] as const;

export const MAX_MATCHES = 2000;

export interface RegexGroup { name?: string; value: string | undefined }
export interface RegexMatch { index: number; end: number; text: string; groups: RegexGroup[] }
export interface RegexRequest { pattern: string; flags: string; text: string; replacement: string }
export type RegexResult =
  | { ok: true; matches: RegexMatch[]; truncated: boolean; replaced: string; ms: number }
  | { ok: false; error: string };

/** Names of the capture groups in order: the name for `(?<id>…)`, undefined for a plain `(…)`. Non-capturing and look-around groups are skipped. */
export function groupNames(pattern: string): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") { i++; continue; }
    if (inClass) { if (c === "]") inClass = false; continue; }
    if (c === "[") { inClass = true; continue; }
    if (c !== "(") continue;
    if (pattern[i + 1] !== "?") { out.push(undefined); continue; }
    const named = /^\(\?<([^>=!][^>]*)>/.exec(pattern.slice(i, i + 80));
    if (named) out.push(named[1]);
  }
  return out;
}

export function compile(pattern: string, flags: string): { ok: true; re: RegExp } | { ok: false; error: string } {
  try {
    return { ok: true, re: new RegExp(pattern, flags) };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)).replace(/^Invalid regular expression: /, "") };
  }
}

export function runRegex({ pattern, flags, text, replacement }: RegexRequest): RegexResult {
  const c = compile(pattern, flags);
  if (!c.ok) return c;
  const t0 = performance.now();
  const { re } = c;
  const names = groupNames(pattern);
  const repeat = flags.includes("g") || flags.includes("y");
  const unicode = flags.includes("u");
  const matches: RegexMatch[] = [];
  let truncated = false;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (matches.length >= MAX_MATCHES) { truncated = true; break; }
    matches.push({
      index: m.index, end: m.index + m[0].length, text: m[0],
      groups: m.slice(1).map((value, i) => ({ name: names[i], value })),
    });
    if (!repeat) break;
    if (m[0] === "") {
      // an empty match doesn't move lastIndex: step over one character (a whole surrogate pair under /u)
      const cp = unicode ? text.codePointAt(re.lastIndex) : undefined;
      re.lastIndex += cp !== undefined && cp > 0xffff ? 2 : 1;
      if (re.lastIndex > text.length) break;
    }
  }
  let replaced = "";
  try {
    replaced = text.replace(new RegExp(pattern, flags), replacement);
  } catch {
    // a bad replacement string can't really throw in JS; keep the preview empty if it somehow does
  }
  return { ok: true, matches, truncated, replaced, ms: performance.now() - t0 };
}

export const CHEATSHEET: { title: string; rows: [string, string][] }[] = [
  { title: "Characters", rows: [[".", "any character (not a newline)"], ["\\d  \\D", "digit, non-digit"], ["\\w  \\W", "word character, other"], ["\\s  \\S", "whitespace, other"], ["\\t  \\n", "tab, newline"], ["\\p{L}", "a letter (needs the u flag)"]] },
  { title: "Sets", rows: [["[abc]", "a, b or c"], ["[^abc]", "anything but a, b, c"], ["[a-z0-9]", "a range"], ["a|b", "a or b"]] },
  { title: "Anchors", rows: [["^  $", "start, end (of each line with m)"], ["\\b  \\B", "word boundary, not a boundary"]] },
  { title: "Quantifiers", rows: [["*  +  ?", "0 or more, 1 or more, 0 or 1"], ["{3}  {2,5}  {2,}", "exactly 3, 2 to 5, 2 or more"], ["*?  +?  ??", "lazy: as few as possible"]] },
  { title: "Groups", rows: [["(…)", "capture group"], ["(?:…)", "group without capturing"], ["(?<name>…)", "named group"], ["\\1  \\k<name>", "same text as an earlier group"], ["(?=…)  (?!…)", "followed by, not followed by"], ["(?<=…)  (?<!…)", "preceded by, not preceded by"]] },
  { title: "In the replacement", rows: [["$1  $<name>", "a captured group"], ["$&", "the whole match"], ["$`  $'", "text before, after the match"], ["$$", "a literal $"]] },
];
