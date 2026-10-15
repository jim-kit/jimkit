"use client";

import type { LayoutCategory, LayoutTool } from "@jimkit/sdk";
import { useLayout } from "@jimkit/sdk/react";
import { Icon, readableOn } from "@jimkit/ui";
import { Moon, Pencil, Puzzle, Search, Settings as SettingsIcon, Sun, Upload } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * The Start screen: the home screen as a row of tile blocks that scrolls sideways on any scroll. It is written against the layout API
 * only (`useLayout()`), the way a layout in any other kit is (see docs/layouts.md).
 */

/** a tool's tile colour, as the custom properties the .jk-tile styles read */
const tint = (t: LayoutTool): CSSProperties => ({ ["--hue" as string]: t.color.hue, ...(t.color.hex ? { ["--own" as string]: t.color.hex, ["--own-fg" as string]: readableOn(t.color.hex) } : {}) });
const tileClass = (t: LayoutTool) => `jk-tile jk-block group relative p-3.5 text-white outline-0${t.color.own ? " jk-own" : ""}${t.color.hex ? " jk-hex" : ""}`;
const press = "hover:outline hover:outline-[3px] hover:-outline-offset-[3px] hover:outline-white active:brightness-90";
const swatch = (hue: number) => <span className="inline-block jk-tile" style={{ ["--hue" as string]: hue, borderRadius: 0, width: 10, height: 10 }} />;

function Tile({ tool, wide, siblings, label }: { tool: LayoutTool; wide?: boolean; siblings: string[]; label?: string }) {
  const L = useLayout();
  const { Grip, ToolMarks } = L.parts;
  const sort = L.useToolSort(tool, siblings);
  const ctx = L.useToolContextMenu(tool);
  const dim = tool.state !== "ready";
  const style = { ...tint(tool), gridColumn: wide ? "span 2" : undefined, opacity: dim ? 0.55 : 1 };
  const body = (
    <>
      <span className="flex items-start justify-between">
        <Icon name={tool.icon} className={wide ? "size-[calc(var(--tile)*0.42)]" : "size-[calc(var(--tile)*0.38)]"} strokeWidth={1.4} />
        {!sort.arranging && dim && <span className="text-[10.5px] font-semibold uppercase tracking-[.12em] opacity-90">{tool.state === "unavailable" ? "setup" : tool.state === "soon" ? "soon" : "locked"}</span>}
        {!sort.arranging && !dim && tool.favourite && <span title="Favourite" className="opacity-90"><Icon name="Star" size={14} className="fill-current" /></span>}
      </span>
      <span>
        {label && <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-[.12em] opacity-75">{label}</span>}
        <span className="block text-[15px] font-semibold leading-tight">{tool.name}</span>
        {wide && <span className="mt-0.5 block text-[12px] leading-snug opacity-80">{tool.blurb}</span>}
      </span>
    </>
  );
  if (sort.arranging) {
    return (
      <div {...sort.item} {...sort.handle} role="group" aria-label={tool.name} className={tileClass(tool)} style={style}>
        {body}
        <Grip sort={sort} compact className="absolute right-0.5 top-0.5 [&_button]:!text-current [&_button:hover]:!bg-current/20" />
        <ToolMarks tool={tool} className="absolute bottom-0.5 right-0.5" />
      </div>
    );
  }
  return <><button {...ctx.bind} onClick={() => L.open(tool)} className={`${tileClass(tool)} ${press}`} style={style}>{body}</button>{ctx.menu}</>;
}

/** columns of three tiles down, then across; one column on a phone */
function useWide() {
  const [w, setW] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setW(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return w;
}

/** the grid a block of tiles lies in */
function blockStyle(count: number, wide: boolean): CSSProperties {
  return { gridAutoColumns: "var(--tile)", gridTemplateRows: wide ? `repeat(${Math.min(3, count)}, var(--tile))` : undefined, gridAutoRows: "var(--tile)", gridAutoFlow: wide ? "column" : "row" };
}

function Category({ cat, siblings }: { cat: LayoutCategory; siblings: string[] }) {
  const L = useLayout();
  const wide = useWide();
  const sort = L.useCategorySort(cat, siblings);
  const ids = cat.tools.map((t) => t.id);
  return (
    <section id={`cat-${cat.id}`} {...sort.item} className="shrink-0">
      <h2 {...sort.handle} className="mb-3 flex items-center gap-2 text-[15px] font-light lowercase text-dim">
        {sort.arranging && <L.parts.Grip sort={sort} className="-ml-1" />}
        {swatch(cat.hue)}{cat.name}
      </h2>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-none" style={blockStyle(cat.tools.length, wide)}>
        {cat.tools.map((t, i) => <Tile key={t.id} tool={t} wide={i === 0 && cat.tools.length >= 4} siblings={ids} />)}
      </div>
    </section>
  );
}

function Favourites() {
  const L = useLayout();
  const wide = useWide();
  if (!L.favourites.length) return null;
  return (
    <div className="flex shrink-0 flex-col">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-light lowercase text-dim">{swatch(250)}favourites</h2>
      <div className="grid grid-cols-2 gap-2 [grid-auto-rows:var(--tile)] lg:grid-flow-col lg:grid-cols-none lg:[grid-auto-columns:var(--tile)] lg:[grid-template-rows:repeat(3,var(--tile))]">
        {L.favourites.map((t) => {
          const dim = t.state !== "ready";
          return (
            <div key={t.id} className={tileClass(t)} style={{ ...tint(t), opacity: dim ? 0.55 : 1 }}>
              <button onClick={() => !L.arranging && L.open(t)} className="flex size-full flex-col justify-between text-left outline-0">
                <Icon name={t.icon} className="size-[calc(var(--tile)*0.38)]" strokeWidth={1.4} />
                <span className="block text-[15px] font-semibold leading-tight">{t.name}</span>
              </button>
              {L.arranging && <L.parts.ToolMarks tool={t} className="absolute right-0.5 top-0.5" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** the corner buttons that stay put while the tiles scroll */
function Chrome() {
  const L = useLayout();
  const { SessionChip, KitsDot, SettingsDot, ArrangeBar } = L.parts;
  if (L.arranging) return <ArrangeBar corner wide />;
  const btn = "flex h-[38px] w-[38px] items-center justify-center gap-2 border border-line bg-surface text-[13px] text-dim hover:text-fg sm:w-auto sm:px-3.5";
  return (
    <div className="fixed right-4 top-4 z-20 flex items-center gap-2 lg:right-12 lg:top-8">
      {L.canManageKits && <button onClick={L.openKits} aria-label="Kits" title="Add, update or remove kits" className={btn}><Puzzle size={15} /><span className="hidden sm:inline">Kits</span><KitsDot /></button>}
      <button onClick={() => L.setArranging(true)} aria-label="Edit" title="Reorder or hide categories and tools" className={btn}><Pencil size={15} /><span className="hidden sm:inline">Edit</span></button>
      <button onClick={L.openSearch} aria-label="Search" className={btn}><Search size={15} /><span className="hidden sm:inline">Search</span><span className="kbd hidden sm:inline">Ctrl K</span></button>
      <SessionChip dotFirst />
      <button onClick={() => L.setMode(L.mode === "dark" ? "light" : "dark")} aria-label={L.mode === "dark" ? "Switch to light mode" : "Switch to dark mode"} className="grid size-[38px] place-items-center border border-line bg-surface text-dim hover:text-fg">{L.mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
      <button onClick={L.openSettings} aria-label="Settings" className="relative grid size-[38px] place-items-center border border-line bg-surface text-dim hover:text-fg"><SettingsIcon size={16} /><SettingsDot /></button>
    </div>
  );
}

export function StartScreen() {
  const L = useLayout();
  const wide = useWide();
  const ids = L.categories.map((c) => c.id);
  const byId = new Map(L.categories.map((c) => [c.id, c]));
  // while arranging, every category keeps its own heading (it is the drag handle), and those take room from the tiles
  const stack = L.arranging ? Math.max(1, ...L.groups.map((g) => g.length)) - 1 : 0;
  const pan = useRef<HTMLDivElement>(null);

  // any scroll pans the row sideways (on wide screens), except where something has its own scrolling
  useEffect(() => {
    const el = pan.current;
    if (!el) return;
    const isWide = () => window.matchMedia("(min-width: 1024px)").matches;
    const inner = (from: HTMLElement | null, dy: number) => {
      for (let n = from; n && n !== document.body && n !== el; n = n.parentElement) {
        const o = getComputedStyle(n).overflowY;
        if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight + 1 && ((dy < 0 && n.scrollTop > 0) || (dy > 0 && n.scrollTop + n.clientHeight < n.scrollHeight - 1))) return true;
      }
      return false;
    };
    const wheel = (e: WheelEvent) => {
      if (!isWide() || e.ctrlKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      if (t.closest("[role=dialog], .fixed, [data-sonner-toaster]")) return;
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? el.clientWidth : 1;
      const dx = e.deltaX * unit, dy = e.deltaY * unit;
      if (inner(t, dy) || el.scrollWidth <= el.clientWidth) return;
      const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (!d) return;
      e.preventDefault();
      el.scrollLeft += d;
    };
    const key = (e: KeyboardEvent) => {
      if (!isWide() || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable || document.querySelector("[role=dialog]")) return;
      const page = el.clientWidth * 0.8;
      const by: Record<string, number> = { ArrowRight: 220, ArrowDown: 220, ArrowLeft: -220, ArrowUp: -220, PageDown: page, PageUp: -page, " ": e.shiftKey ? -page : page };
      if (e.key === "Home" || e.key === "End") { e.preventDefault(); el.scrollTo({ left: e.key === "Home" ? 0 : el.scrollWidth }); return; }
      if (!(e.key in by) || (e.key === " " && t.tagName === "BUTTON")) return;
      e.preventDefault();
      el.scrollBy({ left: by[e.key], behavior: "smooth" });
    };
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("wheel", wheel); window.removeEventListener("keydown", key); };
  }, []);

  const write = L.categories.flatMap((c) => c.tools).find((t) => t.category === "write" && t.state !== "soon");
  const link = "underline underline-offset-2 hover:text-fg";
  return (
    <>
      <div className="flex min-h-dvh flex-col lg:h-dvh">
        <header className="px-5 pb-3 pt-[72px] lg:px-12 lg:pt-8">
          <h1 className="text-[44px] font-extralight lowercase leading-none tracking-[-0.03em] lg:text-[56px]">{L.siteName}</h1>
          <p className="mt-2 text-[14px] lowercase text-faint">{L.categories.map((c) => c.name.toLowerCase()).join(" · ")}</p>
        </header>
        <div ref={pan} data-sort-scroller="" className="flex min-h-0 flex-1 flex-col gap-10 overflow-x-hidden px-5 pb-28 pt-3 lg:flex-row lg:items-start lg:gap-14 lg:overflow-x-auto lg:overflow-y-hidden lg:px-12 lg:pb-6" style={{ ["--tile" as string]: `clamp(104px, calc((100dvh - ${300 + stack * 51}px) / 3), 200px)` }}>
          <section className="shrink-0">
            <h2 className="mb-3 text-[15px] font-light lowercase text-dim">start</h2>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-none lg:gap-2" style={{ gridAutoColumns: "var(--tile)", gridTemplateRows: "repeat(3, var(--tile))", gridAutoFlow: wide ? "column" : "row" }}>
              <button onClick={L.chooseFiles} className={`jk-tile jk-block p-4 text-white ${press.replace(" active:brightness-90", "")}`} style={{ ["--hue" as string]: 250, gridColumn: "span 2", gridRow: "span 2" }}>
                <Upload className="size-[calc(var(--tile)*0.55)]" strokeWidth={1.3} />
                <span><span className="block text-[26px] font-light lowercase leading-none">drop files</span><span className="mt-2 block text-[13px] leading-snug opacity-85">anywhere on the window, or press to choose</span></span>
              </button>
              {write && (
                <button onClick={() => L.open(write)} className={`jk-tile jk-block p-3.5 text-white ${press.replace(" active:brightness-90", "")}`} style={{ ["--hue" as string]: 285, gridColumn: "span 2" }}>
                  <Icon name="PenLine" className="size-[calc(var(--tile)*0.42)]" strokeWidth={1.4} /><span className="text-[15px] font-semibold">new document</span>
                </button>
              )}
            </div>
          </section>
          <Favourites />
          {L.groups.map((g) => {
            // small categories share a block of tiles (one or two columns wide, three rows high), their names on the tiles; while editing
            // each keeps its own heading and column
            const cats = g.map((id) => byId.get(id)).filter((c): c is LayoutCategory => !!c);
            if (!cats.length) return null;
            if (g.length < 2 || L.arranging) {
              return (
                <div key={g[0]} className={`flex shrink-0 gap-10 ${L.arranging && g.length > 1 ? "flex-col lg:flex-row lg:gap-14" : "flex-col"}`}>
                  {cats.map((c) => <Category key={c.id} cat={c} siblings={ids} />)}
                </div>
              );
            }
            const tiles = cats.flatMap((c) => c.tools.map((t) => ({ t, c })));
            return (
              <div key={g[0]} className="flex shrink-0 flex-col">
                <h2 className="mb-3 flex items-center gap-2 text-[15px] font-light lowercase text-dim">{swatch(250)}group</h2>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-none" style={blockStyle(tiles.length, wide)}>
                  {tiles.map(({ t, c }) => <Tile key={t.id} tool={t} siblings={[]} label={c.name} />)}
                </div>
              </div>
            );
          })}
          {!L.categories.length && (
            <p className="self-center text-[14px] text-dim lg:max-w-[260px]">
              {L.toolCount ? <>Everything is hidden. <button onClick={() => L.setArranging(true)} className={link}>Edit</button> to show some again.</> : <>No tools are turned on. <button onClick={L.openKits} className={link}>Kits</button> has them.</>}
            </p>
          )}
          <div className="hidden w-4 shrink-0 lg:block" aria-hidden />
        </div>
      </div>
      <Chrome />
    </>
  );
}
