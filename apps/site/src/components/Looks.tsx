"use client";

import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { THEMES, useLook } from "@/lib/look";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

/** Three live frames, each the same JSON document in the text editor, in one look. They are real pages (/frame/), so scrolling, typing and the tree all work. */
export function Looks() {
  const { theme, mode, accent, setTheme } = useLook();
  const frames = useRef<(HTMLIFrameElement | null)[]>([]);
  const tell = (f: HTMLIFrameElement | null) => f?.contentWindow?.postMessage({ type: "jk-look", mode, accent }, location.origin);
  // the frames follow this page's mode and accent
  useEffect(() => { frames.current.forEach(tell); }, [mode, accent]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Section id="looks" num="06" label="Looks" title="One tool, four looks."
      intro="Jimkit includes four looks: Basic, Paper, Glass and Metro. This page is shown in Paper, and the frames below show the same tool in the other three. A look is a set of colour and shape variables, so every tool follows whichever one is chosen. A look can also provide its own home screen, as the Start screen does in Metro. Choose a look to apply it to this whole page, and switch between light and dark mode or change the accent colour from the controls at the top.">
      <div className="grid gap-5 lg:grid-cols-3">
        {THEMES.map((t, i) => (
          <Reveal key={t.id} delay={i}>
            <div className="flex items-baseline justify-between gap-3 pb-3">
              <div><p className="font-display text-[1.9rem]">{t.name}</p><p className="mt-1 text-[13.5px] text-dim">{t.blurb}</p></div>
              <button onClick={() => setTheme(theme === t.id ? "paper" : t.id)} aria-pressed={theme === t.id} className={`font-mono-label flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 transition-colors ${theme === t.id ? "border-accent text-accent" : "border-line-strong text-dim hover:text-fg"}`}>{theme === t.id ? <><Check size={13} /> In use</> : "Use it"}</button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-line-strong shadow-xl">
              <iframe ref={(el) => { frames.current[i] = el; }} onLoad={(e) => tell(e.currentTarget)} src={`/frame/?look=${t.id}&tool=text-editor&doc=json`} title={`The ${t.name} look, running`} loading="lazy" className="block h-[480px] w-full bg-bg" />
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
