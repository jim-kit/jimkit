"use client";

import { useEffect, useRef } from "react";

/** A thin line across the top that fills as you scroll. The gradient is fixed across the whole width and uncovered as you go. */
export function ScrollBar() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - innerHeight;
        bar.current?.style.setProperty("--p", String(max > 0 ? Math.min(1, scrollY / max) : 0));
      });
    };
    on();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, []);
  return <div ref={bar} aria-hidden className="sun-bar pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]" />;
}
