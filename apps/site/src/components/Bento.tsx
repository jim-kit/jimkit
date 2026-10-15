"use client";

import { Icon } from "@jimkit/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { contrastRatio, parseColour, toOklchString } from "@jimkit/addon-devtools/colour";
import { describeCron, nextRuns, parseCron } from "@jimkit/addon-devtools/cron";
import { encodeQr } from "@jimkit/addon-devtools/qr";
import type { FileAction } from "@/lib/catalog";
import { useLook } from "@/lib/look";
import { offersFor } from "@/lib/offers";
import { sha256 } from "@/lib/sha256";
import { Reveal } from "./Reveal";
import { Section } from "./Section";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 0, 1, 2 … n-1, 0, … every `ms`. Stays on 0 with reduced motion, and until the page is mounted (the server renders the first frame). */
function useCycle(n: number, ms: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced()) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), ms);
    return () => clearInterval(t);
  }, [n, ms]);
  return i;
}

function Cell({ span, kicker, title, text, children, delay = 0 }: { span: string; kicker: string; title: string; text: ReactNode; children: ReactNode; delay?: number }) {
  return (
    <Reveal className={span} delay={delay}>
      <div data-cell className="bento-cell jk-card relative flex h-full flex-col overflow-hidden rounded-2xl p-5 md:p-6">
        <p className="font-mono-label text-faint">{kicker}</p>
        <h3 className="font-display mt-2 text-[1.55rem] leading-[1.08]">{title}</h3>
        <p className="mt-3 text-[14.5px] leading-relaxed text-dim">{text}</p>
        <div className="relative mt-auto pt-6">{children}</div>
      </div>
    </Reveal>
  );
}

/* ── search ── */
const SEARCHES: [string, string[]][] = [["has", ["Hashes", "Encode & decode"]], ["json", ["JSON & YAML", "URL parser"]], ["cron", ["Cron", "Time"]], ["qr", ["QR code"]]];
function SearchCell() {
  const k = useCycle(SEARCHES.length, 3200);
  const [q, results] = SEARCHES[k];
  const [shown, setShown] = useState(q);
  useEffect(() => {
    if (reduced()) return setShown(q);
    let n = 0;
    setShown("");
    const t = setInterval(() => { n++; setShown(q.slice(0, n)); if (n >= q.length) clearInterval(t); }, 150);
    return () => clearInterval(t);
  }, [q]);
  return (
    <div className="h-[142px] rounded-xl border border-line bg-field p-3">
      <div className="flex items-center gap-2.5 border-b border-line pb-2.5 font-mono text-[14px]"><Icon name="Search" size={15} /><span>{shown}<span className="ml-px inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-accent" /></span><span className="kbd ml-auto">ctrl k</span></div>
      <ul className="mt-2 space-y-1">{results.map((r, i) => <li key={r} className={`rounded-lg px-2.5 py-1.5 text-[13.5px] ${i === 0 ? "bg-tint-2" : "text-dim"}`}>{r}</li>)}</ul>
    </div>
  );
}

/* ── hashes ── */
const PHRASES = ["Jimkit", "hello world", "kits", "0.1.0"];
function HashCell() {
  const k = useCycle(PHRASES.length, 3600);
  const text = PHRASES[k];
  const [hex, setHex] = useState("");
  useEffect(() => {
    let live = true;
    void sha256(new TextEncoder().encode(text)).then((out) => {
      if (!live) return;
      if (reduced()) return setHex(out);
      // the digest settles character by character
      let n = 0;
      const t = setInterval(() => { n += 4; setHex(out.slice(0, n) + Array.from({ length: 64 - n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")); if (n >= 64) clearInterval(t); }, 28);
    });
    return () => { live = false; };
  }, [text]);
  return (
    <div className="min-h-[142px] rounded-xl border border-line bg-field p-4">
      <p className="font-mono text-[13px] text-dim"><span className="text-faint">sha-256 of </span><span className="text-fg">“{text}”</span></p>
      <p className="mt-3 break-all font-mono text-[15px] leading-[1.7] tracking-wider text-fg">{hex || "0".repeat(64)}</p>
    </div>
  );
}

/* ── drop ── */
const SAMPLES = [{ name: "holiday.heic", type: "image/heic" }, { name: "notes.md", type: "text/markdown" }, { name: "config.yaml", type: "" }, { name: "backup.zip", type: "application/zip" }];
function DropCell({ actions }: { actions: FileAction[] }) {
  const k = useCycle(SAMPLES.length, 2800);
  const f = SAMPLES[k];
  const offers = offersFor(f, actions);
  const pick = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button onClick={() => pick.current?.click()} className="group block h-[184px] w-full overflow-hidden rounded-xl border-2 border-dashed border-line-strong p-4 text-left transition-colors hover:border-accent">
        <p className="font-mono text-[14px]" key={f.name}><span className="jk-fade inline-block">{f.name}</span></p>
        <div className="mt-3 flex flex-wrap gap-1.5">{offers.map((a) => <span key={`${f.name}-${a.id}`} className="jk-rise flex items-center gap-1.5 rounded-lg bg-tint-2 px-2 py-1 text-[12px]"><Icon name={a.icon} size={12} /> {a.label}</span>)}</div>
        <p className="font-mono-label mt-3 text-faint group-hover:text-accent">Drop your own, or click</p>
      </button>
      <input ref={pick} type="file" hidden onChange={(e) => { if (e.target.files?.length) window.dispatchEvent(new CustomEvent("jk-files", { detail: [...e.target.files] })); e.target.value = ""; }} />
    </div>
  );
}

/* ── colour ── */
const COLOURS = ["#0d6efd", "#e8590c", "#198754", "#d63384", "#7950f2", "#0aa89a"];
function ColourCell() {
  const k = useCycle(COLOURS.length, 2600);
  const hex = COLOURS[k];
  const rgb = parseColour(hex)!;
  const white = contrastRatio({ r: 1, g: 1, b: 1, a: 1 }, rgb), dark = contrastRatio({ r: 0.07, g: 0.08, b: 0.1, a: 1 }, rgb);
  const text = white >= dark ? "white" : "dark";
  const ratio = Math.max(white, dark);
  return (
    <div className="flex items-center gap-4">
      <span className="grid size-[88px] shrink-0 place-items-center rounded-full text-[15px] font-semibold transition-colors duration-700" style={{ background: hex, color: text === "white" ? "#fff" : "#12151a" }}>Aa</span>
      <div className="min-w-0 font-mono text-[12.5px] leading-[1.9] text-dim">
        <p className="text-fg">{hex}</p>
        <p className="truncate">{toOklchString(rgb)}</p>
        <p>{text} text · <span className="text-fg">{ratio.toFixed(1)}:1</span> {ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : "large only"}</p>
      </div>
    </div>
  );
}

/* ── cron ── */
const CRONS = ["*/15 9-17 * * 1-5", "0 3 * * 0", "30 8 1 * *"];
function CronCell() {
  const k = useCycle(CRONS.length, 3400);
  const expr = CRONS[k];
  const [info, setInfo] = useState<{ text: string; runs: string[] } | null>(null);
  useEffect(() => {
    const p = parseCron(expr);
    if (!p.ok) return setInfo({ text: p.error, runs: [] });
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setInfo({ text: describeCron(p.cron), runs: nextRuns(p.cron, Date.now(), 3, zone).map((t) => new Date(t).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: zone })) });
  }, [expr]);
  return (
    <div className="h-[204px] overflow-hidden rounded-xl border border-line bg-field p-4">
      <p className="font-mono text-[15px] text-accent-soft">{expr}</p>
      <p className="mt-2 min-h-[2.8em] text-[13.5px] leading-snug text-dim">{info?.text ?? " "}</p>
      <ul className="mt-2 space-y-0.5 font-mono text-[12px] text-faint">{(info?.runs ?? []).map((r) => <li key={r}>next · <span className="text-dim">{r}</span></li>)}</ul>
    </div>
  );
}

/* ── qr ── */
const QRS = ["Jimkit", "https://example.com", "WIFI:T:WPA;S:home;P:correct horse;;"];
function QrCell() {
  const k = useCycle(QRS.length, 3600);
  const qr = useMemo(() => encodeQr(QRS[k]), [k]);
  const d = useMemo(() => qr.modules.flatMap((row, y) => row.map((on, x) => (on ? `M${x},${y}h1v1h-1z` : ""))).join(""), [qr]);
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0 overflow-hidden rounded-lg bg-white p-2" style={{ width: 118, height: 118 }}>
        <svg key={k} viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} className="jk-fade size-full" shapeRendering="crispEdges"><path d={d} fill="#0b0d12" /></svg>
        <span aria-hidden className="qr-scan pointer-events-none absolute inset-x-0 h-[2px] bg-accent shadow-[0_0_14px_2px_var(--color-accent)]" />
      </div>
      <p className="min-w-0 break-all font-mono text-[12px] leading-[1.7] text-dim">{QRS[k]}<br /><span className="text-faint">version {qr.version} · {qr.ecc}</span></p>
    </div>
  );
}

/* ── visitors ── */
function TiersCell() {
  return (
    <div className="relative mx-auto grid aspect-square w-full max-w-[210px] place-items-center">
      {[100, 70, 40].map((s, i) => <span key={s} aria-hidden className="tier-ring absolute rounded-full border border-line-strong" style={{ width: `${s}%`, height: `${s}%`, animationDelay: `${i * -1.1}s` }} />)}
      <span className="font-mono-label absolute left-1/2 top-[3%] -translate-x-1/2 text-faint">public</span>
      <span className="font-mono-label absolute left-1/2 top-[18%] -translate-x-1/2 text-dim">unlocked</span>
      <span className="font-mono-label absolute text-accent">trusted</span>
    </div>
  );
}

/* ── limits ── */
function LimitsCell() {
  const rows = ["file size", "daily bytes", "jobs at once", "download speed"];
  const k = useCycle(5, 1700);
  const fill = [[30, 60, 80, 45, 70], [60, 25, 90, 70, 40], [20, 55, 35, 80, 60], [75, 40, 55, 30, 85]];
  return (
    <ul className="space-y-3.5">
      {rows.map((r, i) => (
        <li key={r}>
          <div className="font-mono-label mb-1.5 flex justify-between text-faint"><span>{r}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-tint-2"><span className="block h-full rounded-full bg-accent transition-[width] duration-[1400ms] ease-out" style={{ width: `${fill[i][k]}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

/* ── phone ── */
function PhoneCell() {
  return (
    <div className="phone-float mx-auto w-[128px] rounded-[22px] border-2 border-line-strong bg-bg p-2 shadow-xl">
      <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-line-strong" />
      <div className="grid grid-cols-2 gap-1.5">{[285, 45, 345, 75].map((h, i) => <span key={h} className="jk-tile jk-block aspect-square" style={{ ["--hue" as string]: h, padding: 0, animationDelay: `${i * 60}ms` }}><Icon name={["PenLine", "Shuffle", "Crop", "Fingerprint"][i]} className="m-auto size-[44%]" strokeWidth={1.4} /></span>)}</div>
      <div className="mt-2 flex justify-around rounded-lg bg-tint-2 py-1.5">{["Home", "Search", "Settings"].map((n) => <Icon key={n} name={n === "Home" ? "Layers" : n} size={13} />)}</div>
    </div>
  );
}

/* ── accent ── */
const WARM: [string, string][] = [["vermilion", "#ff4d1f"], ["mustard", "#f2a900"], ["forest", "#25b878"], ["lilac", "#8a63ff"], ["pink", "#e8407a"], ["ink", "#1a1510"]];
function AccentCell() {
  const { accent, setAccent } = useLook();
  return (
    <div className="grid grid-cols-3 gap-2">
      {WARM.map(([name, hex]) => {
        const id = name === "ink" ? "ink" : `hex-${hex.slice(1)}`;
        const light = name === "mustard" || name === "forest";
        return (
          <button key={name} onClick={() => setAccent(id)} aria-pressed={accent === id} aria-label={name} className="relative aspect-[1.6] overflow-hidden rounded-xl text-left transition-transform hover:-translate-y-1" style={{ background: name === "ink" ? "var(--color-fg)" : hex, boxShadow: accent === id ? "0 0 0 3px var(--color-bg), 0 0 0 5px var(--color-fg)" : undefined }}>
            <span className="font-mono-label absolute bottom-2 left-2.5" style={{ color: name === "ink" ? "var(--color-bg)" : light ? "#1a1510" : "#fff" }}>{name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Bento({ actions }: { actions: FileAction[] }) {
  // a soft light that follows the pointer inside whichever cell it is over
  const onMove = (e: React.PointerEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell) return;
    const r = cell.getBoundingClientRect();
    cell.style.setProperty("--mx", `${e.clientX - r.left}px`);
    cell.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <Section id="details" num="07" label="Details" title="A closer look at the tools."
      intro="The hash function, the colour calculations, the cron parser, the QR encoder and the rule that matches a file to a tool are the application's own code. Each card below runs that code directly in your browser, so you can try the behaviour described before installing anything.">
      <div onPointerMove={onMove} className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
        <Cell span="lg:col-span-3" kicker="Search" title="Find any tool from the keyboard." text={<>Press <span className="kbd">ctrl k</span>, or <span className="kbd">/</span> when you are not typing in a field. The palette searches tool names, categories and keywords, and the tools you have starred are listed first, so the ones you use most are always a keystroke away.</>}><SearchCell /></Cell>
        <Cell span="lg:col-span-3" delay={1} kicker="Hashes" title="Hashes of text and of whole files." text="MD5, SHA-1, SHA-256, SHA-384, SHA-512, CRC-32 and HMAC. Files are read in chunks, which keeps memory use low for very large files. The digest below is calculated live."><HashCell /></Cell>
        <Cell span="lg:col-span-2" kicker="Drop" title="Drop a file to see which tools accept it." text="Jimkit compares the file's extension and type with what each tool accepts and lists the matching tools, best match first. Drop any file on this page, or click the box, to see the real result for your own file. The file stays in your browser and is not uploaded."><DropCell actions={actions} /></Cell>
        <Cell span="lg:col-span-2" delay={1} kicker="Colour" title="Convert colours and check contrast." text="Convert between hex, RGB, HSL and OKLCH, and see the WCAG contrast ratio against both light and dark text. When a pair of colours does not pass, the tool suggests an adjustment that does."><ColourCell /></Cell>
        <Cell span="lg:col-span-2" delay={2} kicker="Cron" title="Read a cron expression in words." text="Paste an expression and the tool explains what it means in plain language, then lists the next few times it will run in your own time zone."><CronCell /></Cell>
        <Cell span="lg:col-span-2" kicker="QR" title="Make QR codes for text, links and Wi-Fi." text="Each code can be saved as an SVG or PNG file. The encoder is part of the tool and draws the code shown here."><QrCell /></Cell>
        <Cell span="lg:col-span-2" delay={1} kicker="Phone" title="Designed for phones as well." text="The tools get a bottom bar and touch-sized controls. Anything you can drag, like reordering the home screen, also has buttons."><PhoneCell /></Cell>
        <Cell span="lg:col-span-2" delay={2} kicker="Accent" title="Choose your accent colour." text="Choose a preset or any colour from the picker. Buttons, tiles and the logo follow it, and the text on top switches between light and dark so it stays readable. This page is using yours."><AccentCell /></Cell>
      </div>
    </Section>
  );
}
