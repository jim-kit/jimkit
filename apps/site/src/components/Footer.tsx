import Link from "next/link";
import { DOCS } from "@/lib/docs-meta";
import { Logo } from "./Logo";

export function Footer({ version }: { version: string }) {
  const col = "space-y-2 text-[14px] text-dim";
  const a = "transition-colors hover:text-fg";
  const head = "font-mono-label mb-3 text-faint";
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 pb-10 pt-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5"><Logo size={30} /><span className="font-display text-[1.5rem]">Jimkit</span></div>
          <p className="mt-3 max-w-xs text-[14px] leading-relaxed text-dim">Your tools, unified.</p>
        </div>
        <div><h4 className={head}>Product</h4>
          <ul className={col}>{[["Workbench", "/#workbench"], ["Tools", "/#tools"], ["Arrange", "/#playground"], ["Looks", "/#looks"], ["Kits", "/kits/"], ["Install", "/#install"]].map(([l, h]) => <li key={h}><Link className={a} href={h}>{l}</Link></li>)}</ul></div>
        <div><h4 className={head}>Docs</h4>
          <ul className={col}>{DOCS.slice(0, 5).map((d) => <li key={d.slug}><Link className={a} href={`/docs/${d.slug}/`}>{d.title}</Link></li>)}</ul></div>
        <div><h4 className={head}>Project</h4>
          <ul className={col}><li><Link className={a} href="/changelog/">Changelog</Link></li><li><Link className={a} href="/docs/security/">Security</Link></li><li><Link className={a} href="/docs/architecture/">Architecture</Link></li></ul></div>
      </div>
      <div aria-hidden className="wordmark font-display select-none overflow-hidden text-center">jimkit</div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-2 px-5 py-5 text-[13px] text-faint">
          <span>Jimkit {version}, pre-release.</span>
          <span>AGPL-3.0-or-later. The SDK and the UI kit are MIT.</span>
        </div>
      </div>
    </footer>
  );
}
