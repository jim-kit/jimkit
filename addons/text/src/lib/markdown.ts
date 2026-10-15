/**
 * A small Markdown renderer. Everything is HTML-escaped first and only the tags built here are ever emitted, so the
 * output is safe to inject: no raw HTML passes through, links are limited to http(s), mailto and in-page anchors,
 * and images are shown as links (a preview should not fetch third-party pictures behind your back).
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const safeUrl = (u: string) => {
  const url = u.trim().replace(/&amp;/g, "&");
  return /^(https?:\/\/|mailto:|#|\/(?!\/))/i.test(url) ? esc(url) : null;
};

/** Inline: code spans first (so nothing inside them is touched), then links, emphasis, strikethrough, bare URLs. */
export function inline(src: string): string {
  const stash: string[] = [];
  const hold = (html: string) => `\u0000${stash.push(html) - 1}\u0000`;
  // NUL marks a held fragment, so it can't be allowed in from outside
  let s = src.replace(/\u0000/g, "").replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _t, code: string) => hold(`<code>${esc(code.trim())}</code>`));
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt: string, url: string) => {
    const u = safeUrl(url);
    return hold(u ? `<a href="${u}" target="_blank" rel="noopener noreferrer nofollow">🖼 ${alt || "image"}</a>` : esc(alt));
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, text: string, url: string) => {
    const u = safeUrl(url);
    return u ? hold(`<a href="${u}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`) : text;
  });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, (_, pre: string, url: string) => `${pre}${hold(`<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`)}`);
  s = s.replace(/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`);
  s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)|(^|[^_\w])_([^_\n]+?)_(?![_\w])/g, (_, p1, a, p2, b) => `${p1 ?? p2}<em>${a ?? b}</em>`);
  s = s.replace(/~~([^~\n]+?)~~/g, "<del>$1</del>");
  // a held link can contain a held code span; each fragment only refers to earlier ones, so this ends
  while (s.includes("\u0000")) s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
  return s;
}

const isBlank = (l: string) => !l.trim();
const HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
// a closing run of #s only counts when a space comes before it (CommonMark): "# Learning C#" is a title ending in #
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const FENCE = /^ {0,3}(```+|~~~+)\s*([\w+-]*)/;
const QUOTE = /^ {0,3}>\s?/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  return blocks(lines);
}

function blocks(lines: string[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }

    const fence = FENCE.exec(line);
    if (fence) {
      const mark = fence[1][0].repeat(fence[1].length);
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(mark)) body.push(lines[i++]);
      i++;
      out.push(`<pre><code${fence[2] ? ` class="lang-${esc(fence[2])}"` : ""}>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    const h = HEADING.exec(line);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (HR.test(line)) { out.push("<hr>"); i++; continue; }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(QUOTE, ""));
      out.push(`<blockquote>${blocks(body)}</blockquote>`);
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : ""));
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes("|")) rows.push(cells(lines[i++]));
      const td = (tag: string, c: string, k: number) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(c)}</${tag}>`;
      out.push(`<table><thead><tr>${head.map((c, k) => td("th", c, k)).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => td("td", r[k] ?? "", k)).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }

    const li = LIST.exec(line);
    if (li) {
      const { html, next } = list(lines, i);
      out.push(html);
      i = next;
      continue;
    }

    // paragraph: runs until a blank line or the start of another block
    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && !(para.length && (HEADING.test(lines[i]) || FENCE.test(lines[i]) || HR.test(lines[i]) || QUOTE.test(lines[i]) || LIST.test(lines[i])))) para.push(lines[i++]);
    out.push(`<p>${para.map((l, k) => (k < para.length - 1 && / {2,}$/.test(l) ? `${inline(l.trimEnd())}<br>` : inline(l.trim()))).join(" ")}</p>`);
  }
  return out.join("\n");
}

function list(lines: string[], start: number): { html: string; next: number } {
  const first = LIST.exec(lines[start])!;
  const base = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST.exec(lines[i]);
    if (!m || m[1].length < base || (m[1].length === base && /\d/.test(m[2]) !== ordered)) break;
    if (m[1].length > base) break;
    let text = m[3];
    const sub: string[] = [];
    i++;
    while (i < lines.length && !isBlank(lines[i])) {
      const n = LIST.exec(lines[i]);
      if (n && n[1].length <= base) break;
      if (n || /^\s{2,}\S/.test(lines[i])) sub.push(lines[i]); else break;
      i++;
    }
    const inner = sub.length && LIST.test(sub[0]) ? blocks(sub) : "";
    if (inner === "" && sub.length) text += " " + sub.map((l) => l.trim()).join(" ");
    const task = /^\[([ xX])\]\s+/.exec(text);
    const body = task ? `<input type="checkbox" disabled${task[1] !== " " ? " checked" : ""}> ${inline(text.slice(task[0].length))}` : inline(text);
    items.push(`<li${task ? ' class="task"' : ""}>${body}${inner}</li>`);
    if (i < lines.length && isBlank(lines[i]) && i + 1 < lines.length && LIST.test(lines[i + 1]) && LIST.exec(lines[i + 1])![1].length === base) i++;
  }
  const tag = ordered ? "ol" : "ul";
  const startAt = ordered && parseInt(first[2], 10) !== 1 ? ` start="${parseInt(first[2], 10)}"` : "";
  return { html: `<${tag}${startAt}>${items.join("")}</${tag}>`, next: i };
}
