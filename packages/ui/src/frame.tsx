"use client";

import { X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { IconBtn } from "./controls";
import { Kebab, type ActionEntry } from "./menu";
import { useDialogFocus } from "./overlay";
import { Tile } from "./icons";

/**
 * Inside <Embedded>, tools fill their container instead of the screen: no fixed positioning, no page-scroll lock, no Escape or close button.
 * For showing a tool on a page (a demo); the app never sets it.
 */
const EmbeddedContext = createContext(false);
export const Embedded = ({ children }: { children: ReactNode }) => <EmbeddedContext.Provider value>{children}</EmbeddedContext.Provider>;

/**
 * What the host puts in the ⋮ menu of every tool's header: favourite it, copy a link to it, and so on. The tool does not know about it.
 * Outside a provider (a demo page, a test) there is no menu.
 */
const FrameMenuContext = createContext<(() => ActionEntry[]) | null>(null);
export const FrameMenu = FrameMenuContext.Provider;

/** The full-screen shell every tool lives in: a close button, a title, the tool's actions, then the body. */
export function ToolFrame({ title, subtitle, icon, hue, onClose, actions, mobile, children }: {
  title: string; subtitle?: ReactNode; icon: string; hue: number; onClose: () => void; actions?: ReactNode; mobile?: boolean; children: ReactNode;
}) {
  const embedded = useContext(EmbeddedContext);
  const menu = useContext(FrameMenuContext);
  const root = useRef<HTMLDivElement>(null);
  useDialogFocus(root, !embedded);
  useEffect(() => {
    if (embedded) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) onClose(); };
    window.addEventListener("keydown", on);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", on); document.body.style.overflow = prev; };
  }, [onClose, embedded]);
  return (
    <div ref={root} tabIndex={embedded ? undefined : -1} className={`jk-open jk-frame ${embedded ? "absolute inset-0" : "fixed inset-0 z-[65] outline-none"} flex flex-col bg-bg`} role={embedded ? "group" : "dialog"} aria-modal={embedded ? undefined : true} aria-label={title}>
      <header className="pt-safe relative z-30 shrink-0 border-b border-line bg-surface">
        <div className={`flex ${mobile ? "h-[52px] px-2.5" : "h-14 px-4"} items-center gap-2.5`}>
          {!embedded && <IconBtn label="Close (Esc)" onClick={onClose}><X size={18} /></IconBtn>}
          <Tile icon={icon} hue={hue} size={mobile ? 30 : 34} />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold leading-tight">{title}</p>
            {subtitle && <p className="truncate text-[11.5px] leading-tight text-faint">{subtitle}</p>}
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-1.5">{actions}{menu && !embedded && <Kebab items={menu} label="This tool" />}</div>
        </div>
      </header>
      <div className="relative z-0 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
