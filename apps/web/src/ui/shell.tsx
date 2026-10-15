"use client";

import type { CategoryMeta, ToolInit } from "@jimkit/sdk";
import { Btn, ColorPicker, Icon, Kebab, Tile, hexToHsv, hsvToHex, readableOn, toast, useContextMenu } from "@jimkit/ui";
import { ChevronDown, Command, Trash2, X, FolderOpen, Home as HomeIcon, Moon, Pencil, Search, Puzzle, Settings as SettingsIcon, Sun, Upload } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DropLayer, FileChooser } from "./drop";
import { Palette } from "./palette";
import { useApp } from "./providers";
import { SessionChip } from "./session-ui";
import { Logo } from "./logo";
import { Kits } from "./kits";
import { Settings } from "./settings";
import { Workspace } from "./workspace";
import { type ToolEntry } from "./catalog";
import { Grip, useSortItem } from "./sortable";
import { isHueValue, tint } from "./arrange";
import { ColourDialog, useCategoryMenu, useRecentMenu, useToolMenu } from "./menus";
import { ThemedLayout } from "./layout-host";
import { ArrangeBar, ToolMarks, UpdateDot, UpdatePip, useActivate } from "./parts";
import { matchActions, matchTools } from "./search";

/* ───────── favourites and colours (edit mode) ───────── */

/** Starred tools, whatever category they belong to, in the order they were starred. Hidden tools stay out unless editing. */
function useFavourites() {
  const { home, favourites } = useApp();
  return useMemo(() => {
    const found = new Map<string, { t: ToolEntry; c: CategoryMeta }>();
    for (const c of home.categories) for (const t of home.toolsIn(c.id)) found.set(t.id, { t, c });
    return favourites.flatMap((id) => (found.has(id) ? [found.get(id)!] : []));
  }, [home, favourites]);
}

function FavouriteCard({ t, c }: { t: ToolEntry; c: CategoryMeta }) {
  const { arranging, toolHues } = useApp();
  const activate = useActivate();
  const menuFor = useToolMenu();
  const ctx = useContextMenu(() => menuFor(t, "home"), t.name);
  return (
    <div {...(arranging ? {} : ctx.bind)} className="jk-card jk-rise group/card relative flex items-center gap-3 rounded-2xl p-3">
      <button onClick={() => !arranging && activate(t)} disabled={arranging} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default">
        <Tile icon={t.icon} animation={t.iconAnimation} hue={tint(toolHues[t.id], c.hue).hue} size={36} color={tint(toolHues[t.id], c.hue).hex} own={isHueValue(toolHues[t.id])} />
        <span className="min-w-0"><span className="block truncate text-[14.5px] font-medium">{t.name}</span><span className="block truncate text-[12.5px] text-dim">{t.unavailable ?? t.blurb}</span></span>
      </button>
      {arranging ? <ToolMarks tool={t} /> : <Kebab items={() => menuFor(t, "home")} label={`${t.name}: more`} className="opacity-0 focus-visible:opacity-100 group-hover/card:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100" />}
      {ctx.menu}
    </div>
  );
}

function FavouritesSection() {
  const favs = useFavourites();
  const { arranging } = useApp();
  if (!favs.length) return arranging ? <p className="mt-8 text-[13px] text-faint">No favourites yet. Star a tool while editing to keep it here.</p> : null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-faint"><Icon name="Star" size={14} className="fill-current" /> Favourites</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {favs.map(({ t, c }) => <FavouriteCard key={t.id} t={t} c={c} />)}
      </div>
    </section>
  );
}

/* ───────── home: cards ───────── */

function ToolCard({ tool, hue, ids }: { tool: ToolEntry; hue: number; ids: string[] }) {
  const activate = useActivate();
  const { session, reorder, toolHues, favourites } = useApp();
  const menuFor = useToolMenu();
  const shade = tint(toolHues[tool.id], hue);
  hue = shade.hue;
  const sort = useSortItem({ list: `tools:${tool.category}`, id: tool.id, ids, name: tool.name, apply: (next, final) => reorder.tools(tool.category, next, final) });
  const ctx = useContextMenu(() => menuFor(tool, "home"), tool.name);
  const locked = !!tool.trusted && session.tier === "public";
  const starred = favourites.includes(tool.id);
  const badge = tool.unavailable ? <span className="rounded-full bg-tint-2 px-2 py-0.5 text-[11px] text-warn">Needs setup</span> : tool.status === "soon" ? <span className="rounded-full bg-tint-2 px-2 py-0.5 text-[11px] text-faint">Soon</span> : locked ? <span className="rounded-full bg-tint-2 px-2 py-0.5 text-[11px] text-faint">Unlock</span> : null;
  const body = (
    <>
      <Tile icon={tool.icon} hue={hue} size={40} color={shade.hex} animation={tool.iconAnimation} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[15px] font-medium"><span className="truncate">{tool.name}</span>{starred && !sort.arranging && <Icon name="Star" size={12} className="shrink-0 fill-current text-faint" />}{!sort.arranging && (badge ?? (tool.note ? <span title={tool.note} className="rounded-full bg-tint-2 px-2 py-0.5 text-[11px] text-warn">Limited</span> : null))}</p>
        <p className="mt-0.5 truncate text-[13px] leading-snug text-dim">{tool.unavailable ?? tool.blurb}</p>
      </div>
    </>
  );
  const cls = "jk-card jk-rise group/card relative flex items-center gap-3.5 rounded-2xl p-3.5 text-left transition";
  // while arranging a card is something to move, not to open
  if (sort.arranging) {
    // the name and the blurb keep the whole top; everything you can do to the card is one row under it, so nothing sits on the text:
    // the handle on the left, then star, colour, show or hide, and move earlier or later
    return (
      <div {...sort.item} {...sort.handle} role="group" aria-label={tool.name} className={`${cls} flex-wrap`}>
        {body}
        <div className="-mb-1 flex w-full items-center border-t border-line pt-2">
          <Grip sort={sort} parts="grip" />
          <span className="ml-auto flex items-center"><ToolMarks tool={tool} up /><Grip sort={sort} parts="rest" /></span>
        </div>
      </div>
    );
  }
  // the card is a button, and a button cannot hold another one: the ⋮ sits beside it
  return (
    <div {...ctx.bind} className="group/card relative">
      <button onClick={() => activate(tool)} className={`${cls} w-full hover:border-line-strong hover:bg-raised-2`}>{body}<span className="w-7 shrink-0" aria-hidden /></button>
      <Kebab items={() => menuFor(tool, "home")} label={`${tool.name}: more`} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 focus-visible:opacity-100 group-hover/card:opacity-100 aria-expanded:opacity-100 [@media(hover:none)]:opacity-100" />
      {ctx.menu}
    </div>
  );
}

function CategorySection({ cat, ids }: { cat: CategoryMeta; ids: string[] }) {
  const { home, reorder, layout, collapsed, toggleCollapsed, arranging } = useApp();
  const sort = useSortItem({ list: "cats", id: cat.id, ids, name: cat.name, apply: reorder.cats });
  const menuFor = useCategoryMenu();
  const tools = home.toolsIn(cat.id);
  const toolIds = tools.map((t) => t.id);
  if (!tools.length) return null;
  // while editing everything is open: there is nothing to drag in a folded section
  const folded = collapsed.includes(cat.id) && !arranging;
  // one or two tools share a row with their neighbours (unless grouping is off); more than that, the section takes the whole row
  const n = layout.group ? tools.length : 3;
  const span = n === 1 ? "" : n === 2 ? "sm:col-span-2" : "sm:col-span-2 xl:col-span-3";
  const cols = n === 1 ? "grid-cols-1" : n === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
  return (
    <section id={`cat-${cat.id}`} {...sort.item} className={`min-w-0 scroll-mt-6 ${span}`}>
      <div {...sort.handle} className={`${folded ? "" : "mb-3"} flex min-w-0 items-center gap-3`}>
        {sort.arranging && <Grip sort={sort} axis="y" parts="grip" className="-ml-1.5" />}
        <button onClick={() => !arranging && toggleCollapsed(cat.id)} aria-expanded={!folded} disabled={arranging} className="flex min-w-0 items-center gap-3 rounded-lg text-left disabled:cursor-default">
          <h2 className="flex shrink-0 items-center gap-2 text-[13px] font-semibold uppercase tracking-[.12em] text-dim"><Icon name={cat.icon} size={14} /> {cat.name}</h2>
          <span className="min-w-0 truncate text-[13px] text-faint">{folded ? `${tools.length} ${tools.length === 1 ? "tool" : "tools"}` : cat.blurb}</span>
          {!arranging && <ChevronDown size={14} className={`shrink-0 text-faint transition-transform ${folded ? "-rotate-90" : ""}`} />}
        </button>
        {arranging ? <Grip sort={sort} axis="y" parts="rest" className="ml-auto" /> : <Kebab items={() => menuFor(cat, tools)} label={`${cat.name}: more`} className="ml-auto !size-7" size={15} />}
      </div>
      {!folded && <div className={`grid gap-3 ${cols}`}>{tools.map((t) => <ToolCard key={t.id} tool={t} hue={cat.hue} ids={toolIds} />)}</div>}
    </section>
  );
}

/** The question on the home screen is also the answer: type to find a tool, drop or paste a file to see what takes it. */
function HomeBar() {
  const { setPending, session, catalog, favourites, openTool } = useApp();
  const activate = useActivate();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [focus, setFocus] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const write = catalog.tools.find((t) => t.category === "write" && t.status !== "soon");
  // tools first, then the ways to start one that match ("json" finds the text editor, and "New JSON document")
  type Row = { key: string; tool: ToolEntry; label: string; hint: string; run: () => void };
  const results = useMemo<Row[]>(() => [
    ...matchTools(catalog, q, favourites).map((t) => ({ key: t.id, tool: t, label: t.name, hint: `${catalog.category(t.category).name} · ${t.unavailable ?? t.blurb}`, run: () => activate(t) })),
    ...matchActions(catalog, q).map((m, i) => ({ key: `${m.tool.id}:${i}:${m.label}`, tool: m.tool, label: m.label, hint: m.tool.name, run: () => activate(m.tool, m.init) })),
  ], [catalog, q, favourites]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = focus && q.trim().length > 0;
  useEffect(() => setIdx(0), [q]);
  const pick = (r?: Row) => { if (!r) return; setQ(""); (document.activeElement as HTMLElement | null)?.blur(); r.run(); };
  const max = Math.round(session.limits.maxFileBytes / 1024 ** 3);
  return (
    <div className="relative">
      <div className={`jk-panel flex items-center gap-3 rounded-2xl border px-4 transition-shadow ${focus ? "ring-2 ring-[rgb(var(--accent-rgb)/0.5)]" : ""}`}>
        <Search size={20} className="shrink-0 text-faint" />
        <input
          id="home-bar" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
          placeholder="Find a tool, or drop a file" aria-label="Find a tool" autoComplete="off" spellCheck={false}
          role="combobox" aria-expanded={open} aria-controls="home-bar-results" aria-activedescendant={open && results[idx] ? `hb-${results[idx].key}` : undefined}
          onPaste={(e) => { const f = Array.from(e.clipboardData.files); if (f.length) { e.preventDefault(); setPending(f); } }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); pick(results[idx]); }
            else if (e.key === "Escape") { setQ(""); (e.target as HTMLElement).blur(); }
          }}
          className="min-w-0 flex-1 bg-transparent py-4 text-[17px] outline-none placeholder:text-faint"
        />
        {q ? <button onClick={() => setQ("")} aria-label="Clear" className="grid size-8 place-items-center rounded-lg text-faint hover:bg-tint-2 hover:text-fg"><X size={16} /></button> : <span className="kbd hidden sm:inline">/</span>}
        <span className="hidden h-6 w-px bg-line sm:block" />
        <button onClick={() => files.current?.click()} className="flex shrink-0 items-center gap-2 rounded-xl border border-accent bg-accent px-3.5 py-2 text-[14px] font-medium text-accent-fg hover:brightness-90"><FolderOpen size={16} /><span className="hidden sm:inline">Choose files</span><span className="sm:hidden">Files</span></button>
        {write && <button onClick={() => openTool(write.id)} className="hidden shrink-0 items-center gap-2 rounded-xl border border-line-strong px-3.5 py-2 text-[14px] text-dim hover:bg-tint-2 hover:text-fg md:flex">{write.name}</button>}
      </div>
      <p className="mt-2.5 px-1 text-[13px] text-faint">Drop files anywhere on the window or paste one. Up to {max} GB each.</p>
      {open && (
        <ul id="home-bar-results" role="listbox" className="jk-panel jk-pop absolute inset-x-0 top-[62px] z-20 overflow-hidden rounded-2xl p-1.5 shadow-2xl">
          {results.length === 0 && <li className="px-4 py-6 text-center text-[14px] text-faint">No tool matches “{q.trim()}”.</li>}
          {results.map((r, i) => {
            const c = catalog.category(r.tool.category);
            return (
              <li key={r.key} id={`hb-${r.key}`} role="option" aria-selected={i === idx}>
                <button onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setIdx(i)} onClick={() => pick(r)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === idx ? "bg-tint-2" : ""}`}>
                  <Tile icon={r.tool.icon} animation={r.tool.iconAnimation} hue={c.hue} size={32} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px]">{r.label}</span><span className="block truncate text-[12.5px] text-faint">{r.hint}</span></span>
                  {i === idx && <span className="kbd">enter</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input ref={files} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) setPending(Array.from(e.target.files)); e.target.value = ""; }} />
    </div>
  );
}

/* ───────── arranging ───────── */

function EditButton() {
  const { setArranging, setKitsOpen, session } = useApp();
  return (
    <div className="flex shrink-0 gap-2">
      {session.tier === "trusted" && <Btn onClick={() => setKitsOpen(true)} title="Add, update or remove kits"><Puzzle size={14} /> Kits<UpdateDot /></Btn>}
      <Btn onClick={() => setArranging(true)} title="Reorder or hide categories and tools"><Pencil size={14} /> Edit</Btn>
    </div>
  );
}

/** The home screen has no tools. Either the visitor hid them all, or no addon is turned on: the two have different fixes. */
function NothingShown({ className = "mt-10" }: { className?: string }) {
  const { catalog, setArranging, setKitsOpen } = useApp();
  const link = "underline underline-offset-2 hover:text-fg";
  return catalog.tools.length ? (
    <p className={`text-[14px] text-dim ${className}`}>Everything is hidden. <button onClick={() => setArranging(true)} className={link}>Edit</button> to show some again.</p>
  ) : (
    <p className={`text-[14px] text-dim ${className}`}>No tools are turned on. <button onClick={() => setKitsOpen(true)} className={link}>Kits</button> has them.</p>
  );
}

function RecentChip({ tool }: { tool: ToolEntry }) {
  const { catalog, toolHues } = useApp();
  const activate = useActivate();
  const menuFor = useRecentMenu();
  const ctx = useContextMenu(() => menuFor(tool), tool.name);
  const shade = tint(toolHues[tool.id], catalog.category(tool.category).hue);
  return (
    <>
      <button {...ctx.bind} onClick={() => activate(tool)} className="jk-card flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3.5 text-[13.5px] transition hover:border-line-strong">
        <Tile icon={tool.icon} animation={tool.iconAnimation} hue={shade.hue} color={shade.hex} own={isHueValue(toolHues[tool.id])} size={28} />{tool.name}
      </button>
      {ctx.menu}
    </>
  );
}

function Home() {
  const { catalog, home, recent, arranging, clearRecents } = useApp();
  const ids = home.categories.map((c) => c.id);
  // while editing, the floating edit bar sits over the bottom of the page: leave it room so the last row can scroll clear
  const recents = recent.map((id) => catalog.byId.get(id)).filter((t): t is ToolEntry => !!t).slice(0, 6);
  return (
    <div className={`mx-auto max-w-[1100px] px-5 pt-8 lg:px-10 lg:pt-10 ${arranging ? "pb-64 lg:pb-48" : "pb-28 lg:pb-16"}`}>
      <header className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="jk-display text-[30px] font-semibold tracking-tight lg:text-[36px]">What do you want to do?</h1>
          <p className="mt-1.5 text-[15px] text-dim">{catalog.tools.filter((t) => t.status !== "soon").length} tools.<span className="hidden [@media(hover:hover)]:inline"> Press <span className="kbd">/</span> to search, or <span className="kbd">Ctrl</span> <span className="kbd">K</span> from inside a tool.</span></p>
        </div>
        {!arranging && <EditButton />}
      </header>
      <HomeBar />
      {recents.length > 0 && (
        <section className="mt-9">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-[.12em] text-dim">Recent</h2>
            <Kebab items={[{ label: "Clear recent", icon: <Trash2 size={15} />, danger: true, onSelect: clearRecents }]} label="Recent: more" className="!size-7" size={15} />
          </div>
          <div className="flex flex-wrap gap-2">{recents.map((t) => <RecentChip key={t.id} tool={t} />)}</div>
        </section>
      )}
      {!home.categories.length && <NothingShown />}
      <FavouritesSection />
      <div className="mt-10 grid grid-cols-1 gap-x-3 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
        {home.categories.map((c) => <CategorySection key={c.id} cat={c} ids={ids} />)}
      </div>
      {arranging && <ArrangeBar />}
    </div>
  );
}

/* ───────── chrome ───────── */

function Rail() {
  const { home, setPalette, setSettings, setKitsOpen, session, siteName, mode, setMode } = useApp();
  const go = (id: string) => document.getElementById(id === "home" ? "top" : `cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <aside className="jk-panel sticky top-0 hidden h-dvh flex-col border-y-0 border-l-0 px-4 pb-4 pt-6 lg:flex">
      <div className="flex items-center gap-3 px-2">
        <Logo size={38} />
        <p className="truncate text-[17px] font-semibold tracking-tight">{siteName}</p>
      </div>
      <button onClick={() => setPalette(true)} className="mt-6 flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5 text-[13px] text-faint transition hover:border-line-strong hover:text-dim">
        <Search size={15} /> <span className="flex-1 text-left">Search</span> <span className="kbd"><Command size={10} className="-mt-px inline" /> K</span>
      </button>
      <nav className="mt-5 flex flex-col gap-0.5" aria-label="Categories">
        <button onClick={() => go("home")} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-dim transition hover:bg-tint-2 hover:text-fg"><HomeIcon size={18} /> Home</button>
        {home.categories.map((c) => (
          <button key={c.id} onClick={() => go(c.id)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-dim transition hover:bg-tint-2 hover:text-fg">
            <Icon name={c.icon} size={18} /> <span className="flex-1">{c.name}</span>
          </button>
        ))}
      </nav>
      {session.tier === "trusted" && <button onClick={() => setKitsOpen(true)} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-dim transition hover:bg-tint-2 hover:text-fg"><Puzzle size={18} /> Kits<UpdateDot /></button>}
      <div className={`${session.tier === "trusted" ? "mt-2" : "mt-auto"} flex items-center justify-between gap-2`}>
        <SessionChip onClick={() => setSettings(true)} />
        <button onClick={() => setMode(mode === "dark" ? "light" : "dark")} aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={mode === "dark" ? "Light mode" : "Dark mode"} className="grid size-9 place-items-center rounded-xl text-dim hover:bg-tint-2 hover:text-fg">{mode === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button onClick={() => setSettings(true)} aria-label="Settings" title="Settings" className="relative grid size-9 place-items-center rounded-xl text-dim hover:bg-tint-2 hover:text-fg"><SettingsIcon size={18} /><UpdatePip /></button>
      </div>
    </aside>
  );
}

function MobileBar() {
  const { setPalette, setSettings, setKitsOpen, session, siteName } = useApp();
  return (
    <>
      <header className="pt-safe sticky top-0 z-20 border-b border-line bg-surface lg:hidden">
        <div className="flex h-[52px] items-center justify-between px-4">
          <span className="flex items-center gap-2.5"><Logo size={32} /><span className="text-[16px] font-semibold">{siteName}</span></span>
          <SessionChip onClick={() => setSettings(true)} />
        </div>
      </header>
      <nav className="pb-safe jk-panel fixed inset-x-0 bottom-0 z-20 flex border-x-0 border-b-0 lg:hidden" aria-label="Main">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-dim"><HomeIcon size={20} />Home</button>
        <button onClick={() => setPalette(true)} className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-dim"><Search size={20} />Search</button>
        {session.tier === "trusted" && <button onClick={() => setKitsOpen(true)} className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-dim"><span className="relative"><Puzzle size={20} /><span className="absolute -right-1 -top-0.5"><UpdateDot /></span></span>Kits</button>}
        <button onClick={() => setSettings(true)} className="relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-dim"><SettingsIcon size={20} /><UpdatePip />Settings</button>
      </nav>
    </>
  );
}

/** The built-in layout: the rail and the cards (a phone gets the bars). Every theme can fall back to it. */
function GridLayout() {
  return (
    <div id="top" className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <Rail />
      <div className="min-w-0">
        <MobileBar />
        <Home />
      </div>
    </div>
  );
}

export function Shell() {
  // the theme decides the layout: the built-in one, or one its addon brings (see docs/layouts.md)
  const { themeLayout, themeAddon, current, settings, kitsOpen, pending, palette, colourFor } = useApp();
  // while something sits on top of the page (a tool, a panel, a dialog) the page beneath is out of the tab order and hidden from screen readers
  const covered = !!(current || settings || kitsOpen || pending || palette || colourFor);
  return (
    <>
      <div inert={covered || undefined} className="contents">
        {themeLayout === "grid" || !themeAddon ? <GridLayout /> : <ThemedLayout addon={themeAddon} id={themeLayout} fallback={<GridLayout />} />}
      </div>
      <DropLayer />
      <FileChooser />
      <Palette />
      <Settings /><Kits />
      <Workspace />
      <ColourDialog />
    </>
  );
}

