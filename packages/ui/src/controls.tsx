"use client";

import { Check, ChevronDown, Copy } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useOverlayEscape } from "./overlay";
import { copyText, cx } from "./util";

/** Small square icon button. */
export function IconBtn({ label, onClick, disabled, active, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <button
      title={label} aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled}
      className={cx("grid size-9 shrink-0 place-items-center rounded-xl transition active:scale-95 disabled:opacity-30", active ? "bg-accent/15 text-accent" : "text-dim hover:bg-tint-2 hover:text-fg")}
    >
      {children}
    </button>
  );
}

/** Text button. `primary` is the filled accent button, the default is outlined. */
export function Btn({ children, onClick, primary, disabled, title, className = "", type = "button" }: { children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; title?: string; className?: string; type?: "button" | "submit" }) {
  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      className={cx(
        "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-medium transition active:scale-[.97] disabled:opacity-40",
        primary ? "border border-accent bg-accent text-accent-fg hover:brightness-90" : "jk-btn border border-line-strong text-dim hover:bg-tint-2 hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Segmented control. The highlight slides from one option to the next. */
export function Seg<T extends string>({ value, options, onChange, label, small }: { value: T; options: readonly { id: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string; small?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number; slide: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const on = el.querySelector<HTMLElement>('[aria-checked="true"]');
      setBar((p) => (!on ? null : p && p.x === on.offsetLeft && p.w === on.offsetWidth ? p : { x: on.offsetLeft, w: on.offsetWidth, slide: !!p }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options.length]);
  return (
    <div ref={root} role="radiogroup" aria-label={label} className="relative flex shrink-0 rounded-xl border border-line bg-tint p-0.5">
      {bar && <span aria-hidden className={cx("jk-seg-bar pointer-events-none absolute inset-y-0.5 left-0.5 rounded-[10px] bg-tint-2", bar.slide && "transition-[translate,width]")} style={{ width: bar.w, translate: `${bar.x - 2}px 0` }} />}
      {options.map((o) => (
        <button
          key={o.id} role="radio" aria-checked={value === o.id} title={o.title} onClick={() => onChange(o.id)}
          className={cx("relative whitespace-nowrap rounded-[10px] transition", small ? "px-2.5 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]", value === o.id ? "text-fg" : "text-faint hover:text-dim", value === o.id && !bar && "bg-tint-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A pill that toggles an option on or off. */
export function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick} aria-pressed={on} title={title}
      className={cx("flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] transition active:scale-95", on ? "border-accent/60 bg-accent/15 text-fg" : "border-line text-dim hover:bg-tint-2")}
    >
      {children}
    </button>
  );
}

export function CopyBtn({ text, label = "Copy", disabled }: { text: string; label?: string; disabled?: boolean }) {
  const [done, setDone] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <Btn disabled={disabled || !text} onClick={async () => { await copyText(text); setDone(true); clearTimeout(t.current); t.current = setTimeout(() => setDone(false), 1400); }}>
      {done ? <Check size={14} className="text-ok" /> : <Copy size={14} />} {done ? "Copied" : label}
    </Btn>
  );
}

export interface MenuItem { id: string; label: ReactNode; hint?: string; run: () => void; heading?: undefined }
export interface MenuHeading { heading: string }

/** A dropdown menu button. Items can be grouped with headings. */
export function Menu({ trigger, items, align = "right", width = 240 }: { trigger: ReactNode; items: (MenuItem | MenuHeading)[]; align?: "left" | "right"; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("touchstart", down);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("touchstart", down); document.removeEventListener("keydown", key, true); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="jk-btn flex items-center gap-1.5 rounded-xl border border-line-strong px-3 py-2 text-[13px] font-medium text-dim transition hover:bg-tint-2 hover:text-fg active:scale-[.97]"
      >
        {trigger} <ChevronDown size={13} className={cx("text-faint transition", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="menu" style={{ width }}
          className={cx("jk-panel jk-pop absolute z-40 mt-2 max-h-[min(70vh,520px)] overflow-y-auto rounded-2xl p-1.5 shadow-2xl scroll-hide", align === "right" ? "right-0" : "left-0")}
        >
          {items.map((it, i) =>
            "heading" in it && it.heading ? (
              <p key={`h${i}`} className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-[.12em] text-faint first:pt-1">{it.heading}</p>
            ) : (
              <button
                key={(it as MenuItem).id} role="menuitem" onClick={() => { setOpen(false); (it as MenuItem).run(); }}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] text-dim transition hover:bg-tint-2 hover:text-fg"
              >
                <span>{(it as MenuItem).label}</span>
                {(it as MenuItem).hint && <span className="font-mono text-[11px] text-faint">{(it as MenuItem).hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** A labelled surface for an editing area or a result. */
export function Pane({ title, right, children, className = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("jk-card flex min-h-0 min-w-0 flex-col rounded-2xl", className)}>
      <header className="flex min-h-[44px] shrink-0 items-center justify-between gap-2 border-b border-line px-3.5 py-1.5">
        <h3 className="text-[11.5px] font-semibold uppercase tracking-[.14em] text-faint">{title}</h3>
        <div className="flex items-center gap-1.5">{right}</div>
      </header>
      <div className="relative min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** A plain monospace textarea that fills its pane. */
export function Area({ value, onChange, placeholder, readOnly, label, className = "", wrap = true, mono = true }: { value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean; label: string; className?: string; wrap?: boolean; mono?: boolean }) {
  return (
    <textarea
      aria-label={label} value={value} readOnly={readOnly} placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off" wrap={wrap ? "soft" : "off"}
      className={cx("absolute inset-0 size-full resize-none bg-transparent p-3.5 text-[13px] leading-[1.6] outline-none placeholder:text-faint/60", mono && "font-mono", !wrap && "overflow-x-auto whitespace-pre", className)}
    />
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <svg className="jk-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 3a9 9 0 1 0 9 9" /></svg>;
}

/** A bottom sheet (full width on phones, centred on desktop): backdrop, close on Escape or a tap outside. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useOverlayEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="jk-fade fixed inset-0 z-[75] flex items-end justify-center bg-black/55 sm:items-center" onMouseDown={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className="jk-panel jk-sheet flex max-h-[92dvh] w-full max-w-[520px] flex-col rounded-t-[26px] border-b-0 sm:rounded-b-[26px] sm:border-b"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-11 rounded-full bg-tint-2 sm:hidden" />
        {title && <h2 className="px-5 pb-2 pt-4 text-[19px] font-semibold tracking-tight">{title}</h2>}
        <div className="overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-1">{children}</div>
      </div>
    </div>
  );
}
