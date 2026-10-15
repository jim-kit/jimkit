import Link from "next/link";
import { Reveal } from "./Reveal";

export function FinalCta() {
  return (
    <section className="block-sun">
      <div className="mx-auto max-w-[1240px] px-5 py-24 md:py-36">
        <Reveal>
          <h2 className="font-display max-w-[16ch] text-[clamp(3rem,8vw,7rem)] leading-[0.95]">Run it on your own machine.</h2>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/docs/install/" className="sun-btn rounded-lg px-7 py-4 text-[16px] font-semibold transition hover:opacity-90">Install it</Link>
            <Link href="/docs/" className="rounded-lg border border-line-strong px-7 py-4 text-[16px] font-semibold transition hover:bg-tint-2">Read the docs</Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
