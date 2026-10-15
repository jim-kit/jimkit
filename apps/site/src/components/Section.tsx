import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

export type Tone = "paper" | "ink" | "accent" | "lime" | "lilac";

/** One band of the page: a number and label in the left rail, a plain headline, and an optional colour (the .block-* classes re-declare the tokens). */
export function Section({ id, num, label, title, intro, tone = "paper", children, bleed }: { id: string; num: string; label: string; title: ReactNode; intro?: ReactNode; tone?: Tone; children?: ReactNode; bleed?: ReactNode }) {
  return (
    <section id={id} className={tone === "paper" ? "" : `block-${tone}`}>
      <div className="mx-auto max-w-[1240px] px-5 py-20 md:py-28">
        <Reveal>
          <div className="grid gap-4 md:grid-cols-[170px_1fr] md:gap-10">
            <p className="font-mono-label text-faint md:pt-4"><span className="text-accent">{num}</span> / {label}</p>
            <div>
              <h2 className="font-display max-w-[22ch] text-[clamp(2.2rem,4.8vw,4rem)]">{title}</h2>
              {intro && <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-dim">{intro}</p>}
            </div>
          </div>
        </Reveal>
        {children && <div className="mt-12 md:mt-16">{children}</div>}
      </div>
      {bleed}
    </section>
  );
}
