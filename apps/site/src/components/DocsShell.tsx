import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { DOCS, type Heading } from "@/lib/docs";

const GROUPS = ["Start", "Use", "Build", "Reference"] as const;

/** Sidebar, content and an on-page contents list. `current` is a doc slug, or "changelog". */
export function DocsShell({ current, title, blurb, headings, children }: { current: string; title: string; blurb?: string; headings: Heading[]; children: React.ReactNode }) {
  const i = DOCS.findIndex((d) => d.slug === current);
  const prev = i > 0 ? DOCS[i - 1] : null;
  const next = i >= 0 && i < DOCS.length - 1 ? DOCS[i + 1] : null;
  const link = (active: boolean) => `block rounded-lg px-3 py-1.5 text-[14px] transition-colors ${active ? "bg-tint-2 text-fg" : "text-dim hover:bg-tint hover:text-fg"}`;
  const nav = (
    <div className="space-y-6">
      {GROUPS.map((g) => (
        <div key={g}>
          <p className="mb-1.5 px-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-faint">{g}</p>
          {DOCS.filter((d) => d.group === g).map((d) => <Link key={d.slug} href={`/docs/${d.slug}/`} aria-current={d.slug === current ? "page" : undefined} className={link(d.slug === current)}>{d.title}</Link>)}
        </div>
      ))}
      <div>
        <p className="mb-1.5 px-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-faint">Project</p>
        <Link href="/changelog/" className={link(current === "changelog")}>Changelog</Link>
      </div>
    </div>
  );
  return (
    <div className="mx-auto grid max-w-[1840px] gap-10 px-5 pb-24 pt-[92px] lg:grid-cols-[230px_minmax(0,1fr)] lg:px-8 xl:grid-cols-[230px_minmax(0,1fr)_210px]">
      <aside className="lg:sticky lg:top-[84px] lg:max-h-[calc(100vh-100px)] lg:self-start lg:overflow-y-auto">
        <details className="lg:hidden rounded-xl border border-line"><summary className="cursor-pointer px-4 py-3 text-[14px] font-medium">All docs</summary><div className="border-t border-line p-3">{nav}</div></details>
        <div className="hidden lg:block">{nav}</div>
      </aside>
      <article className="min-w-0">
        <header className="mb-8 border-b border-line pb-6">
          <h1 className="text-[clamp(1.8rem,3.4vw,2.5rem)] font-semibold tracking-tight">{title}</h1>
          {blurb && <p className="mt-2 text-[16px] text-dim">{blurb}</p>}
        </header>
        {children}
        {(prev || next) && (
          <nav aria-label="More docs" className="mt-14 grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
            {prev ? <Link href={`/docs/${prev.slug}/`} className="jk-card flex items-center gap-3 rounded-xl p-4 hover:border-line-strong"><ChevronLeft size={18} className="text-faint" /><span><span className="block text-[12px] text-faint">Previous</span><span className="font-medium">{prev.title}</span></span></Link> : <span />}
            {next && <Link href={`/docs/${next.slug}/`} className="jk-card flex items-center justify-end gap-3 rounded-xl p-4 text-right hover:border-line-strong"><span><span className="block text-[12px] text-faint">Next</span><span className="font-medium">{next.title}</span></span><ChevronRight size={18} className="text-faint" /></Link>}
          </nav>
        )}
      </article>
      {headings.length > 0 && (
        <aside className="hidden xl:sticky xl:top-[84px] xl:block xl:max-h-[calc(100vh-100px)] xl:self-start xl:overflow-y-auto">
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-faint">On this page</p>
          <ul className="space-y-1.5 border-l border-line text-[13px]">
            {headings.map((h) => <li key={h.id}><a href={`#${h.id}`} className={`block py-0.5 text-dim transition-colors hover:text-fg ${h.level === 3 ? "pl-7" : "pl-4"}`}>{h.text}</a></li>)}
          </ul>
        </aside>
      )}
    </div>
  );
}
