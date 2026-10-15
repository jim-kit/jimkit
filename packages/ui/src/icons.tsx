"use client";

import {
  Archive, AudioLines, Binary, BookOpen, Braces, Calculator, CalendarClock, CirclePlay, Clapperboard, Code, Command, Crop, Database,
  Dices, Download, Eraser, File, FilePen, FileText, Film, Fingerprint, Folder, GitCompare, Globe, Hash, Headphones, Heading, Image, Layers, Link2,
  ListVideo, Lock, LockOpen, Music, Palette, PenLine, Puzzle, QrCode, Regex, ScanSearch, ScanText, Scissors, Search, Settings, Shield,
  Shuffle, Sparkles, Star, Tags, Terminal, Timer, Upload, WandSparkles, Wifi, Wrench, type LucideIcon,
} from "lucide-react";
import { createElement, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { readableOn } from "./color";

const BUILT_IN: Record<string, LucideIcon> = {
  Archive, AudioLines, Binary, BookOpen, Braces, Calculator, CalendarClock, CirclePlay, Clapperboard, Code, Command, Crop, Database,
  Dices, Download, Eraser, File, FilePen, FileText, Film, Fingerprint, Folder, GitCompare, Globe, Hash, Headphones, Heading, Image, Layers, Link2,
  ListVideo, Lock, LockOpen, Music, Palette, PenLine, Puzzle, QrCode, Regex, ScanSearch, ScanText, Scissors, Search, Settings, Shield,
  Shuffle, Sparkles, Star, Tags, Terminal, Timer, Upload, WandSparkles, Wifi, Wrench,
};

/** True when the shared set can draw this icon (an addon may still bring its own with registerIcons). */
export const hasBuiltInIcon = (name: string) => name in BUILT_IN;

type IconComponent = (props: { size?: number; strokeWidth?: number; className?: string }) => React.ReactNode;
const extra = new Map<string, IconComponent>();
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

/** Addons can bring icons the built-in set lacks. The host registers them when it loads the addon; icons already on screen redraw. */
export function registerIcons(icons: Record<string, IconComponent>) {
  for (const [name, c] of Object.entries(icons)) extra.set(name, c);
  version++;
  for (const cb of listeners) cb();
}

export function Icon({ name, size = 20, strokeWidth = 1.8, className }: { name: string; size?: number; strokeWidth?: number; className?: string }) {
  useSyncExternalStore(subscribe, () => version, () => 0); // redraw when an addon registers its icons late
  const custom = extra.get(name);
  if (custom) return createElement(custom as never, { size, strokeWidth, className });
  const C = BUILT_IN[name] ?? File;
  return <C className={className} size={size} strokeWidth={strokeWidth} aria-hidden />;
}

/**
 * How each built-in icon moves when its card is pointed at. Any icon without an entry here (a kit's own) is drawn in stroke by stroke;
 * a tool can ask for another motion with `iconAnimation` in its manifest. The motions themselves are CSS (styles.css, "icon motion").
 */
export const ICON_MOTION: Record<string, string> = {
  PenLine: "wiggle", FilePen: "wiggle", Wrench: "wiggle", Lock: "wiggle", LockOpen: "wiggle", Puzzle: "wiggle", Eraser: "wiggle",
  Settings: "spin", Regex: "spin", Timer: "spin", Globe: "spin", Wifi: "pop",
  Dices: "tumble", Shuffle: "draw",
  Braces: "spread", Link2: "spread", GitCompare: "pop", Code: "spread", Binary: "draw",
  Crop: "pinch", ScanSearch: "pinch", ScanText: "pinch",
  QrCode: "pop", Palette: "pop", Sparkles: "pop", WandSparkles: "pop", Calculator: "pop", Tags: "pop", Layers: "bounce",
  Download: "bounce", Upload: "bounce", Archive: "bounce", Database: "bounce",
};

/** Strokes are drawn in by animating their dash: every shape gets a length of 1, whatever its real one. */
const normalise = (el: HTMLElement | null) => { el?.querySelectorAll("path, line, polyline, polygon, circle, rect, ellipse").forEach((n) => n.setAttribute("pathLength", "1")); };

/** A colour tile holding an icon. The theme decides how it looks; `hue` (0-360) picks the colour family. */
export function Tile({ icon, hue, size = 40, color, own: chosen, className = "", animation }: { icon: string; hue: number; size?: number; color?: string; own?: boolean; className?: string; animation?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  // an addon's icon may arrive after the tile did and replace the one drawn: its strokes need their length again
  const registry = useSyncExternalStore(subscribe, () => version, () => 0);
  useLayoutEffect(() => normalise(ref.current), [icon, registry]);
  // `color` is an exact "#rrggbb" the visitor picked: it is used as it is, in every theme.
  // `own` says `hue` is a swatch the visitor picked for this tool, so a theme that derives hues (Metro) must not shift it.
  const own = color ? { ["--own" as string]: color, ["--own-fg" as string]: readableOn(color) } : {};
  return (
    <span ref={ref} data-icon={icon} data-anim={animation ?? ICON_MOTION[icon] ?? "draw"} className={`jk-tile jk-round${color ? " jk-hex" : ""}${chosen ? " jk-own" : ""}${className ? ` ${className}` : ""}`} style={{ width: size, height: size, ["--hue" as string]: hue, ...own }}>
      <Icon name={icon} size={Math.round(size * 0.48)} />
    </span>
  );
}
