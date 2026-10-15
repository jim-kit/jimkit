"use client";

import { Tile } from "@jimkit/ui";
import { ArrowUpRight } from "lucide-react";
import type { Category, SiteTool } from "@/lib/catalog";
import { useDemo } from "./Demo";
import { Section } from "./Section";

/** Every tool as a line in an index, numbered. The ones that run in the page open in the workbench above. */
export function ToolIndex({ tools, categories }: { tools: SiteTool[]; categories: Category[] }) {
  const { show } = useDemo();
  let n = 0;
  return (
    <Section id="tools" num="03" label="Tools" title={`${tools.length} tools, each with a clear purpose.`} intro={<>Each tool has a single, clear purpose and opens from the home screen or from the search palette. Select a line marked <span className="text-accent">runs here</span> to open it in the workbench above. The remaining tools work with your files and are available in your own Jimkit installation.</>}>
      <div className="border-t border-line-strong">
        {categories.map((c) => (
          <div key={c.id}>
            <div className="font-mono-label flex items-baseline justify-between gap-4 border-b border-line py-3 text-faint"><span>{c.name}</span><span className="hidden normal-case sm:inline">{c.blurb}</span></div>
            {tools.filter((t) => t.category === c.id).map((t) => {
              const i = ++n;
              const row = (
                <>
                  <span className="font-mono-label w-9 shrink-0 text-faint transition-colors group-hover:text-accent">{String(i).padStart(2, "0")}</span>
                  <span className="font-display min-w-0 flex-1 truncate text-[clamp(1.35rem,2.8vw,2.1rem)] transition-transform duration-300 group-hover:translate-x-2">{t.name}</span>
                  <span className="hidden max-w-[22rem] flex-1 text-[14px] leading-snug text-dim lg:block">{t.blurb}</span>
                  <span className="hidden w-[150px] shrink-0 justify-end sm:flex">
                    {t.demo ? <span className="font-mono-label flex items-center gap-1 text-accent">runs here <ArrowUpRight size={14} /></span> : <span className="font-mono-label text-faint">needs a server</span>}
                  </span>
                  <span className="w-[38px] shrink-0 opacity-70 transition-opacity group-hover:opacity-100"><Tile icon={t.icon} hue={c.hue} size={38} /></span>
                </>
              );
              const cls = "group flex w-full items-center gap-4 border-b border-line py-4 text-left transition-colors md:gap-6";
              return t.demo
                ? <button key={t.id} onClick={() => show(t.id)} className={`${cls} hover:bg-tint`}>{row}</button>
                : <div key={t.id} className={cls}>{row}</div>;
            })}
          </div>
        ))}
      </div>
    </Section>
  );
}
