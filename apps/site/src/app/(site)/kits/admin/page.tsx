import type { Metadata } from "next";
import Link from "next/link";
import { AdminKits } from "@/components/AdminKits";

export const metadata: Metadata = { title: "Registry admin", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-[1000px] px-5 pb-28 pt-[104px]">
      <p className="font-mono-label text-faint"><Link href="/kits/" className="hover:text-fg">Kits</Link> / Admin</p>
      <h1 className="font-display mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] leading-none">Registry admin</h1>
      <AdminKits />
    </main>
  );
}
