"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface KitCard {
  key: string;
  /** a community kit links to its page; a built-in one doesn't */
  href?: string;
  label: string;
  name: string;
  description: string;
  detail: string;
  /** everything the search looks through, besides the name and the description */
  keywords: string;
  rating?: { average: number; count: number } | null;
}

const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

/** The cards, and a box that narrows them as you type (name, description, address, tools and looks). */
export function KitGrid({ kits }: { kits: KitCard[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? kits.filter((k) => { const hay = `${k.name} ${k.description} ${k.label} ${k.keywords}`.toLowerCase(); return words.every((w) => hay.includes(w)); }) : kits;
  }, [kits, q]);
  const card = (k: KitCard) => {
    const body = (
      <>
        <p className="font-mono-label text-faint">{k.label}</p>
        <p className="font-display mt-2 text-[1.5rem]">{k.name}</p>
        <p className="mt-2 text-[14.5px] leading-relaxed text-dim">{k.description}</p>
        <p className="mt-auto pt-4 text-[13.5px] text-faint">
          {k.rating ? <span aria-label={`Rated ${k.rating.average} out of 5 by ${k.rating.count}`}>{stars(k.rating.average)} {k.rating.average.toFixed(1)} ({k.rating.count}) · </span> : null}{k.detail}
        </p>
      </>
    );
    return k.href
      ? <Link key={k.key} href={k.href} className="jk-card flex flex-col rounded-2xl p-5 transition hover:border-line-strong hover:bg-raised-2">{body}</Link>
      : <div key={k.key} className="jk-card flex flex-col rounded-2xl p-5">{body}</div>;
  };
  return (
    <>
      <label className="relative mt-6 block max-w-[28rem]">
        <span className="sr-only">Search kits</span>
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search kits" autoComplete="off" className="bg-field w-full rounded-lg border border-line-strong py-2.5 pl-10 pr-3 text-[15px] outline-none focus:border-accent" />
      </label>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
        {shown.map(card)}
      </div>
      {!shown.length && <p className="mt-6 text-[15px] text-dim">No kits match.</p>}
    </>
  );
}
