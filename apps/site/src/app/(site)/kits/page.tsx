import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { loadBuiltInKits, loadCommunityKits } from "@/lib/registry";
import { absolute } from "@/lib/site";

export const metadata: Metadata = {
  title: "Kits",
  description: "The kits that come with Jimkit and the community kits listed in the registry. Each kit adds tools, a look, or both.",
  alternates: { canonical: "/kits/" },
};

const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

export default async function KitsPage() {
  const builtIn = loadBuiltInKits();
  const community = await loadCommunityKits();
  return (
    <main className="mx-auto max-w-[1240px] px-5 pb-28 pt-[104px]">
      <JsonLd data={[{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Jimkit kits", url: absolute("/kits/"), hasPart: community.map((k) => ({ "@type": "SoftwareApplication", name: k.name, url: absolute(`/kits/${k.repo}/`) })) }]} />
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-[clamp(2.2rem,4.6vw,3.6rem)] leading-none">Kits</h1>
        <Link href="/docs/kits/" className="text-[14px] text-dim hover:text-fg">List your kit</Link>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {community.map((k) => (
          <Link key={k.repo} href={`/kits/${k.repo}/`} className="jk-card flex flex-col rounded-2xl p-5 transition hover:border-line-strong hover:bg-raised-2">
            <p className="font-mono-label text-faint">{k.repo} · v{k.latest}</p>
            <p className="font-display mt-2 text-[1.5rem]">{k.name}</p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-dim">{k.description}</p>
            <p className="mt-auto pt-4 text-[13.5px] text-faint">
              {k.rating ? <span aria-label={`Rated ${k.rating.average} out of 5 by ${k.rating.count}`}>{stars(k.rating.average)} {k.rating.average.toFixed(1)} ({k.rating.count})</span> : "No reviews"}
              {k.tools.length ? ` · ${k.tools.length} tool${k.tools.length === 1 ? "" : "s"}` : ""}{k.looks.length ? ` · ${k.looks.length} look${k.looks.length === 1 ? "" : "s"}` : ""}
            </p>
          </Link>
        ))}
        {builtIn.map((k) => (
          <div key={k.id} className="jk-card flex flex-col rounded-2xl p-5">
            <p className="font-mono-label text-faint">Built in</p>
            <p className="font-display mt-2 text-[1.5rem]">{k.name}</p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-dim">{k.description}</p>
            <p className="mt-auto pt-4 text-[13.5px] text-faint">{[...k.tools, ...k.looks].join(" · ")}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
