"use client";

/**
 * A stand-in for framer-motion's `motion` and `AnimatePresence` that keeps the markup and drops the animation.
 * Jimkit animates with CSS (see styles.css) so the app ships no animation runtime. Code that was written against
 * framer-motion keeps working: the animation props are simply ignored.
 */
import { createElement, forwardRef, Fragment, type ReactNode } from "react";

const SKIP = new Set([
  "initial", "animate", "exit", "transition", "variants", "custom", "layout", "layoutId", "layoutDependency", "whileHover", "whileTap",
  "whileFocus", "whileInView", "whileDrag", "drag", "dragConstraints", "dragElastic", "dragControls", "dragListener", "dragMomentum",
  "onDragStart", "onDrag", "onDragEnd", "onAnimationComplete", "onUpdate", "mode",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = any;
const cache = new Map<string, React.ComponentType<AnyProps>>();

function make(tag: string) {
  const C = forwardRef<HTMLElement, AnyProps>(function Motion(props, ref) {
    const rest: Record<string, unknown> = {};
    for (const k of Object.keys(props)) if (!SKIP.has(k)) rest[k] = props[k];
    return createElement(tag, { ...rest, ref });
  });
  return C as React.ComponentType<AnyProps>;
}

export const motion = new Proxy({} as Record<string, React.ComponentType<AnyProps>>, {
  get(_t, tag: string) {
    let c = cache.get(tag);
    if (!c) { c = make(tag); cache.set(tag, c); }
    return c;
  },
});

export function AnimatePresence({ children }: { children?: ReactNode; mode?: string; initial?: boolean; custom?: unknown }) {
  return createElement(Fragment, null, children);
}
