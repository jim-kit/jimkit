import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

export default function NotFound() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-5 py-24 text-center">
      <div>
        <p className="font-mono-label text-faint">404</p>
        <h1 className="font-display mt-3 text-[clamp(2.4rem,6vw,4rem)]">That page is not here.</h1>
        <p className="mt-4 text-[16px] text-dim">It may have moved. The docs and the tools are one click away.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-lg border border-accent bg-accent px-6 py-3 text-[15px] font-semibold text-accent-fg">Home</Link>
          <Link href="/docs/" className="jk-btn rounded-lg border border-line-strong px-6 py-3 text-[15px] font-semibold">Docs</Link>
        </div>
      </div>
    </main>
  );
}
