/** Markdown formatting actions as pure edits: replace [start, end) with `text`, then select [selFrom, selTo]. */
export interface Edit { start: number; end: number; text: string; selFrom: number; selTo: number }

/** Bold, italic, inline code: wrap the selection in `mark`, or take the marks off if it is already wrapped. */
export function wrap(value: string, a: number, b: number, mark: string, placeholder: string): Edit {
  const n = mark.length;
  if (a >= n && value.slice(a - n, a) === mark && value.slice(b, b + n) === mark) {
    return { start: a - n, end: b + n, text: value.slice(a, b), selFrom: a - n, selTo: b - n };
  }
  const inner = value.slice(a, b) || placeholder;
  return { start: a, end: b, text: mark + inner + mark, selFrom: a + n, selTo: a + n + inner.length };
}

/** [text](url) with the url selected, or the selection used as the link text. A selected URL becomes the target. */
export function link(value: string, a: number, b: number): Edit {
  const sel = value.slice(a, b);
  if (/^https?:\/\/\S+$/.test(sel)) return { start: a, end: b, text: `[link](${sel})`, selFrom: a + 1, selTo: a + 5 };
  const label = sel || "text";
  return { start: a, end: b, text: `[${label}](url)`, selFrom: a + label.length + 3, selTo: a + label.length + 6 };
}

/** Make every line the selection touches a list item, or take the markers off if they all have one. */
export function list(value: string, a: number, b: number, ordered: boolean): Edit {
  const ls = value.lastIndexOf("\n", a - 1) + 1;
  const nl = value.indexOf("\n", b);
  const le = nl === -1 ? value.length : nl;
  const lines = value.slice(ls, le).split("\n");
  const marker = ordered ? /^(\s*)\d+[.)]\s/ : /^(\s*)[-*+]\s/;
  const all = lines.every((l) => marker.test(l));
  const out = lines.map((l, i) => (all ? l.replace(marker, "$1") : (ordered ? `${i + 1}. ` : "- ") + l.replace(/^(\s*)([-*+]|\d+[.)])\s/, "$1"))).join("\n");
  return { start: ls, end: le, text: out, selFrom: ls, selTo: ls + out.length };
}

/** Inline code for a selection within a line, a fenced block when it spans lines or is empty at the start of a line. */
export function code(value: string, a: number, b: number): Edit {
  const sel = value.slice(a, b);
  if (!sel.includes("\n")) return wrap(value, a, b, "`", "code");
  const text = "```\n" + sel.replace(/\n$/, "") + "\n```" + (sel.endsWith("\n") ? "\n" : "");
  return { start: a, end: b, text, selFrom: a, selTo: a + text.length };
}

/** Heading level for the line(s) the selection touches: adds `##`, or removes it if that is already the level. */
export function heading(value: string, a: number, level: number): Edit {
  const ls = value.lastIndexOf("\n", a - 1) + 1;
  const nl = value.indexOf("\n", a);
  const le = nl === -1 ? value.length : nl;
  const line = value.slice(ls, le);
  const m = /^(#{1,6})\s+/.exec(line);
  const bare = m ? line.slice(m[0].length) : line;
  const text = m && m[1].length === level ? bare : "#".repeat(level) + " " + bare;
  return { start: ls, end: le, text, selFrom: ls + text.length, selTo: ls + text.length };
}

const CSS = `body{font:16px/1.65 system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#1c1c1e;background:#fff}
@media (prefers-color-scheme:dark){body{color:#e6e6e8;background:#16161a}a{color:#7aa7ff}code,pre{background:#24242a!important}}
pre{padding:.8rem 1rem;overflow:auto;border-radius:8px;background:#f2f2f4}code{background:#f2f2f4;padding:.1em .3em;border-radius:4px;font-size:.92em}pre code{padding:0;background:none}
blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #9994}table{border-collapse:collapse}td,th{border:1px solid #9996;padding:.35em .7em}img{max-width:100%}hr{border:0;border-top:1px solid #9996}`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A standalone HTML page around rendered Markdown. */
export function htmlDocument(title: string, body: string): string {
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${esc(title)}</title>\n<style>${CSS}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}
