import { statSync } from "node:fs";
import { resolve } from "node:path";
import type { MetadataRoute } from "next";
import { DOCS } from "@/lib/docs-meta";
import { absolute } from "@/lib/site";

export const dynamic = "force-static";

/** Every page worth finding: the home page, the docs index, each doc and the changelog. The date is when the file last changed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const root = resolve(process.cwd(), "../..");
  const changed = (rel: string) => { try { return statSync(resolve(root, rel)).mtime; } catch { return new Date(); } };
  return [
    { url: absolute("/"), lastModified: changed("README.md"), changeFrequency: "weekly", priority: 1 },
    { url: absolute("/docs/"), lastModified: changed("docs"), changeFrequency: "weekly", priority: 0.8 },
    ...DOCS.map((d) => ({ url: absolute(`/docs/${d.slug}/`), lastModified: changed(`docs/${d.slug}.md`), changeFrequency: "monthly" as const, priority: d.slug === "install" ? 0.9 : 0.7 })),
    { url: absolute("/kits/"), lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: absolute("/changelog/"), lastModified: changed("CHANGELOG.md"), changeFrequency: "weekly", priority: 0.5 },
  ];
}
