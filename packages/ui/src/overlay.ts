"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Escape for things that sit on top of the page: the palette, a dialog, a sheet, a menu.
 *
 * A tool's own frame closes on Escape too, and so does a text field's find bar. Handled one by one, an overlay opened over a tool
 * would close the tool as well as itself (and lose its unsaved work). So overlays share one listener, which runs before everything
 * else (capture phase), acts for the topmost overlay only, and keeps the key from reaching anything beneath.
 */
const stack: { fn: () => void }[] = [];

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape" || !stack.length || e.isComposing) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  stack[stack.length - 1].fn();
}

/** While `active`, Escape calls `onEscape` (the topmost overlay wins, and nothing underneath hears it). */
export function useOverlayEscape(active: boolean, onEscape: () => void) {
  const latest = useRef(onEscape);
  latest.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const entry = { fn: () => latest.current() };
    if (!stack.length) window.addEventListener("keydown", onKey, true);
    stack.push(entry);
    return () => {
      stack.splice(stack.indexOf(entry), 1);
      if (!stack.length) window.removeEventListener("keydown", onKey, true);
    };
  }, [active]);
}

/**
 * A dialog takes focus when it opens and hands it back when it closes, so a keyboard user lands in it and returns to where they were.
 * Focus goes to the first control inside, or to the dialog itself (give it tabIndex={-1}).
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, active = true) {
  useLayoutEffect(() => {
    if (!active) return;
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (el && !el.contains(before)) {
      const first = el.querySelector<HTMLElement>('input:not([type="hidden"]), button:not(:disabled), [href], select, textarea, [tabindex]:not([tabindex="-1"])');
      (first ?? el).focus({ preventScroll: true });
    }
    return () => { if (before && document.contains(before)) before.focus({ preventScroll: true }); };
  }, [ref, active]);
}
