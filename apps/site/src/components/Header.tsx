"use client";

import { ColorPicker, Seg, hexToHsv } from "@jimkit/ui";
import { Menu as MenuIcon, Moon, Search, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { accentHex, customAccent } from "@/lib/accent";
import { THEMES, useLook, type Theme } from "@/lib/look";
import { REPO_URL } from "@/lib/site";
import { GitHubMark } from "./GitHubMark";
import { Logo } from "./Logo";

// the site's own accents are custom colours, so the logo, tiles and tools all take them
const WARM: [string, string][] = [["vermilion", "#ff4d1f"], ["mustard", "#f2a900"], ["forest", "#25b878"], ["lilac", "#8a63ff"], ["pink", "#e8407a"], ["ink", "#1a1510"]];
const NAV = [
  { href: "/#workbench", label: "Try it" },
  { href: "/#tools", label: "Tools" },
  { href: "/#looks", label: "Looks" },
  { href: "/#kits", label: "Kits" },
  { href: "/#install", label: "Install" },
  { href: "/docs/", label: "Docs" },
];

/** The looks the app has besides Paper, light or dark, and the accent colour: the same controls the app has, switching this page. */
export function LookControls({ stacked }: { stacked?: boolean }) {
  const { theme, mode, accent, setTheme, setMode, setAccent } = useLook();
  const [custom, setCustom] = useState(false);
  const hex = accentHex(accent) ?? "#ff4d1f";
  return (
    <div className={stacked ? "flex flex-col gap-4" : "flex items-center gap-2"}>
      <Seg label="Look" compact value={theme as string} options={THEMES.map((t) => ({ id: t.id as string, label: t.name, title: t.blurb }))} onChange={(t) => setTheme(t === theme ? "paper" : (t as Theme))} />
      <button onClick={() => setMode(mode === "dark" ? "light" : "dark")} aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={mode === "dark" ? "Light mode" : "Dark mode"} className="jk-btn grid size-[34px] shrink-0 place-items-center rounded-lg border border-line-strong text-dim hover:bg-tint-2 hover:text-fg">
        {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <div className={`relative flex h-[34px] shrink-0 items-center gap-2 rounded-lg border border-line-strong px-2.5 ${stacked ? "" : "max-xl:hidden"}`} role="group" aria-label="Accent colour">
        {WARM.map(([name, h]) => {
          const id = name === "ink" ? "ink" : `hex-${h.slice(1)}`;
          return <button key={name} onClick={() => { setAccent(id); setCustom(false); }} aria-label={name} aria-pressed={accent === id} title={name === "ink" ? "Black on light, white on dark" : name} className="size-4 shrink-0 rounded-full" style={{ background: name === "ink" ? "var(--color-fg)" : h, boxShadow: accent === id ? "0 0 0 2px var(--color-bg), 0 0 0 3.5px var(--color-fg)" : undefined }} />;
        })}
        <button onClick={() => setCustom((c) => !c)} aria-expanded={custom} aria-label="Pick any colour" title="Any colour" className="size-4 shrink-0 rounded-full" style={{ background: "conic-gradient(#ff4d1f, #f2a900, #25b878, #8a63ff, #e8407a, #ff4d1f)" }} />
        {custom && (
          <div className="jk-panel jk-pop absolute right-0 top-full z-[60] mt-3 w-[236px] rounded-xl p-3 shadow-2xl">
            <ColorPicker value={hex} onChange={(h) => { const a = customAccent(h); if (a && hexToHsv(h)) setAccent(a); }} />
          </div>
        )}
      </div>
    </div>
  );
}

export function Header() {
  const path = usePathname() ?? "";
  const wide = path.startsWith("/docs") || path.startsWith("/changelog"); // lines up with the docs layout
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header ref={ref} className={`fixed inset-x-0 top-0 z-50 border-b transition-colors ${scrolled || open ? "border-line bg-bg/90 backdrop-blur-xl" : "border-line/0"}`}>
      <div className={`mx-auto flex h-[60px] items-center gap-6 px-5 ${wide ? "max-w-[1840px] lg:px-8" : "max-w-[1180px]"}`}>
        <Link href="/" className="flex items-center gap-2.5" aria-label="Jimkit, home">
          <Logo size={30} />
          <span className="font-display text-[1.45rem] tracking-tight">Jimkit</span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[14px] text-dim transition-colors hover:bg-tint-2 hover:text-fg">{n.label}</Link>)}
        </nav>
        <button onClick={() => window.dispatchEvent(new Event("jk-palette"))} className="jk-btn ml-auto hidden h-[34px] items-center gap-2 rounded-lg border border-line-strong px-3 text-[13px] text-dim hover:bg-tint-2 hover:text-fg lg:flex" aria-label="Search"><Search size={14} /> <span className="max-xl:sr-only">Search</span> <span className="kbd whitespace-nowrap">ctrl k</span></button>
        <div className="hidden items-center gap-2 lg:flex"><LookControls />{REPO_URL && <a href={REPO_URL} rel="noopener" aria-label="Jimkit on GitHub" title="Jimkit on GitHub" className="jk-btn grid size-[34px] shrink-0 place-items-center rounded-lg border border-line-strong text-dim hover:bg-tint-2 hover:text-fg"><GitHubMark size={17} /></a>}</div>
        <button className="ml-auto grid size-10 place-items-center rounded-lg text-dim hover:bg-tint-2 lg:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <MenuIcon size={20} />}</button>
      </div>
      {open && (
        <div className="jk-fade max-h-[calc(100vh-60px)] overflow-y-auto border-t border-line px-5 pb-6 pt-3 lg:hidden">
          <nav className="flex flex-col" aria-label="Main">
            {NAV.map((n) => <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="border-b border-line py-3 text-[16px]">{n.label}</Link>)}
          </nav>
          {REPO_URL && <a href={REPO_URL} rel="noopener" className="flex items-center gap-2.5 border-b border-line py-3 text-[16px]"><GitHubMark size={18} /> GitHub</a>}
          <div className="mt-5"><LookControls stacked /></div>
        </div>
      )}
    </header>
  );
}
