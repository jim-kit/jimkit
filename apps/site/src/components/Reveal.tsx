"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fades a block in the first time it scrolls into view (not with reduced motion). */
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // a browser without IntersectionObserver just shows everything
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`${seen ? "site-rise" : "opacity-0"} ${className}`} style={delay ? { animationDelay: `${delay * 90}ms` } : undefined}>{children}</div>;
}
