import { DOCS } from "@/lib/docs-meta";
import { loadCommunityKits } from "@/lib/registry";
import { DESCRIPTION, SITE_NAME, absolute } from "@/lib/site";

export const dynamic = "force-static";

/** A plain-text map of the site for language models and other crawlers that read text better than pages (llmstxt.org). */
export async function GET() {
  const kits = await loadCommunityKits();
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${DESCRIPTION}`,
    "",
    "Jimkit is a self-hosted web app that runs on your own machine (Docker, or a Proxmox container). It bundles small tools (a file converter, a text editor with Markdown, JSON and YAML modes, a hash checker, an image editor and developer utilities) and can be extended with kits: tools, looks and layouts added from GitHub while it runs.",
    "",
    "## Documentation",
    ...DOCS.map((d) => `- [${d.title}](${absolute(`/docs/${d.slug}/`)}): ${d.blurb}`),
    "",
    "## Kits",
    `- [Kits](${absolute("/kits/")}): the kits that come built in, the community kits listed in the registry, and how to list your own`,
    ...kits.map((k) => `- [${k.name}](${absolute(`/kits/${k.repo}/`)}): ${k.description}`),
    "",
    "## More",
    `- [Changelog](${absolute("/changelog/")}): what changed, release by release`,
    `- [Home page](${absolute("/")}): live demos of the tools and the looks`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
