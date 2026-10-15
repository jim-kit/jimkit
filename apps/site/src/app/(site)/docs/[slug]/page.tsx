import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocBody } from "@/components/DocBody";
import { DocsShell } from "@/components/DocsShell";
import { JsonLd } from "@/components/JsonLd";
import { DOCS, loadDoc } from "@/lib/docs";
import { SITE_NAME, absolute } from "@/lib/site";

export const dynamicParams = false;
export const generateStaticParams = () => DOCS.map((d) => ({ slug: d.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = DOCS.find((x) => x.slug === slug);
  if (!d) return {};
  const url = `/docs/${d.slug}/`;
  return { title: d.seo, description: `${d.blurb} Jimkit documentation.`, alternates: { canonical: url }, openGraph: { type: "article", title: `${d.seo} · ${SITE_NAME}`, description: d.blurb, url }, twitter: { title: `${d.seo} · ${SITE_NAME}`, description: d.blurb } };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const doc = loadDoc((await params).slug);
  if (!doc) notFound();
  const url = absolute(`/docs/${doc.slug}/`);
  return (
    <DocsShell current={doc.slug} title={doc.title} blurb={doc.blurb} headings={doc.headings}>
      <JsonLd data={[
        { "@context": "https://schema.org", "@type": "TechArticle", headline: doc.seo, description: doc.blurb, url, mainEntityOfPage: url, inLanguage: "en", isPartOf: { "@type": "WebSite", name: SITE_NAME, url: absolute("/") }, about: { "@type": "SoftwareApplication", name: SITE_NAME } },
        { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: absolute("/") },
          { "@type": "ListItem", position: 2, name: "Docs", item: absolute("/docs/") },
          { "@type": "ListItem", position: 3, name: doc.title, item: url },
        ] },
      ]} />
      <DocBody html={doc.html} />
    </DocsShell>
  );
}
