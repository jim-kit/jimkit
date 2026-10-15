import type { Metadata } from "next";
import Link from "next/link";
import { DocsShell } from "@/components/DocsShell";
import { DOCS } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Install Jimkit with Docker or Proxmox, configure it, put it behind a reverse proxy, write kits, themes and layouts, and read how it is secured.",
  alternates: { canonical: "/docs/" },
};

export default function DocsIndex() {
  return (
    <DocsShell current="" title="Docs" blurb="Everything is a Markdown file in the repository; these pages are built from them." headings={[]}>
      <div className="grid gap-3 sm:grid-cols-2">
        {DOCS.map((d) => (
          <Link key={d.slug} href={`/docs/${d.slug}/`} className="jk-card rounded-2xl p-5 transition hover:border-line-strong hover:bg-raised-2">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-faint">{d.group}</span>
            <span className="mt-1.5 block text-[17px] font-semibold">{d.title}</span>
            <span className="mt-1 block text-[14px] leading-relaxed text-dim">{d.blurb}</span>
          </Link>
        ))}
      </div>
    </DocsShell>
  );
}
