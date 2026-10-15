import type { Metadata } from "next";
import { DocBody } from "@/components/DocBody";
import { DocsShell } from "@/components/DocsShell";
import { loadChangelog } from "@/lib/docs";

export const metadata: Metadata = { title: "Changelog", description: "What changed in Jimkit, release by release, newest first.", alternates: { canonical: "/changelog/" } };

export default function Changelog() {
  const { html, headings } = loadChangelog();
  return (
    <DocsShell current="changelog" title="Changelog" blurb="What changed, newest first." headings={headings.filter((h) => h.level === 2)}>
      <DocBody html={html} />
    </DocsShell>
  );
}
