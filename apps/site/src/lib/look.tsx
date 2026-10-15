"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { accentVars, isAccent } from "./accent";

import { FLAT_THEMES, LOOK_KEY, type Look, type Mode, type Theme, DEFAULT_LOOK } from "./look-config";
export { THEMES, DEFAULT_LOOK, LOOK_KEY, LOOK_SCRIPT } from "./look-config";
export type { Look, Mode, Theme } from "./look-config";

interface LookApi extends Look {
  setTheme(t: Theme): void;
  setMode(m: Mode): void;
  setAccent(a: string): void;
}
const Ctx = createContext<LookApi | null>(null);
export const useLook = () => useContext(Ctx)!;

/** The look is switched with a view transition: the old one is photographed and the new one revealed through a circle growing from the press. */
function withTransition(apply: () => void, at: { x: number; y: number }) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce) return apply();
  const r = Math.hypot(Math.max(at.x, window.innerWidth - at.x), Math.max(at.y, window.innerHeight - at.y));
  const root = document.documentElement;
  const soft = typeof CSS !== "undefined" && "registerProperty" in CSS && CSS.supports("mask-image", "radial-gradient(circle at 0 0, #000, transparent)");
  const feather = 140;
  root.style.setProperty("--jk-x", `${at.x}px`);
  root.style.setProperty("--jk-y", `${at.y}px`);
  if (soft) root.classList.add("jk-soft-reveal");
  const t = doc.startViewTransition(() => flushSync(apply));
  t.ready.then(() => {
    // fill: the circle has to stay open until the transition is taken down, or the old look shows through for one frame
    const timing = { duration: 800, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" as const, pseudoElement: "::view-transition-new(root)" };
    root.animate(soft ? { "--jk-r": ["0px", `${r + feather}px`] } : { clipPath: [`circle(0px at ${at.x}px ${at.y}px)`, `circle(${r}px at ${at.x}px ${at.y}px)`] }, timing);
  }).catch(() => {});
  t.finished.finally(() => root.classList.remove("jk-soft-reveal"));
}

export function LookProvider({ children }: { children: ReactNode }) {
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const last = useRef({ x: 0, y: 0 });

  // the page was painted with whatever the script found; take it over without animating
  useEffect(() => {
    const h = document.documentElement;
    const accent = h.dataset.accent ?? DEFAULT_LOOK.accent;
    setLook({ theme: (h.dataset.theme as Theme) ?? DEFAULT_LOOK.theme, mode: (h.dataset.mode as Mode) ?? DEFAULT_LOOK.mode, accent: isAccent(accent) ? accent : DEFAULT_LOOK.accent });
    last.current = { x: window.innerWidth / 2, y: 80 };
    const on = (e: PointerEvent) => { last.current = { x: e.clientX, y: e.clientY }; };
    document.addEventListener("pointerdown", on, { capture: true, passive: true });
    return () => document.removeEventListener("pointerdown", on, { capture: true });
  }, []);

  const save = (next: Look) => { try { localStorage.setItem(LOOK_KEY, JSON.stringify(next)); } catch { /* storage blocked: the look just isn't remembered */ } };

  const setTheme = useCallback((theme: Theme) => withTransition(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.toggleAttribute("data-flat", FLAT_THEMES.includes(theme)); // Metro is a flat look: the app's hover lifts and custom controls stay off
    setLook((l) => { const n = { ...l, theme }; save(n); return n; });
  }, last.current), []);
  const setMode = useCallback((mode: Mode) => withTransition(() => {
    const el = document.documentElement;
    el.dataset.mode = mode;
    // the black accent is white on a dark page, and a custom colour close to the page's own is moved away from it: both follow the mode
    const a = el.dataset.accent ?? "";
    if (a === "ink" || a.startsWith("hex-")) for (const [k, v] of Object.entries(accentVars(a, mode))) el.style.setProperty(k, v);
    setLook((l) => { const n = { ...l, mode }; save(n); return n; });
  }, last.current), []);
  const setAccent = useCallback((accent: string) => {
    const el = document.documentElement;
    for (const k of ["--accent", "--accent-fg", "--accent-rgb"]) el.style.removeProperty(k);
    for (const [k, v] of Object.entries(accentVars(accent, el.dataset.mode === "dark" ? "dark" : "light"))) el.style.setProperty(k, v);
    el.dataset.accent = accent;
    setLook((l) => { const n = { ...l, accent }; save(n); return n; });
  }, []);

  const value = useMemo(() => ({ ...look, setTheme, setMode, setAccent }), [look, setTheme, setMode, setAccent]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
