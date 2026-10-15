"use client";

import { Icon } from "@jimkit/ui";
import { Plus, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Category, SiteTool } from "@/lib/catalog";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

const KIT: SiteTool = { id: "word-count", name: "Word count", blurb: "Counts words, characters and lines", icon: "ScanText", category: "write", addon: "word-count", demo: false };

/** Measure every tile, run a change, slide each tile from where it was to where it is (the app does the same with its tiles). */
function glide(run: () => void) {
  const key = (el: HTMLElement) => el.dataset.tile!;
  const before = new Map([...document.querySelectorAll<HTMLElement>("[data-tile]")].map((el) => [key(el), el.getBoundingClientRect()]));
  run();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const moves = [...document.querySelectorAll<HTMLElement>("[data-tile]")].flatMap((el) => { const f = before.get(key(el)); if (!f) return []; el.getAnimations().forEach((a) => a.cancel()); return [[el, f] as const]; });
  for (const [el, f] of moves) {
    const to = el.getBoundingClientRect(), dx = f.left - to.left, dy = f.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }
}

export function Playground({ tools, categories }: { tools: SiteTool[]; categories: Category[] }) {
  const initial = useMemo(() => tools.map((t) => t.id), [tools]);
  const [order, setOrder] = useState(initial);
  const [grouped, setGrouped] = useState(true);
  const [kit, setKit] = useState(false);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; over: string | null; after: boolean } | null>(null);
  const start = useRef({ x: 0, y: 0 });
  // the latest drag, updated as events arrive: a quick flick can end before React has rendered the last move
  const live = useRef<typeof drag>(null);
  const setLive = (d: typeof drag) => { live.current = d; setDrag(d); };
  const stage = useRef<HTMLDivElement>(null);

  const all = useMemo(() => [...tools, ...(kit ? [KIT] : [])], [tools, kit]);
  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all]);
  const seq = useMemo(() => [...order.filter((id) => byId.has(id)), ...(kit && !order.includes(KIT.id) ? [KIT.id] : [])], [order, byId, kit]);
  const hue = (t: SiteTool) => categories.find((c) => c.id === t.category)?.hue ?? 200;

  const move = (id: string, over: string, after: boolean) => {
    if (id === over) return;
    glide(() => flushSync(() => setOrder(() => {
      const rest = seq.filter((x) => x !== id);
      const at = rest.indexOf(over) + (after ? 1 : 0);
      return [...rest.slice(0, at), id, ...rest.slice(at)];
    })));
  };

  const down = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setLive({ id, dx: 0, dy: 0, over: null, after: false });
  };
  const moveTo = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = live.current;
    if (!drag) return;
    const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
    let over: string | null = null, after = false;
    if (Math.hypot(dx, dy) > 6) {
      for (const el of stage.current?.querySelectorAll<HTMLElement>("[data-tile]") ?? []) {
        if (el.dataset.tile === drag.id) continue;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { over = el.dataset.tile!; after = e.clientX > r.left + r.width / 2; break; }
      }
      // in the grouped view a tile stays in its own category, as in the app
      if (grouped && over && byId.get(over)?.category !== byId.get(drag.id)?.category) over = null;
    }
    setLive({ ...drag, dx, dy, over, after });
  };
  const up = () => {
    const d = live.current;
    if (d?.over) move(d.id, d.over, d.after);
    setLive(null);
  };

  const tile = (t: SiteTool) => {
    const dragging = drag?.id === t.id && Math.hypot(drag.dx, drag.dy) > 6;
    const mark = drag?.over === t.id ? (drag.after ? "after" : "before") : undefined;
    return (
      <button
        key={t.id} data-tile={t.id} data-mark={mark}
        onPointerDown={(e) => down(e, t.id)} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={() => setLive(null)}
        onKeyDown={(e) => {
          if (!e.altKey || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
          e.preventDefault();
          const peers = seq.filter((x) => !grouped || byId.get(x)?.category === t.category);
          const at = peers.indexOf(t.id) + (e.key === "ArrowLeft" ? -1 : 1);
          if (peers[at]) move(t.id, peers[at], e.key === "ArrowRight");
        }}
        aria-label={`${t.name}. Drag to move it, or hold Alt and press the arrow keys.`}
        className={`jk-tile jk-block jk-tile-play relative aspect-[1.08] p-3 text-left text-white outline-0 ${t.id === KIT.id ? "jk-rise" : ""}`}
        style={{ ["--hue" as string]: hue(t), touchAction: "none", zIndex: dragging ? 5 : undefined, transform: dragging ? `translate(${drag!.dx}px, ${drag!.dy}px) scale(1.04)` : undefined, boxShadow: dragging ? "0 18px 40px rgb(0 0 0 / 0.45)" : undefined, cursor: dragging ? "grabbing" : "grab", opacity: dragging ? 0.92 : 1 }}
      >
        <Icon name={t.icon} className="size-[34%]" strokeWidth={1.4} />
        <span className="block text-[13.5px] font-semibold leading-tight">{t.name}</span>
      </button>
    );
  };

  const grid = "grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2";
  const flat = seq.map((id) => byId.get(id)!);
  const toggle = <K extends "grouped" | "kit">(k: K, v: boolean) => glide(() => flushSync(() => (k === "grouped" ? setGrouped(v) : setKit(v))));

  return (
    <Section id="playground" num="05" label="Arrange" title="Arrange your tools the way you work."
      intro="This is a compact version of the home screen. Drag a tile to move it, group the tiles by category or lay them out in a single list, and add a kit from GitHub to see how new tools appear. The full home screen supports all of this and remembers your choices in a cookie, so it is arranged the same way each time you return.">
      <Reveal delay={1}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-line py-3.5">
          <label className="flex items-center gap-2.5 text-[14px]"><input type="checkbox" checked={grouped} onChange={(e) => toggle("grouped", e.target.checked)} className="size-4 accent-[var(--accent)]" /> Group by category</label>
          <button onClick={() => toggle("kit", !kit)} className="jk-btn flex items-center gap-2 rounded-lg border border-line-strong px-3.5 py-2 text-[13.5px] font-medium hover:bg-tint-2"><Plus size={15} /> {kit ? "Remove the word-count kit" : "Add a kit from GitHub"}</button>
          <button onClick={() => { glide(() => flushSync(() => { setOrder(initial); setGrouped(true); setKit(false); })); }} className="flex items-center gap-1.5 text-[13.5px] text-dim hover:text-fg"><RotateCcw size={14} /> Reset</button>
          <p role="status" className="font-mono-label ml-auto text-faint">{kit ? "Added from GitHub · ada/word-count 1.2.0" : `${seq.length} tiles`}</p>
        </div>
        <div ref={stage} className="mt-6 select-none">
          {grouped ? (
            <div className="grid gap-x-8 gap-y-7 lg:grid-cols-2">
              {categories.map((c) => {
                const items = flat.filter((t) => t.category === c.id);
                return items.length ? (
                  <div key={c.id} className={items.length > 5 ? "lg:col-span-2" : ""}>
                    <p className="font-mono-label mb-2.5 text-faint">{c.name}</p>
                    <div className={grid}>{items.map(tile)}</div>
                  </div>
                ) : null;
              })}
            </div>
          ) : (
            <div className={grid}>{flat.map(tile)}</div>
          )}
        </div>
      </Reveal>
    </Section>
  );
}
