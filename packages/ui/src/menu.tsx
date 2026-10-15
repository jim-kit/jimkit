"use client";

import { MoreVertical } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useOverlayEscape } from "./overlay";
import { cx } from "./util";

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  /** a small grey line after the label: a shortcut, or the current value */
  hint?: string;
  onSelect(): void;
  danger?: boolean;
  disabled?: boolean;
  /** shows a tick: the item is a switch that is on */
  checked?: boolean;
}
/** `"-"` is a divider. */
export type ActionEntry = MenuAction | "-";

const isAction = (i: ActionEntry): i is MenuAction => i !== "-";

/** Where a menu opens: under a button (its box), or at a point (a right-click). */
type Anchor = { rect: DOMRect } | { x: number; y: number };

/**
 * The menu itself. It is drawn in a portal, so a card's overflow or a stacking context cannot clip it, and it keeps inside the window:
 * it opens below and to the right of its anchor and flips when there is no room. Arrow keys move, Enter picks, Escape closes (and gives
 * focus back to whatever opened it), and a click anywhere else, a scroll or a resize closes it too.
 */
export function MenuPopover({ items, anchor, onClose, label = "Menu", trigger }: { items: ActionEntry[]; anchor: Anchor; onClose(): void; label?: string; trigger?: RefObject<HTMLElement | null> }) {
  const root = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, edge = 8;
    let left: number, top: number;
    if ("rect" in anchor) {
      left = anchor.rect.right - w; // lines up with the button's right edge
      top = anchor.rect.bottom + 6;
      if (top + h > window.innerHeight - edge) top = Math.max(edge, anchor.rect.top - h - 6);
    } else {
      left = anchor.x;
      top = anchor.y;
      if (left + w > window.innerWidth - edge) left = anchor.x - w;
      if (top + h > window.innerHeight - edge) top = anchor.y - h;
    }
    setPos({ left: Math.min(Math.max(edge, left), Math.max(edge, window.innerWidth - w - edge)), top: Math.min(Math.max(edge, top), Math.max(edge, window.innerHeight - h - edge)) });
  }, [anchor, items.length]);

  useEffect(() => {
    // the button that opened the menu is "outside" it too, but pressing it is its own way to close: let its click do that, once
    const away = (e: PointerEvent) => { const t = e.target as Node; if (!root.current?.contains(t) && !trigger?.current?.contains(t)) onClose(); };
    const close = () => onClose();
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("blur", close);
    // focus the first item that can be picked, so the keyboard works at once
    root.current?.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    return () => { document.removeEventListener("pointerdown", away, true); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); window.removeEventListener("blur", close); };
  }, [onClose, trigger]);
  // Escape goes through the shared overlay stack, so a menu opened over a tool closes alone
  useOverlayEscape(true, onClose);

  const onKey = (e: ReactKeyboardEvent) => {
    const buttons = [...(root.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => { e.preventDefault(); buttons[(i + buttons.length) % buttons.length]?.focus(); };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at < 0 ? -1 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(-1);
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === "Tab") { e.preventDefault(); onClose(); }
  };

  return createPortal(
    <div
      ref={root} role="menu" aria-label={label} onKeyDown={onKey} onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
      className="jk-panel jk-pop fixed z-[90] min-w-[200px] max-w-[300px] rounded-xl p-1 text-[13.5px] shadow-2xl"
    >
      {items.map((it, i) => it === "-" ? <div key={i} role="separator" className="my-1 h-px bg-line" /> : (
        <button
          key={i} role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={it.checked} disabled={it.disabled}
          onClick={() => { onClose(); it.onSelect(); }}
          className={cx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors enabled:hover:bg-tint-2 enabled:focus-visible:bg-tint-2 disabled:opacity-40", it.danger ? "text-bad" : "text-fg")}
        >
          <span className="grid size-4 shrink-0 place-items-center text-dim" aria-hidden>{it.checked ? "✓" : it.icon}</span>
          <span className="min-w-0 flex-1 truncate">{it.label}</span>
          {it.hint && <span className="shrink-0 text-[12px] text-faint">{it.hint}</span>}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/** The ⋮ button: opens a menu under itself. `items` may be a function, so a menu is built only when it is opened (and always current). */
export function Kebab({ items, label = "More actions", className, size = 16, stop = true }: { items: ActionEntry[] | (() => ActionEntry[]); label?: string; className?: string; size?: number; stop?: boolean }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setAnchor(null); btn.current?.focus({ preventScroll: true }); }, []);
  const list = anchor ? (typeof items === "function" ? items() : items).filter((i) => i === "-" || isAction(i)) : [];
  return (
    <>
      <button
        ref={btn} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={!!anchor}
        // a kebab sits on cards that are themselves buttons or drag handles: it must not trigger them
        onPointerDown={stop ? (e) => e.stopPropagation() : undefined}
        onClick={(e) => { if (stop) e.stopPropagation(); setAnchor(anchor ? null : { rect: e.currentTarget.getBoundingClientRect() }); }}
        className={cx("grid size-8 shrink-0 place-items-center rounded-lg text-dim transition hover:bg-tint-2 hover:text-fg aria-expanded:bg-tint-2 aria-expanded:text-fg [@media(pointer:coarse)]:size-10", className)}
      >
        <MoreVertical size={size} />
      </button>
      {anchor && <MenuPopover items={list} anchor={anchor} onClose={close} label={label} trigger={btn} />}
    </>
  );
}

/** Right-click (and long-press on touch) menus: spread `bind` on the element, and render `menu` anywhere. */
export function useContextMenu(items: ActionEntry[] | (() => ActionEntry[]), label = "Menu") {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const press = useRef<number | null>(null);
  const bind = {
    onContextMenu: (e: ReactMouseEvent) => { e.preventDefault(); setAnchor({ x: e.clientX, y: e.clientY }); },
    // a long press opens it on touch screens, where there is no right button (the system's own menu is suppressed above)
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      press.current = window.setTimeout(() => setAnchor({ x: t.clientX, y: t.clientY }), 520);
    },
    onTouchEnd: () => { if (press.current) clearTimeout(press.current); },
    onTouchMove: () => { if (press.current) clearTimeout(press.current); },
  };
  const list = anchor ? (typeof items === "function" ? items() : items) : [];
  const menu = anchor ? <MenuPopover items={list} anchor={anchor} onClose={close} label={label} /> : null;
  return { bind, menu };
}
