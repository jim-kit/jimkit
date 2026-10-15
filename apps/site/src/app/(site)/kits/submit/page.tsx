import type { Metadata } from "next";
import Link from "next/link";
import { SubmitKit } from "@/components/SubmitKit";

export const metadata: Metadata = {
  title: "Submit a kit",
  description: "List your kit in the Jimkit registry. Sign in with GitHub and submit your repository; a maintainer approves every new kit.",
  alternates: { canonical: "/kits/submit/" },
  robots: { index: false },
};

export default function SubmitPage() {
  return (
    <main className="mx-auto max-w-[1000px] px-5 pb-28 pt-[104px]">
      <p className="font-mono-label text-faint"><Link href="/kits/" className="hover:text-fg">Kits</Link> / Submit</p>
      <h1 className="font-display mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] leading-none">Submit a kit</h1>
      <p className="mt-5 max-w-[36rem] text-[15.5px] leading-relaxed text-dim">The repository needs a release with <span className="font-mono text-[14px] text-fg">jimkit-kit.json</span> attached. A maintainer approves every new kit; after that, new releases appear on their own. See <Link href="/docs/kits/" className="text-accent hover:underline">the kit documentation</Link>.</p>
      <SubmitKit />
    </main>
  );
}
