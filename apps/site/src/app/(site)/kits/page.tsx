import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { KitGrid, type KitCard } from "@/components/KitGrid";
import { loadBuiltInKits, loadCommunityKits } from "@/lib/registry";
import { absolute } from "@/lib/site";

export const metadata: Metadata = {
  title: "Kits",
  description: "The kits that come with Jimkit and the community kits listed in the registry. Each kit adds tools, a look, or both.",
  alternates: { canonical: "/kits/" },
};

const counts = (tools: number, looks: number) => [tools ? `${tools} tool${tools === 1 ? "" : "s"}` : "", looks ? `${looks} look${looks === 1 ? "" : "s"}` : ""].filter(Boolean);

export default async function KitsPage() {
  const builtIn = loadBuiltInKits();
  const community = await loadCommunityKits();
  const cards: KitCard[] = [
    ...community.map((k): KitCard => ({
      key: k.repo, href: `/kits/${k.repo}/`, label: `${k.repo} · v${k.latest}`, name: k.name, description: k.description, rating: k.rating,
      detail: [...(k.rating ? [] : ["No reviews"]), ...counts(k.tools.length, k.looks.length)].join(" · "),
      keywords: [k.author ?? "", ...k.tools.map((t) => `${t.name} ${t.blurb}`), ...k.looks.map((t) => `${t.name} ${t.blurb}`)].join(" "),
    })),
    ...builtIn.map((k): KitCard => ({ key: k.id, label: "Built in", name: k.name, description: k.description, detail: [...k.tools, ...k.looks].join(" · "), keywords: [...k.tools, ...k.looks].join(" ") })),
  ];
  return (
    <main className="mx-auto max-w-[1240px] px-5 pb-28 pt-[104px]">
      <JsonLd data={[{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Jimkit kits", url: absolute("/kits/"), hasPart: community.map((k) => ({ "@type": "SoftwareApplication", name: k.name, url: absolute(`/kits/${k.repo}/`) })) }]} />
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-[clamp(2.2rem,4.6vw,3.6rem)] leading-none">Kits</h1>
        <Link href="/kits/submit/" className="text-[14px] text-dim hover:text-fg">List your kit</Link>
      </div>
      <KitGrid kits={cards} />
    </main>
  );
}
