"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, EyeOff, GripVertical } from "lucide-react";
import { useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";
import { moveBy, moveItem, targetIndex } from "./arrange";
import { useApp } from "./providers";

/*
 * Drag to arrange, on plain pointer events (mouse, touch, pen). Only active in Arrange mode.
 * While dragging, nothing else moves: a copy of the item follows the pointer and a line marks where it will land. The order changes on release.
 * Touch starts from the grip only, so the rest of a card still scrolls the page. The grip is also a button: arrow keys move the item.
 */

type Apply = (ids: string[], final: boolean) => string[];

const selector = (list: string, id: string) => `[data-sort-item="${list}"][data-id="${CSS.escape(id)}"]`;

const SHUFFLE_MS = 190;
const SHUFFLE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Runs a reorder and slides the other items from where they were to where they are now (FLIP), so a swap is a short glide, not a
 * jump. An item that is still mid-glide continues from where it visibly is. `skip` (the one being dragged) is left alone.
 */
function shuffle(list: string, ids: string[], skip: string | null, run: () => void) {
  const find = (i: string) => document.querySelector<HTMLElement>(selector(list, i));
  const before = new Map<string, DOMRect>();
  for (const i of ids) { const el = find(i); if (el) before.set(i, el.getBoundingClientRect()); }
  run();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const [i, from] of before) {
    const el = find(i);
    if (!el || i === skip) continue;
    for (const a of el.getAnimations()) a.cancel();
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left, dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: SHUFFLE_MS, easing: SHUFFLE_EASE });
  }
}

interface Session {
  e: ReactPointerEvent;
  item: HTMLElement;
  list: string;
  id: string;
  ids: string[];
  apply: Apply;
  onStart(): void;
  onEnd(ids: string[], moved: boolean): void;
}

function startDrag({ e, item, list, id, ids, apply, onStart, onEnd }: Session) {
  const pointer = e.pointerId;
  const start = { x: e.clientX, y: e.clientY };
  const box = item.getBoundingClientRect();
  const grab = { x: start.x - box.left, y: start.y - box.top };
  const from = ids.indexOf(id);
  let p = start;
  let to = from;
  let ghost: HTMLElement | null = null;
  let line: HTMLElement | null = null;
  let frame = 0;

  const place = () => { if (ghost) ghost.style.transform = `translate3d(${p.x - grab.x}px, ${p.y - grab.y}px, 0)`; };

  // Nothing moves while you drag: the other items stay where they are, and a thin line shows where the item will land.
  const aim = () => {
    const rects = ids.map((i) => document.querySelector(selector(list, i))?.getBoundingClientRect());
    if (rects.some((r) => !r) || !line) return;
    const all = rects as DOMRect[];
    to = targetIndex(all, from, p);
    if (to === from) { line.style.opacity = "0"; return; }
    const a = all[from], b = all[to];
    const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    const sideways = overlap > 0.4 * Math.min(a.height, b.height);   // same row: a vertical line at the item's edge
    const later = to > from;
    const gap = 4, w = 3;
    const x = sideways ? (later ? b.right + gap : b.left - gap) - w / 2 : b.left;
    const y = sideways ? b.top : (later ? b.bottom + gap : b.top - gap) - w / 2;
    Object.assign(line.style, { opacity: "1", width: `${sideways ? w : b.width}px`, height: `${sideways ? b.height : w}px`, transform: `translate(${x}px, ${y}px)` });
  };

  const begin = () => {
    ghost = item.cloneNode(true) as HTMLElement;
    for (const n of [ghost, ...ghost.querySelectorAll<HTMLElement>("[id], [data-sort-item], [data-dragging]")]) for (const a of ["id", "data-sort-item", "data-dragging"]) n.removeAttribute(a);
    ghost.classList.add("jk-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    Object.assign(ghost.style, { position: "fixed", left: "0", top: "0", width: `${box.width}px`, height: `${box.height}px`, margin: "0", zIndex: "60", pointerEvents: "none" });
    ghost.style.setProperty("--tile", getComputedStyle(item).getPropertyValue("--tile"));
    document.body.append(ghost);
    line = document.createElement("div");
    line.setAttribute("aria-hidden", "true");
    Object.assign(line.style, { position: "fixed", left: "0", top: "0", zIndex: "59", pointerEvents: "none", borderRadius: "2px", background: "var(--accent)", opacity: "0", transition: "opacity 90ms" });
    document.body.append(line);
    document.documentElement.classList.add("jk-dragging");
    onStart();
    place();
    aim();
    const tick = () => { if (autoScroll(p)) aim(); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
  };

  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== pointer) return;
    p = { x: ev.clientX, y: ev.clientY };
    if (!ghost) { if (Math.hypot(p.x - start.x, p.y - start.y) < 4) return; begin(); }
    place();
    aim();
  };
  const finish = (commit: boolean) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key, true);
    cancelAnimationFrame(frame);
    if (!ghost) return;
    line?.remove();
    const moved = commit && to !== from;
    let result = ids;
    // the reorder happens now, once: the others glide to their places and the copy settles into its slot
    if (moved) shuffle(list, ids, id, () => flushSync(() => { result = apply(moveItem(ids, from, to), true); }));
    const done = () => {
      ghost?.remove();
      document.documentElement.classList.remove("jk-dragging");
      onEnd(result, moved);
    };
    const slot = moved ? document.querySelector(selector(list, id))?.getBoundingClientRect() : document.querySelector(selector(list, id))?.getBoundingClientRect();
    if (!slot || matchMedia("(prefers-reduced-motion: reduce)").matches) return done();
    ghost.animate([{ transform: ghost.style.transform }, { transform: `translate3d(${slot.left}px, ${slot.top}px, 0)` }], { duration: 180, easing: SHUFFLE_EASE, fill: "forwards" }).onfinish = done;
  };
  const up = (ev: PointerEvent) => { if (ev.pointerId === pointer) finish(true); };
  const cancel = (ev: PointerEvent) => { if (ev.pointerId === pointer) finish(false); };
  const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); finish(false); } };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key, true);
}

/** Near the edge of the window (or of a panning area marked data-sort-scroller) the page scrolls. True if anything moved. */
function autoScroll(p: { x: number; y: number }): boolean {
  const edge = 72, top = 22;
  const speed = (d: number) => (d >= edge ? 0 : Math.ceil((1 - Math.max(d, 0) / edge) * top));
  let moved = false;
  const nudge = (el: Element, r: { left: number; top: number; right: number; bottom: number }) => {
    const dx = speed(r.right - p.x) - speed(p.x - r.left), dy = speed(r.bottom - p.y) - speed(p.y - r.top);
    const x = el.scrollLeft, y = el.scrollTop;
    el.scrollLeft += dx;
    el.scrollTop += dy;
    if (el.scrollLeft !== x || el.scrollTop !== y) moved = true;
  };
  nudge(document.scrollingElement ?? document.documentElement, { left: 0, top: 0, right: innerWidth, bottom: innerHeight });
  for (const el of document.querySelectorAll("[data-sort-scroller]")) {
    const r = el.getBoundingClientRect();
    if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) nudge(el, r);
  }
  return moved;
}

let refocus: string | null = null;

/**
 * Props for one sortable item. `item` goes on the element that moves, `handle` on the part that starts a mouse or pen drag
 * (the same element, or just its heading), `grip` on the grip button.
 */
export function useSortItem({ list, id, ids, name, apply }: { list: string; id: string; ids: string[]; name: string; apply: Apply }) {
  const { arranging, drag, setDrag, announce, hidden, setHidden } = useApp();
  const key = `${list}:${id}`;
  const kind = list === "cats" ? "cats" : "tools";
  const isHidden = hidden[kind].includes(id);
  const say = (next: string[]) => announce(`${name} moved to place ${next.indexOf(id) + 1} of ${next.length}.`);
  const dragging = drag === key;
  /** one place earlier (-1) or later (1); focus stays with `which` (the button or grip that asked) */
  const move = (step: -1 | 1, which: string) => {
    const next = moveBy(ids, id, step);
    if (next === ids) return announce(`${name} is already ${step < 0 ? "first" : "last"}.`);
    refocus = `${key}|${which}`;
    let result = next;
    shuffle(list, ids, null, () => flushSync(() => { result = apply(next, true); }));
    say(result);
  };
  return {
    arranging,
    key,
    dragging,
    item: arranging ? { "data-sort-item": list, "data-id": id, "data-dragging": dragging || undefined, "data-hidden": isHidden || undefined } : {},
    handle: arranging ? {
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        if (e.button !== 0 || !e.isPrimary) return;
        // a finger scrolls unless it is on the grip
        if (e.pointerType === "touch" && !(e.target as Element).closest("[data-grip]")) return;
        const item = e.currentTarget.closest<HTMLElement>(`[data-sort-item="${list}"]`);
        if (!item) return;
        if (e.pointerType !== "touch") e.preventDefault();
        startDrag({ e, item, list, id, ids, apply, onStart: () => setDrag(key), onEnd: (next, moved) => { setDrag(null); if (moved) say(next); } });
      },
    } : {},
    index: ids.indexOf(id),
    count: ids.length,
    name,
    isHidden,
    toggleHidden() { setHidden(kind, id, !isHidden); announce(`${name} ${isHidden ? "shown" : "hidden"}.`); },
    move,
    grip: {
      "aria-label": `Move ${name}. Arrow keys change its place.`,
      onKeyDown(e: ReactKeyboardEvent) {
        const step = ({ ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 } as Record<string, -1 | 1>)[e.key];
        if (!step || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        move(step, "grip");
      },
    },
  };
}

/**
 * The controls of one item while arranging: "earlier" and "later" buttons, and the grip to drag by. After a move React may have
 * replaced the element, so focus follows the item to the same button. `axis` is the direction the list runs in.
 */
export function Grip({ sort, className = "", axis = "x", compact, parts = "all" }: { sort: ReturnType<typeof useSortItem>; className?: string; axis?: "x" | "y"; compact?: boolean; parts?: "all" | "grip" | "rest" }) {
  // a layout may put the grip in one place and the other buttons in another: two Grips for the same item, each drawing its part
  const showGrip = parts !== "rest", showRest = parts !== "grip";
  const refs = { back: useRef<HTMLButtonElement>(null), forward: useRef<HTMLButtonElement>(null), grip: useRef<HTMLButtonElement>(null) };
  useLayoutEffect(() => {
    const [k, which] = (refocus ?? "").split("|");
    if (k === sort.key && which in refs && refs[which as keyof typeof refs].current) {
      refocus = null;
      const b = refs[which as keyof typeof refs].current;
      // the button the item moved with may now be disabled (it reached an end): hand focus to its opposite
      (b && !b.disabled ? b : which === "back" ? refs.forward.current : which === "forward" ? refs.back.current : b)?.focus();
    }
  });
  const size = compact ? "size-7" : "size-8";
  const btn = `grid ${size} shrink-0 place-items-center rounded-lg text-dim hover:bg-tint-2 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent`;
  const Back = axis === "y" ? ChevronUp : ChevronLeft, Forward = axis === "y" ? ChevronDown : ChevronRight;
  const eye = (cls: string) => (
    <button type="button" aria-pressed={sort.isHidden} aria-label={`${sort.isHidden ? "Show" : "Hide"} ${sort.name}`} title={sort.isHidden ? "Hidden. Click to show" : "Hide"} onClick={sort.toggleHidden} className={`${btn} ${cls}`}>
      {sort.isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
  return (
    <>
      <span className={`flex shrink-0 items-center ${className}`}>
        {showRest && !compact && eye("")}
        {showRest && <button ref={refs.back} type="button" aria-label={`Move ${sort.name} ${axis === "y" ? "up" : "earlier"}`} title={axis === "y" ? "Move up" : "Move earlier"} disabled={sort.index <= 0} onClick={() => sort.move(-1, "back")} className={btn}><Back size={16} /></button>}
        {showRest && <button ref={refs.forward} type="button" aria-label={`Move ${sort.name} ${axis === "y" ? "down" : "later"}`} title={axis === "y" ? "Move down" : "Move later"} disabled={sort.index >= sort.count - 1} onClick={() => sort.move(1, "forward")} className={btn}><Forward size={16} /></button>}
        {showGrip && <button ref={refs.grip} type="button" data-grip="" title="Drag to move" {...sort.grip} className={btn}><GripVertical size={16} /></button>}
      </span>
      {/* on a small tile the four buttons don't fit in one row: the eye goes to the opposite corner */}
      {compact && showRest && eye("absolute bottom-0.5 right-0.5 [&_svg]:!text-current text-current hover:!bg-current/20")}
    </>
  );
}
