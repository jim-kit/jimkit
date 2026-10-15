import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { KitGrid, type KitCard } from "@/components/KitGrid";
import { loadBuiltInKits } from "@/lib/registry";
import { absolute } from "@/lib/site";

export const metadata: Metadata = {
  title: "Kits",
  description: "The kits that come with Jimkit and the community kits listed in the registry. Each kit adds tools, a look, or both.",
  alternates: { canonical: "/kits/" },
};

export default function KitsPage() {
  const builtIn: KitCard[] = loadBuiltInKits().map((k) => ({ key: k.id, label: "Built in", name: k.name, description: k.description, detail: [...k.tools, ...k.looks].join(" · "), keywords: [...k.tools, ...k.looks].join(" ") }));
  return (
    <main className="mx-auto max-w-[1240px] px-5 pb-28 pt-[104px]">
      <JsonLd data={[{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Jimkit kits", url: absolute("/kits/") }]} />
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-[clamp(2.2rem,4.6vw,3.6rem)] leading-none">Kits</h1>
        <Link href="/kits/submit/" className="text-[14px] text-dim hover:text-fg">List your kit</Link>
      </div>
      <KitGrid builtIn={builtIn} />
    </main>
  );
}
