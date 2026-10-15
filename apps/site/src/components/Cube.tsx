"use client";

import { useEffect, useRef, useState } from "react";

/*
 * The hexagon-J mark, built from its own faces. They fly together when the page loads, lean towards the pointer at
 * different depths, and scatter when you click it. The four shades are the favicon's, derived from the accent colour.
 */
const TONES: string[][] = [
  ["M560,56 L560,326 L348,190", "M292,226 L498,356 L292,486 L86,356", "M562,390 L671,325 L671,719 L562,786", "M346,520 L452,584 L452,716 L346,775"],
  ["M560,56 L772,190 L560,326", "M86,356 L292,486 L292,744 L86,614", "M826,226 L1037,356 L826,484", "M86,684 L294,813 L86,942"],
  ["M826,548 L1037,678 L1037,942 L826,812", "M348,849 L561,980 L561,1232 L348,1101", "M671,325 L770,265 L770,778 L671,719", "M346,775 L452,716 L562,786 L562,910"],
  ["M826,484 L1037,356 L1037,614", "M294,813 L86,942 L294,1072", "M615,942 L826,812 L1037,942 L826,1072", "M561,980 L774,1105 L561,1232", "M562,786 L671,719 L770,778 L562,910", "M452,584 L452,716 L556,650"],
];
const DEPTH = [1.25, 0.95, 0.65, 0.35];

// a fixed scatter, so the same faces fly in from the same places every time
const scatter = (i: number) => {
  const a = Math.sin(i * 12.9898) * 43758.5453, b = Math.sin(i * 78.233) * 12543.331, c = Math.sin(i * 3.17) * 9731.77;
  const f = (x: number) => x - Math.floor(x) - 0.5;
  return { x: f(a) * 1500, y: f(b) * 1500, r: f(c) * 260 };
};

export function Cube({ className = "", poster }: { className?: string; poster?: boolean }) {
  const root = useRef<SVGSVGElement>(null);
  const [state, setState] = useState<"waiting" | "built" | "apart">("waiting");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const t = setTimeout(() => setState("built"), 120);
    return () => { clearTimeout(t); clearTimeout(timer.current); };
  }, []);

  // lean towards the pointer: one pair of variables on the svg, each face multiplies them by its depth
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const on = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = Math.max(-1.4, Math.min(1.4, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
        const y = Math.max(-1.4, Math.min(1.4, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
        el.style.setProperty("--px", x.toFixed(3));
        el.style.setProperty("--py", y.toFixed(3));
      });
    };
    window.addEventListener("pointermove", on, { passive: true });
    return () => { window.removeEventListener("pointermove", on); cancelAnimationFrame(raf); };
  }, []);

  const burst = () => {
    setState("apart");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("built"), 1100);
  };

  let n = 0;
  return (
    <svg ref={root} className={`cube ${poster ? "cube--poster" : ""} ${className}`} data-state={state} viewBox="-39 44 1200 1200" role="img" aria-label="The Jimkit logo, in pieces that come together. Click it to scatter them." onClick={burst} style={{ cursor: "pointer", ["--px" as string]: 0, ["--py" as string]: 0 }}>
      {TONES.map((faces, t) => faces.map((d) => {
        const i = n++, s = scatter(i);
        return (
          <g key={d} className="cube-lean" style={{ ["--z" as string]: DEPTH[t] }}>
            <path d={`${d}Z`} className={`cube-face cube-t${t}`} strokeWidth={1.6} strokeLinejoin="round" style={{ ["--sx" as string]: `${s.x}px`, ["--sy" as string]: `${s.y}px`, ["--sr" as string]: `${s.r}deg`, ["--i" as string]: i }} />
          </g>
        );
      }))}
    </svg>
  );
}
