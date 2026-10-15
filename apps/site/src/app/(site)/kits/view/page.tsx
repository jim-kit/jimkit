import type { Metadata } from "next";
import { KitDetail } from "@/components/KitDetail";

// the kit is chosen by the address (?repo=user/name) and read from the registry when the page opens, so a new kit needs no new deploy
export const metadata: Metadata = { title: "Kit", description: "A kit for Jimkit.", alternates: { canonical: "/kits/" }, robots: { index: false } };

export default function KitPage() {
  return (
    <main className="mx-auto max-w-[1000px] px-5 pb-28 pt-[104px]">
      <KitDetail />
    </main>
  );
}
