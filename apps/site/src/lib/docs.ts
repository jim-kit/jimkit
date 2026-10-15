import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderMarkdown } from "@jimkit/addon-text/markdown";

/** The docs are the repository's own Markdown files, rendered at build time, so the site never says something the docs don't. */
const ROOT = resolve(process.cwd(), "../..");

export { DOCS, type DocMeta } from "./docs-meta";
import { DOCS, type DocMeta } from "./docs-meta";
import { REPO_URL } from "./site";

export interface Heading { id: string; text: string; level: 2 | 3 }
export interface Doc extends DocMeta { html: string; headings: Heading[] }

const slugify = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

/**
 * Turns the repository's own links into the site's: a link to another doc becomes a page of the site, a link to any other file
 * (`../SECURITY.md`, `../packages/ui/src/tokens.css`) goes to the repository once the site is built with its address, and is plain text until then.
 */
function relink(md: string, dir: "docs" | ""): string {
  const slugs = new Set(DOCS.map((d) => d.slug));
  return md.replace(/(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text: string, href: string) => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) return all;
    const [path, hash] = href.split("#");
    const parts = [...(dir ? [dir] : []), ...path.split("/")].reduce<string[]>((acc, part) => { if (part === "..") acc.pop(); else if (part && part !== ".") acc.push(part); return acc; }, []);
    const file = parts.join("/");
    const doc = /^docs\/([a-z-]+)\.md$/.exec(file);
    if (doc && slugs.has(doc[1])) return `[${text}](/docs/${doc[1]}/${hash ? `#${hash}` : ""})`;
    if (file === "CHANGELOG.md") return `[${text}](/changelog/)`;
    return REPO_URL ? `[${text}](${REPO_URL}/blob/main/${file}${hash ? `#${hash}` : ""})` : text;
  });
}

export function renderDoc(file: string, meta?: Partial<DocMeta>, dir: "docs" | "" = "docs"): { html: string; headings: Heading[] } {
  const source = readFileSync(file, "utf8");
  let html = renderMarkdown(relink(source, dir));
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  html = html.replace(/<h([1-4])>([\s\S]*?)<\/h\1>/g, (_, level: string, inner: string) => {
    let id = slugify(inner) || "section";
    const n = seen.get(id) ?? 0; seen.set(id, n + 1); if (n) id += `-${n}`;
    if (level === "2" || level === "3") headings.push({ id, text: stripTags(inner), level: Number(level) as 2 | 3 });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  // links inside the site (or to a heading) stay in the same tab; the renderer opens everything in a new one
  html = html.replace(/<a href="(\/docs\/[^"]*|#[^"]*)" target="_blank" rel="[^"]*">/g, '<a href="$1">');
  // each code block gets a copy button (wired in components/DocBody.tsx), and tables scroll sideways on a phone instead of breaking the layout
  html = html.replace(/<pre>([\s\S]*?)<\/pre>/g, '<div class="doc-code"><button type="button" data-copy aria-label="Copy">Copy</button><pre>$1</pre></div>');
  html = html.replace(/<table>/g, '<div class="doc-table"><table>').replace(/<\/table>/g, "</table></div>");
  void meta;
  return { html, headings };
}

export function loadDoc(slug: string): Doc | null {
  const meta = DOCS.find((d) => d.slug === slug);
  if (!meta) return null;
  const { html, headings } = renderDoc(resolve(ROOT, "docs", `${slug}.md`), meta);
  // the page header already shows the title: drop the document's own first heading
  return { ...meta, html: html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>/, ""), headings };
}

export function docFiles(): string[] {
  return readdirSync(resolve(ROOT, "docs")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
}

export function loadChangelog() {
  const { html, headings } = renderDoc(resolve(ROOT, "CHANGELOG.md"), undefined, "");
  return { html: html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>/, ""), headings };
}

/** The first few entries of the changelog's newest section, as plain text. */
export function latestChanges(n = 5): string[] {
  const text = readFileSync(resolve(ROOT, "CHANGELOG.md"), "utf8");
  const start = text.indexOf("\n## [") + 1;
  const end = text.indexOf("\n## [", start + 1);
  const body = text.slice(start, end === -1 ? undefined : end);
  return body.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")).slice(0, n)
    .map((l) => (l.length > 190 ? `${l.slice(0, 187).replace(/\s+\S*$/, "")}…` : l));
}
