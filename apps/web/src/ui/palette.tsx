"use client";

import { Tile, useDialogFocus, useOverlayEscape } from "@jimkit/ui";
import { ArrowRight, Search, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@jimkit/ui";
import { pinFavourites, tint } from "./arrange";
import { useApp } from "./providers";

interface Entry { anim?: string; id: string; label: string; hint: string; icon: string; hue: number; color?: string; own?: boolean; fav?: boolean; run(): void }

/** Ctrl/Cmd+K: every tool and a few actions, searchable. */
export function Palette() {
  const { palette, setPalette, catalog, openTool, setSettings, session, theme, toolHues, favourites, current } = useApp();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const tools: Entry[] = catalog.tools.map((t) => {
      const c = catalog.category(t.category);
      const locked = !!t.trusted && session.tier === "public";
      const shade = tint(toolHues[t.id], c.hue); // the colour the tool has on the home screen
      return {
        id: t.id, anim: t.iconAnimation, label: t.name, hint: `${c.name} · ${t.blurb}`, icon: t.icon, hue: shade.hue, color: shade.hex, own: t.id in toolHues && !shade.hex, fav: favourites.includes(t.id),
        run: () => (t.unavailable ? toast(`${t.name} isn't available here`, { description: t.unavailable }) : t.status === "soon" ? toast(`${t.name} is coming soon`) : locked ? toast(`${t.name} needs the unlock code`) : openTool(t.id)),
      };
    });
    // the ways to start a tool ("New JSON document"), searchable next to the tools themselves
    const quick: Entry[] = catalog.tools.flatMap((t) => (t.quick ?? []).map((q, i) => {
      const c = catalog.category(t.category);
      return { id: `${t.id}:quick:${i}`, anim: t.iconAnimation, label: q.label, hint: `${t.name} · ${q.keywords?.join(", ") ?? "new"}`, icon: t.icon, hue: tint(toolHues[t.id], c.hue).hue, color: tint(toolHues[t.id], c.hue).hex, run: () => (t.unavailable || t.status === "soon" ? toast(`${t.name} isn't available here`) : t.trusted && session.tier === "public" ? toast(`${t.name} needs the unlock code`) : openTool(t.id, q.init)) };
    }));
    return [...tools, ...quick, { id: "settings", label: "Settings", hint: "Appearance, addons, your session", icon: "Settings", hue: 200, run: () => setSettings(true) }];
  }, [catalog, session.tier, openTool, setSettings, toolHues, favourites]);

  const results = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    // starred tools come first, with or without a query
    const ranked = pinFavourites(entries, (e) => e.id, favourites);
    if (!words.length) return ranked.slice(0, 9);
    const kw = new Map(catalog.tools.map((t) => [t.id, (t.keywords ?? []).join(" ")]));
    return ranked.filter((e) => words.every((w) => `${e.label} ${e.hint} ${kw.get(e.id) ?? ""}`.toLowerCase().includes(w))).slice(0, 9);
  }, [entries, q, catalog.tools, favourites]);

  useEffect(() => { if (palette) { setQ(""); setIdx(0); setTimeout(() => input.current?.focus(), 30); } }, [palette]);
  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(!palette); }
      else if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName) && !(e.target as HTMLElement).isContentEditable && !palette) {
        e.preventDefault();
        // on the home screen the bar at the top is the search; anywhere else (inside a tool) the palette is
        const bar = document.getElementById("home-bar");
        if (bar && !current) bar.focus(); else setPalette(true);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [palette, setPalette, current]);

  useOverlayEscape(palette, () => setPalette(false));
  useDialogFocus(box, palette);
  if (!palette) return null;
  const pick = (e?: Entry) => { if (!e) return; setPalette(false); setTimeout(e.run, 40); };
  return (
    <div className="jk-fade fixed inset-0 z-[70] flex items-start justify-center bg-black/55 px-4 pt-[14vh]" onMouseDown={() => setPalette(false)} data-theme-surface={theme}>
      <div ref={box} className="jk-panel jk-pop w-full max-w-[600px] overflow-hidden rounded-2xl shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Search">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={17} className="text-faint" />
          <input
            ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools and actions…" aria-label="Search" role="combobox" aria-expanded="true" aria-controls="palette-results" aria-activedescendant={results[idx] ? `palette-${results[idx].id}` : undefined} autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); pick(results[idx]); }
              else if (e.key === "Escape") setPalette(false);
            }}
            className="w-full bg-transparent py-4 text-[15px] outline-none placeholder:text-faint"
          />
          <span className="kbd">esc</span>
        </div>
        <ul id="palette-results" role="listbox" aria-label="Results" className="max-h-[360px] overflow-y-auto p-2 scroll-hide">
          {results.length === 0 && <li className="px-4 py-10 text-center text-[14px] text-faint">Nothing matches “{q}”.</li>}
          {results.map((e, i) => (
            <li key={e.id} role="presentation">
              <button id={`palette-${e.id}`} role="option" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => pick(e)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${i === idx ? "bg-tint-2" : ""}`}>
                <Tile icon={e.icon} animation={e.anim} hue={e.hue} color={e.color} own={e.own} size={32} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{e.label}</span><span className="block truncate text-[12px] text-faint">{e.hint}</span></span>
                {e.fav && <span title="Favourite" className="shrink-0 text-faint"><Star size={13} className="fill-current" /></span>}
                {i === idx && <ArrowRight size={14} className="text-faint" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


