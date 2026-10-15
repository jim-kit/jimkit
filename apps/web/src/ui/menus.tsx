"use client";

import type { CategoryMeta } from "@jimkit/sdk";
import { ColorPicker, Icon, Tile, copyText, hsvToHex, toast, useDialogFocus, useOverlayEscape, type ActionEntry } from "@jimkit/ui";
import { ArrowDown, ArrowUp, FilePlus2, ArrowUpToLine, ChevronsDownUp, ChevronsUpDown, EyeOff, ExternalLink, Link2, Palette, PanelTopOpen, Star, Trash2, ArrowDownAZ, X } from "lucide-react";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { isHueValue, tint } from "./arrange";
import type { ToolEntry } from "./catalog";
import { useApp } from "./providers";

/** The actions a tool has, wherever it is: on the home screen (a card, a recent, a favourite) or in its own header. */
export function useToolMenu() {
  const { favourites, toggleFavourite, toolHues, setToolHue, setColourFor, openTool, canOpen, toolLink, fullOrder, reorder, setHidden, catalog } = useApp();
  return (tool: ToolEntry, where: "home" | "frame"): ActionEntry[] => {
    const fav = favourites.includes(tool.id);
    const link = toolLink(tool.id);
    const items: ActionEntry[] = [];
    if (where === "home") {
      items.push({ label: "Open", icon: <Icon name={tool.icon} size={15} />, disabled: !canOpen(tool.id), onSelect: () => openTool(tool.id) });
      // the ways the tool offers to start: "New Markdown document" on the text editor
      for (const q of tool.quick ?? []) items.push({ label: q.label, icon: <FilePlus2 size={15} />, disabled: !canOpen(tool.id), onSelect: () => openTool(tool.id, q.init) });
    }
    items.push(
      { label: "Open in a new tab", icon: <ExternalLink size={15} />, disabled: !canOpen(tool.id), onSelect: () => void window.open(link, "_blank", "noopener") },
      { label: "Copy link", icon: <Link2 size={15} />, onSelect: () => void copyText(link, "Link copied") },
      "-",
      { label: "Favourite", icon: <Star size={15} />, checked: fav, onSelect: () => toggleFavourite(tool.id) },
    );
    if (where === "home") {
      items.push({ label: "Colour…", icon: <Palette size={15} />, onSelect: () => setColourFor(tool.id) });
      if (tool.id in toolHues) items.push({ label: "Use the category's colour", icon: <X size={15} />, onSelect: () => setToolHue(tool.id, null) });
      const ids = fullOrder.tools(tool.category);
      if (ids.length > 1 && ids[0] !== tool.id) items.push({ label: `Move to the top of ${catalog.category(tool.category).name}`, icon: <ArrowUpToLine size={15} />, onSelect: () => void reorder.tools(tool.category, [tool.id, ...ids.filter((x) => x !== tool.id)], true) });
      items.push("-", {
        label: "Hide from the home screen", icon: <EyeOff size={15} />,
        onSelect: () => { setHidden("tools", tool.id, true); toast(`${tool.name} is hidden`, { description: "Edit shows it again.", action: { label: "Undo", onClick: () => setHidden("tools", tool.id, false) } }); },
      });
    }
    return items;
  };
}

/** The actions a category has: fold it up, sort it, move it, hide it. */
export function useCategoryMenu() {
  const { collapsed, toggleCollapsed, fullOrder, reorder, setHidden, catalog } = useApp();
  return (cat: CategoryMeta, tools: ToolEntry[]): ActionEntry[] => {
    const folded = collapsed.includes(cat.id);
    const cats = fullOrder.cats();
    const at = cats.indexOf(cat.id);
    // sorted over everything, hidden tools included, so one that comes back later is in its sorted place
    const everyone = fullOrder.tools(cat.id).map((id) => catalog.byId.get(id)).filter((t): t is ToolEntry => !!t);
    const sorted = [...everyone].sort((a, b) => a.name.localeCompare(b.name)).map((t) => t.id);
    const inOrder = sorted.every((id, i) => id === everyone[i]?.id);
    return [
      { label: folded ? "Show its tools" : "Fold up", icon: folded ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />, onSelect: () => toggleCollapsed(cat.id) },
      { label: "Sort A to Z", icon: <ArrowDownAZ size={15} />, disabled: inOrder || tools.length < 2, onSelect: () => void reorder.tools(cat.id, sorted, true) },
      "-",
      { label: "Move up", icon: <ArrowUp size={15} />, disabled: at <= 0, onSelect: () => { const n = [...cats]; [n[at - 1], n[at]] = [n[at], n[at - 1]]; reorder.cats(n, true); } },
      { label: "Move down", icon: <ArrowDown size={15} />, disabled: at < 0 || at >= cats.length - 1, onSelect: () => { const n = [...cats]; [n[at + 1], n[at]] = [n[at], n[at + 1]]; reorder.cats(n, true); } },
      "-",
      {
        label: "Hide this category", icon: <EyeOff size={15} />,
        onSelect: () => { setHidden("cats", cat.id, true); toast(`${cat.name} is hidden`, { description: "Edit shows it again.", action: { label: "Undo", onClick: () => setHidden("cats", cat.id, false) } }); },
      },
    ];
  };
}

/** What a recent tool's menu offers. */
export function useRecentMenu() {
  const { removeRecent, clearRecents, openTool, canOpen } = useApp();
  const toolMenu = useToolMenu();
  return (tool: ToolEntry): ActionEntry[] => [
    { label: "Open", icon: <PanelTopOpen size={15} />, disabled: !canOpen(tool.id), onSelect: () => openTool(tool.id) },
    ...toolMenu(tool, "frame").slice(0, 2),
    "-",
    { label: "Remove from recent", icon: <X size={15} />, onSelect: () => removeRecent(tool.id) },
    { label: "Clear recent", icon: <Trash2 size={15} />, danger: true, onSelect: clearRecents },
  ];
}

const SWATCHES = [0, 25, 55, 90, 140, 175, 205, 250, 280, 310, 340];

/** Chooses the colour of one tool: opened from the ⋮ menu (the star and colour buttons of edit mode do the same in place). */
export function ColourDialog() {
  const { colourFor, setColourFor, catalog, toolHues, setToolHue } = useApp();
  const tool = colourFor ? catalog.byId.get(colourFor) : undefined;
  const box = useRef<HTMLDivElement>(null);
  useOverlayEscape(!!tool, () => setColourFor(null));
  useDialogFocus(box, !!tool);
  if (!tool) return null;
  const chosen = toolHues[tool.id];
  const cat = catalog.category(tool.category);
  const shade = tint(chosen, cat.hue);
  const exact = chosen && !isHueValue(chosen) ? `#${chosen}` : undefined;
  return createPortal(
    <div className="jk-fade fixed inset-0 z-[95] grid place-items-center bg-black/55 p-4" onMouseDown={() => setColourFor(null)}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Colour of ${tool.name}`} onMouseDown={(e) => e.stopPropagation()} className="jk-panel jk-pop w-full max-w-[320px] rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <Tile icon={tool.icon} hue={shade.hue} color={shade.hex} own={isHueValue(chosen)} size={38} />
          <div className="min-w-0"><p className="truncate text-[15px] font-semibold">{tool.name}</p><p className="text-[12.5px] text-faint">{chosen ? "Your colour" : `${cat.name}'s colour`}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {SWATCHES.map((h) => (
            <button key={h} aria-label={`Colour ${h}`} onClick={() => setToolHue(tool.id, String(h))} className="size-7 rounded-full" style={{ background: `oklch(0.62 0.15 ${h})`, boxShadow: chosen === String(h) ? "0 0 0 2px var(--color-surface), 0 0 0 4px currentColor" : undefined }} />
          ))}
        </div>
        <div className="mt-4">
          <ColorPicker value={exact ?? hsvToHex({ h: isHueValue(chosen) ? Number(chosen) : cat.hue, s: 0.7, v: 0.85 })} onChange={(hex) => setToolHue(tool.id, hex.replace("#", "").toLowerCase())} />
        </div>
        <div className="mt-4 flex justify-between gap-2">
          <button onClick={() => setToolHue(tool.id, null)} disabled={!chosen} className="rounded-lg px-3 py-2 text-[13px] text-dim enabled:hover:bg-tint-2 disabled:opacity-40">Use the category's</button>
          <button data-done onClick={() => setColourFor(null)} className="rounded-lg border border-accent bg-accent px-4 py-2 text-[13px] font-medium text-accent-fg hover:brightness-90">Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
