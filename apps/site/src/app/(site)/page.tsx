import { Access } from "@/components/Access";
import { Bento } from "@/components/Bento";
import { Converter } from "@/components/Converter";
import { DocsTeaser } from "@/components/DocsTeaser";
import { Faq, QA } from "@/components/Faq";
import { FinalCta } from "@/components/FinalCta";
import { Hero } from "@/components/Hero";
import { Install } from "@/components/Install";
import { JsonLd } from "@/components/JsonLd";
import { Kits } from "@/components/Kits";
import { Looks } from "@/components/Looks";
import { Playground } from "@/components/Playground";
import { Statements } from "@/components/Statements";
import { ToolIndex } from "@/components/ToolIndex";
import { Workbench } from "@/components/Workbench";
import { loadCatalog, productVersion } from "@/lib/catalog";
import { latestChanges } from "@/lib/docs";
import { DESCRIPTION, REPO_URL, SITE_NAME, TITLE, absolute } from "@/lib/site";

export default function Home() {
  const { categories, tools, actions } = loadCatalog();
  const structured = [
    {
      "@context": "https://schema.org", "@type": "SoftwareApplication",
      name: SITE_NAME, headline: TITLE, description: DESCRIPTION, url: absolute("/"), image: absolute("/opengraph-image.png"),
      applicationCategory: "UtilitiesApplication", operatingSystem: "Linux, Docker, Proxmox VE", softwareVersion: productVersion(), inLanguage: "en",
      isAccessibleForFree: true, license: "https://www.gnu.org/licenses/agpl-3.0.html", installUrl: absolute("/docs/install/"),
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [`${tools.length} tools in one app`, "Converts video, audio, images, documents and data between hundreds of format pairs", "Text editor with Markdown preview and JSON and YAML modes", "Hash, HMAC and checksum tool for text and large files", "Add tools, looks and layouts from GitHub without rebuilding", "Trusted, unlocked and public tiers with per-visitor limits", "Docker and Proxmox installers, with one-command updates"],
      ...(REPO_URL ? { codeRepository: REPO_URL, sameAs: [REPO_URL] } : {}),
    },
    { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: absolute("/"), inLanguage: "en" },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: QA.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  return (
    <main>
      <JsonLd data={structured} />
      <Hero toolCount={tools.length} version={productVersion()} />
      <Statements />
      <Workbench tools={tools} categories={categories} />
      <ToolIndex tools={tools} categories={categories} />
      <Converter />
      <Playground tools={tools} categories={categories} />
      <Looks />
      <Bento actions={actions} />
      <Access />
      <Kits />
      <Install />
      <Faq />
      <DocsTeaser changes={latestChanges(5)} />
      <FinalCta />
    </main>
  );
}
