import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { DOCS } from "@/lib/docs-meta";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

export function DocsTeaser({ changes }: { changes: string[] }) {
  return (
    <Section id="docs" num="12" label="Docs" title="Documentation for every part of Jimkit."
      intro="Each page is generated from the repository's own files when this site is built, so the documentation always reflects what the code does. You will find guides for installation, configuration, security and reverse proxies, along with tutorials for writing kits, creating looks and drawing your own home screen. The changelog is generated the same way.">
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
        <div className="grid gap-3 sm:grid-cols-2">
          {DOCS.map((d, i) => (
            <Reveal key={d.slug} delay={i % 2}>
              <Link href={`/docs/${d.slug}/`} className="jk-card group flex h-full flex-col rounded-xl p-5 transition hover:border-line-strong hover:bg-raised-2">
                <span className="font-mono-label text-faint">{d.group}</span>
                <span className="font-display mt-2 flex items-center justify-between text-[1.45rem]">{d.title}<ArrowRight size={17} className="text-faint transition group-hover:translate-x-0.5 group-hover:text-accent" /></span>
                <span className="mt-1.5 text-[14px] leading-relaxed text-dim">{d.blurb}</span>
              </Link>
            </Reveal>
          ))}
        </div>
        <Reveal delay={1}>
          <div className="rounded-xl border border-line p-6">
            <div className="flex items-baseline justify-between"><h3 className="font-display text-[1.5rem]">Latest changes</h3><span className="font-mono-label text-faint">0.1.0</span></div>
            <ul className="mt-4 divide-y divide-line text-[14px] leading-relaxed text-dim">{changes.map((c) => <li key={c} className="py-3">{c}</li>)}</ul>
            <Link href="/changelog/" className="font-mono-label mt-4 inline-flex items-center gap-1.5 text-accent hover:underline">Full changelog <ArrowRight size={13} /></Link>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
