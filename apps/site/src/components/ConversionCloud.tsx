"use client";

import { useEffect, useRef, useState } from "react";
import type { Scatter } from "@/lib/conversions";

/**
 * Chapter 04. The section is three screens tall and its content sticks to the screen while you scroll through it. Conversions fly in from
 * the edges one by one until the whole screen is covered; the count in the middle is the real number of direct conversions.
 */
export function ConversionCloud({ items, pairs, formats }: { items: Scatter[]; pairs: number; formats: number }) {
  const root = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = -1;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const travel = r.height - innerHeight;
        const p = reduce ? 1 : Math.max(0, Math.min(1, travel > 0 ? -r.top / travel : 0));
        el.style.setProperty("--p", p.toFixed(4));
        const n = Math.round(Math.min(1, p / 0.9) * pairs);
        if (n !== last) { last = n; setShown(n); }
      });
    };
    on();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [pairs]);

  return (
    <section id="converter" ref={root} className="cloud block-accent relative" style={{ ["--p" as string]: 0 }}>
      <div className="cloud-stick sticky top-0 h-screen overflow-hidden">
        <div aria-hidden className="absolute inset-0">
          {items.map((c, i) => (
            <span key={i} className={`cv cv-${c.look} cv-s${c.size} ${c.extra ? "cv-extra" : ""}`} style={{ left: `${c.x}%`, top: `${c.y}%`, ["--r" as string]: `${c.r}deg`, ["--t" as string]: c.t, ["--dx" as string]: `${c.dx}px`, ["--dy" as string]: `${c.dy}px` }}>{c.label}</span>
          ))}
        </div>
        {/* the text sits on a plate, so the chips pile up behind it and never get in its way */}
        <div className="absolute inset-0 grid place-items-center px-5">
          <div className="cloud-plate relative max-w-[760px] rounded-[22px] p-7 md:p-11">
            <p className="font-mono-label text-faint"><span className="text-accent">04</span> / Converter</p>
            <h2 className="font-display mt-4 text-[clamp(2.2rem,5vw,4.2rem)]">The converter handles larger files.</h2>
            <p className="mt-5 text-[16px] leading-relaxed text-dim">The converter supports images (including HEIC), video, audio, documents, PDFs, spreadsheets and data files. It runs ffmpeg, ImageMagick, LibreOffice, pandoc and poppler as queued jobs, each in its own working directory and with a time limit, and it deletes your uploads as soon as a job finishes. Because the work happens on your server, large files can be converted from any device.</p>
            <div className="mt-7 flex flex-wrap items-end gap-x-8 gap-y-3 border-t border-line-strong pt-5">
              <p className="font-display text-[clamp(2.6rem,6vw,4.4rem)] leading-none tabular-nums" aria-label={`${pairs} direct conversions`}>{shown}</p>
              <p className="max-w-[28ch] pb-1 text-[13.5px] leading-snug text-dim">direct conversions between {formats} formats, counted from the converter's own table. Chaining two steps adds more.</p>
            </div>
            <p className="mt-4 text-[13px] text-faint">The lite image has no engines and converts CSV, JSON and YAML; the full one (about 1.8 GB) does the rest.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
