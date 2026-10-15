"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchCommunityKits, type CommunityKit } from "@/lib/registry-data";
import { ReviewBox } from "./ReviewBox";

const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);

/** One community kit, read from the registry's index when the page opens: /kits/view/?repo=user/name */
export function KitDetail() {
  const [state, setState] = useState<{ kit: CommunityKit } | "loading" | "missing" | "error">("loading");
  useEffect(() => {
    const repo = (new URLSearchParams(location.search).get("repo") ?? "").trim().toLowerCase();
    let stale = false;
    fetchCommunityKits()
      .then((kits) => { const kit = kits.find((k) => k.repo === repo); if (!stale) setState(kit ? { kit } : "missing"); })
      .catch(() => { if (!stale) setState("error"); });
    return () => { stale = true; };
  }, []);

  if (state === "loading") return <p className="mt-6 text-[15px] text-faint">Loading…</p>;
  if (state === "missing" || state === "error") {
    return (
      <>
        <h1 className="font-display mt-4 text-[clamp(2.2rem,5vw,3.6rem)] leading-[0.98]">{state === "error" ? "The registry can't be reached." : "That kit is not listed."}</h1>
        <p className="mt-5 max-w-[36rem] text-[1.05rem] leading-relaxed text-dim">{state === "error" ? "Try again in a moment." : "It may have been removed from the registry, or it has not been approved yet."} <Link href="/kits/" className="text-accent hover:underline">See all kits</Link>.</p>
      </>
    );
  }
  const k = state.kit;
  const [owner, repoName] = k.repo.split("/");
  document.title = `${k.name}: a kit for Jimkit`;
  return (
    <>
      <p className="font-mono-label text-faint"><Link href="/kits/" className="hover:text-fg">Kits</Link> / {owner} / {repoName}</p>
      <h1 className="font-display mt-4 text-[clamp(2.4rem,5.4vw,4.4rem)] leading-[0.98]">{k.name}</h1>
      <p className="mt-5 max-w-[40rem] text-[1.1rem] leading-relaxed text-dim">{k.description}</p>
      <p className="mt-4 text-[14px] text-faint">
        Version {k.latest}{k.author ? ` · by ${k.author}` : ""}
        {k.rating ? <> · <span aria-label={`Rated ${k.rating.average} out of 5 by ${k.rating.count}`}>{stars(k.rating.average)} {k.rating.average.toFixed(1)} ({k.rating.count})</span></> : " · No reviews yet"}
        {k.stars !== undefined ? ` · ${k.stars} GitHub stars` : ""}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href={`https://github.com/${k.repo}`} rel="noopener" className="jk-btn rounded-lg border border-line-strong px-5 py-3 text-[14.5px] font-semibold transition hover:bg-tint-2">View on GitHub</a>
        {k.homepage && <a href={k.homepage} rel="noopener noreferrer" className="jk-btn rounded-lg border border-line-strong px-5 py-3 text-[14.5px] font-semibold transition hover:bg-tint-2">Website</a>}
      </div>

      <h2 className="font-display mt-14 text-[1.9rem]">Install</h2>
      <p className="mt-3 text-[14.5px] text-dim">Kits → paste</p>
      <pre className="jk-card mt-4 overflow-x-auto rounded-xl p-4 font-mono text-[14px]">{k.repo}</pre>

      {(k.tools.length > 0 || k.looks.length > 0) && (
        <>
          <h2 className="font-display mt-14 text-[1.9rem]">{k.tools.length ? "What it adds" : "The look it adds"}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {[...k.tools, ...k.looks].map((t) => (
              <li key={t.name} className="jk-card rounded-xl p-4"><p className="font-semibold">{t.name}</p>{t.blurb && <p className="mt-1 text-[14.5px] text-dim">{t.blurb}</p>}</li>
            ))}
          </ul>
        </>
      )}

      <h2 className="font-display mt-14 text-[1.9rem]">Reviews</h2>
      {k.reviews.length ? (
        <ul className="mt-4 space-y-3">
          {k.reviews.map((r) => (
            <li key={`${r.user}-${r.date}`} className="jk-card rounded-xl p-4">
              <p className="text-[14px]"><span aria-label={`${r.rating} out of 5`}>{stars(r.rating)}</span> <a href={`https://github.com/${r.user}`} rel="noopener" className="font-semibold hover:underline">{r.user}</a><span className="text-faint">{r.version ? ` · on ${r.version}` : ""}{r.date ? ` · ${r.date}` : ""}</span></p>
              {r.text && <p className="mt-2 text-[15px] leading-relaxed text-dim">{r.text}</p>}
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-[15px] text-dim">None yet.</p>}
      <h3 className="mt-8 text-[1.15rem] font-semibold">Write a review</h3>
      <ReviewBox repo={k.repo} versions={k.versions.map((v) => v.version)} />

      <h2 className="font-display mt-14 text-[1.9rem]">Versions</h2>
      <div className="jk-card mt-4 overflow-x-auto rounded-xl">
        <table className="w-full text-left text-[14px]">
          <thead><tr className="border-b border-line text-[12px] uppercase tracking-[0.12em] text-faint"><th className="px-4 py-2.5 font-semibold">Version</th><th className="px-4 py-2.5 font-semibold">Released</th><th className="px-4 py-2.5 font-semibold">Size</th><th className="px-4 py-2.5 font-semibold">Server code</th></tr></thead>
          <tbody>{k.versions.map((v) => <tr key={v.version} className="border-b border-line last:border-0"><td className="px-4 py-2.5 font-mono">{v.version}</td><td className="px-4 py-2.5 text-dim">{v.date}</td><td className="px-4 py-2.5 text-dim">{size(v.size)}</td><td className="px-4 py-2.5 text-dim">{v.server ? "Yes" : "No"}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
