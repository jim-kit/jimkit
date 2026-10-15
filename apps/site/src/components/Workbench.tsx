"use client";

import type { Category, SiteTool } from "@/lib/catalog";
import { useDemo } from "./Demo";
import { DemoWindow } from "./DemoWindow";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

/** The real tools, running in the page. */
export function Workbench({ tools, categories }: { tools: SiteTool[]; categories: Category[] }) {
  const { active, setActive } = useDemo();
  return (
    <Section id="workbench" num="02" label="Workbench" title="Try the tools in your browser."
      intro="The tools in this window are the same code that Jimkit runs on your own server. Type in them, switch between tools using the list on the left, and try the features that interest you. The converter and the image editor work with files, so they become available once Jimkit is installed.">
      <Reveal><DemoWindow tools={tools} categories={categories} active={active} onActive={setActive} /></Reveal>
    </Section>
  );
}
