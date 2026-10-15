"use client";

import { Tile } from "@jimkit/ui";
import Link from "next/link";
import { Badge } from "./Badge";
import { Cube } from "./Cube";

// tiles that drift around the cube, one per category colour
const ORBIT: { icon: string; hue: number; x: string; y: string; size: number; d: number }[] = [
  { icon: "PenLine", hue: 285, x: "2%", y: "12%", size: 54, d: 0 }, { icon: "Shuffle", hue: 45, x: "86%", y: "6%", size: 48, d: 1.3 },
  { icon: "Crop", hue: 345, x: "90%", y: "68%", size: 56, d: 2.6 }, { icon: "Fingerprint", hue: 75, x: "0%", y: "70%", size: 46, d: 3.4 },
];

export function Hero({ toolCount, version }: { toolCount: number; version: string }) {
  return (
    <section className="relative overflow-x-clip pt-[60px]">
      <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-5 py-14 lg:min-h-[min(760px,calc(100vh-60px))] lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:py-10">
        <div>
          <p className="font-mono-label text-faint">Self-hosted toolkit · v{version}</p>
          <h1 className="font-display mt-6 text-[clamp(3.3rem,8.4vw,7.2rem)] leading-[0.95]">
            Your tools,<br />unified.
          </h1>
          <p className="mt-8 max-w-[33rem] text-[clamp(1.05rem,1.6vw,1.25rem)] leading-relaxed text-dim text-pretty">
            Jimkit brings the tools you reach for every day into one application that you host yourself. Convert video, audio and documents, hash and compare files, edit text and images, and format JSON, with {toolCount} tools available today and more that can be added with kits.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/docs/install/" className="rounded-lg border border-accent bg-accent px-6 py-3.5 text-[15px] font-semibold text-accent-fg transition hover:brightness-95">Install Jimkit</Link>
            <Link href="/docs/" className="jk-btn rounded-lg border border-line-strong px-6 py-3.5 text-[15px] font-semibold transition hover:bg-tint-2">Read the docs</Link>
          </div>
        </div>
        {/* the mark in cream and ink on a setting sun */}
        <div className="relative mx-auto aspect-square w-full max-w-[520px]">
          <div aria-hidden className="sun-disc absolute inset-[3%]" />
          <Cube poster className="absolute inset-[13%] size-[74%]" />
          {ORBIT.map((o) => <span key={o.icon} aria-hidden className="orbit-tile absolute max-sm:hidden" style={{ left: o.x, top: o.y, animationDelay: `${-o.d}s` }}><Tile icon={o.icon} hue={o.hue} size={o.size} /></span>)}
          <Badge className="absolute -bottom-2 right-0 w-[108px] max-lg:hidden" />
        </div>
      </div>
    </section>
  );
}
