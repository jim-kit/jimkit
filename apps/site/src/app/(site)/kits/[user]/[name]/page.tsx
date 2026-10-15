import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { loadCommunityKits } from "@/lib/registry";
import { absolute } from "@/lib/site";

export const dynamicParams = false;

/** A static export needs at least one page here, so while the registry lists nothing there is one placeholder, which says so and is kept out of search results. */
export async function generateStaticParams() {
  const kits = await loadCommunityKits();
  return kits.length ? kits.map((k) => { const [user, name] = k.repo.split("/"); return { user, name }; }) : [{ user: "none", name: "listed" }];
}

const find = async (user: string, name: string) => (await loadCommunityKits()).find((k) => k.repo === `${user}/${name}`.toLowerCase());
const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);

export async function generateMetadata({ params }: { params: Promise<{ user: string; name: string }> }): Promise<Metadata> {
  const { user, name } = await params;
  const k = await find(user, name);
  if (!k) return { title: "Kit not found", robots: { index: false, follow: false } };
  return { title: `${k.name}: a kit for Jimkit`, description: k.description || `${k.name} is a kit for Jimkit.`, alternates: { canonical: `/kits/${k.repo}/` } };
}

export default async function KitPage({ params }: { params: Promise<{ user: string; name: string }> }) {
  const { user, name } = await params;
  const k = await find(user, name);
  if (!k) {
    return (
      <main className="mx-auto max-w-[1000px] px-5 pb-28 pt-[104px]">
        <h1 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[0.98]">That kit is not listed.</h1>
        <p className="mt-5 max-w-[36rem] text-[1.05rem] leading-relaxed text-dim">It may have been removed from the registry, or it has not been listed yet. <Link href="/kits/" className="text-accent hover:underline">See all kits</Link>.</p>
      </main>
    );
  }
  const [owner, repoName] = k.repo.split("/");
  return (
    <main className="mx-auto max-w-[1000px] px-5 pb-28 pt-[104px]">
      <JsonLd data={[{ "@context": "https://schema.org", "@type": "SoftwareApplication", name: k.name, description: k.description, softwareVersion: k.latest, applicationCategory: "UtilitiesApplication", operatingSystem: "Any", url: absolute(`/kits/${k.repo}/`), codeRepository: `https://github.com/${k.repo}`, ...(k.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: k.rating.average, ratingCount: k.rating.count } } : {}) }]} />
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

      <h2 className="font-display mt-14 text-[1.9rem]">Versions</h2>
      <div className="jk-card mt-4 overflow-x-auto rounded-xl">
        <table className="w-full text-left text-[14px]">
          <thead><tr className="border-b border-line text-[12px] uppercase tracking-[0.12em] text-faint"><th className="px-4 py-2.5 font-semibold">Version</th><th className="px-4 py-2.5 font-semibold">Released</th><th className="px-4 py-2.5 font-semibold">Size</th><th className="px-4 py-2.5 font-semibold">Server code</th></tr></thead>
          <tbody>{k.versions.map((v) => <tr key={v.version} className="border-b border-line last:border-0"><td className="px-4 py-2.5 font-mono">{v.version}</td><td className="px-4 py-2.5 text-dim">{v.date}</td><td className="px-4 py-2.5 text-dim">{size(v.size)}</td><td className="px-4 py-2.5 text-dim">{v.server ? "Yes" : "No"}</td></tr>)}</tbody>
        </table>
      </div>
    </main>
  );
}
