"use client";

import { useEffect, useRef, useState } from "react";

type Line = { kind: "cmd" | "out"; text: string };

/** A terminal that types its commands when it scrolls into view. The lines are what the CLI prints. */
export function Terminal({ lines, title }: { lines: Line[]; title: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [go, setGo] = useState(false);
  const [done, setDone] = useState(0); // lines fully shown
  const [typed, setTyped] = useState(0); // characters of the current command

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return setGo(true);
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setGo(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!go) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setDone(lines.length);
    if (done >= lines.length) return;
    const line = lines[done];
    if (line.kind === "out") { const t = setTimeout(() => { setDone(done + 1); setTyped(0); }, 420); return () => clearTimeout(t); }
    if (typed < line.text.length) { const t = setTimeout(() => setTyped(typed + 1), 24 + Math.random() * 40); return () => clearTimeout(t); }
    const t = setTimeout(() => { setDone(done + 1); setTyped(0); }, 380);
    return () => clearTimeout(t);
  }, [go, done, typed, lines]);

  return (
    <div ref={root} className="jk-card overflow-hidden rounded-xl" aria-label={title}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5"><span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" /><span className="font-mono-label ml-2 text-faint">{title}</span></div>
      <pre className="min-h-[300px] whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-[1.75]" aria-live="off"><code>
        {lines.slice(0, done + 1).map((l, i) => {
          const current = i === done;
          const text = current && l.kind === "cmd" ? l.text.slice(0, typed) : l.text;
          if (current && !(l.kind === "cmd")) return null;
          return <span key={i} className="block">{l.kind === "cmd" ? <><span className="select-none text-accent">$ </span>{text}{current && <span className="ml-px inline-block h-[1.05em] w-[7px] translate-y-[2px] animate-pulse bg-fg" />}</> : <span className="text-dim">{text}</span>}</span>;
        })}
      </code></pre>
    </div>
  );
}
