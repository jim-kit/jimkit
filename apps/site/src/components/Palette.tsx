"use client";

import { Icon, Tile } from "@jimkit/ui";
import { ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, SiteTool } from "@/lib/catalog";
import type { DocMeta } from "@/lib/docs-meta";
import { THEMES, useLook } from "@/lib/look";
import { useDemo } from "./Demo";

interface Entry { id: string; label: string; hint: string; icon?: string; hue?: number; run(): void }

const SECTIONS: [string, string, string][] = [
  ["workbench", "The workbench", "Run the real tools in the page"], ["tools", "The tool index", "All of them, numbered"], ["playground", "Rearrange", "Drag tiles, group, add a kit"],
  ["looks", "Looks", "The same tool in Basic, Glass and Metro"], ["details", "Details", "The parts around the tools"], ["kits", "Kits", "Add tools from GitHub"], ["install", "Install", "Docker or Proxmox"],
];

/** Ctrl+K, or / when you are not typing: the app's search palette, over this site. */
export function Palette({ tools, categories, docs }: { tools: SiteTool[]; categories: Category[]; docs: DocMeta[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { show } = useDemo();
  const { theme, mode, setTheme, setMode } = useLook();

  const go = (hash: string) => { if (location.pathname === "/") document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" }); else router.push(`/#${hash}`); };
  const entries = useMemo<Entry[]>(() => [
    ...tools.map((t) => ({ id: `tool-${t.id}`, label: t.name, hint: `${t.demo ? "Runs here" : "Needs a running Jimkit"} · ${t.blurb}`, icon: t.icon, hue: categories.find((c) => c.id === t.category)?.hue, run: () => (t.demo ? show(t.id) : go("tools")) })),
    ...SECTIONS.map(([id, label, hint]) => ({ id: `s-${id}`, label, hint, run: () => go(id) })),
    ...docs.map((d) => ({ id: `d-${d.slug}`, label: d.title, hint: `Docs · ${d.blurb}`, icon: "BookOpen", run: () => router.push(`/docs/${d.slug}/`) })),
    { id: "changelog", label: "Changelog", hint: "What changed, newest first", icon: "FileText", run: () => router.push("/changelog/") },
    ...THEMES.map((t) => ({ id: `look-${t.id}`, label: `Use the ${t.name} look`, hint: t.blurb, icon: "Palette", run: () => setTheme(t.id) })),
    ...(theme === "paper" ? [] : [{ id: "look-site", label: "Back to this site's own look", hint: "Warm paper and vermilion", icon: "Palette", run: () => setTheme("paper") }]),
    { id: "mode", label: mode === "dark" ? "Switch to light mode" : "Switch to dark mode", hint: "This page", icon: "Sparkles", run: () => setMode(mode === "dark" ? "light" : "dark") },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [tools, categories, docs, mode, theme, show]);

  const results = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (words.length ? entries.filter((e) => words.every((w) => `${e.label} ${e.hint}`.toLowerCase().includes(w))) : entries).slice(0, 9);
  }, [entries, q]);

  useEffect(() => { if (open) { setQ(""); setIdx(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);
  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName) && !(e.target as HTMLElement).isContentEditable && !open) { e.preventDefault(); setOpen(true); }
    };
    const external = () => setOpen(true);
    window.addEventListener("keydown", on);
    window.addEventListener("jk-palette", external);
    return () => { window.removeEventListener("keydown", on); window.removeEventListener("jk-palette", external); };
  }, [open]);

  if (!open) return null;
  const pick = (e?: Entry) => { if (!e) return; setOpen(false); setTimeout(e.run, 40); };
  return (
    <div className="jk-fade fixed inset-0 z-[90] flex items-start justify-center bg-black/55 px-4 pt-[14vh]" onMouseDown={() => setOpen(false)}>
      <div className="jk-panel jk-pop w-full max-w-[620px] overflow-hidden rounded-2xl shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={17} className="text-faint" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools, sections and docs…" aria-label="Search"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); pick(results[idx]); }
              else if (e.key === "Escape") setOpen(false);
            }}
            className="w-full bg-transparent py-4 text-[15px] outline-none placeholder:text-faint" />
          <span className="kbd">esc</span>
        </div>
        <ul className="max-h-[380px] overflow-y-auto p-2 scroll-hide">
          {results.length === 0 && <li className="px-4 py-10 text-center text-[14px] text-faint">Nothing matches “{q}”.</li>}
          {results.map((e, i) => (
            <li key={e.id}>
              <button onMouseEnter={() => setIdx(i)} onClick={() => pick(e)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${i === idx ? "bg-tint-2" : ""}`}>
                {e.icon && e.hue !== undefined ? <Tile icon={e.icon} hue={e.hue} size={32} /> : <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-tint text-dim">{e.icon ? <Icon name={e.icon} size={16} /> : <ArrowRight size={15} />}</span>}
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{e.label}</span><span className="block truncate text-[12px] text-faint">{e.hint}</span></span>
                {i === idx && <ArrowRight size={14} className="text-faint" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
