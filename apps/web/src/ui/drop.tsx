"use client";

import { Tile, useDialogFocus, useOverlayEscape } from "@jimkit/ui";
import { Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { actionsFor } from "./catalog";
import { useApp } from "./providers";

/** Drop files anywhere: a full-window overlay while dragging, then a chooser of the tools that can take them. */
export function DropLayer() {
  const { setPending, workspaceOpen } = useDrop();
  const [active, setActive] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth.current++; setActive(true); } };
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth.current <= 0) { depth.current = 0; setActive(false); } };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setActive(false);
      if (!workspaceOpen() && e.dataTransfer?.files.length) setPending(Array.from(e.dataTransfer.files));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [setPending, workspaceOpen]);

  if (!active) return null;
  return (
    <div className="jk-fade pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/60">
      <div className="jk-panel grid place-items-center rounded-3xl border-2 border-dashed border-accent px-20 py-16 text-center">
        <Upload size={52} className="text-accent" strokeWidth={1.5} />
        <p className="mt-4 text-2xl font-semibold">Release to choose a tool</p>
      </div>
    </div>
  );
}

function useDrop() {
  const { setPending, current } = useApp();
  const ref = useRef(current);
  ref.current = current;
  // stable, so DropLayer's effect doesn't take its four window listeners off and put them back on every render
  const workspaceOpen = useCallback(() => !!ref.current, []);
  return { setPending, workspaceOpen };
}

/** "What do you want to do with these?" */
export function FileChooser() {
  const { pending, setPending, catalog, openTool } = useApp();
  const box = useRef<HTMLDivElement>(null);
  useOverlayEscape(!!pending, () => setPending(null));
  useDialogFocus(box, !!pending);
  if (!pending) return null;
  const actions = actionsFor(pending, catalog);
  const names = pending.length === 1 ? pending[0].name : `${pending.length} files`;
  return (
    <div className="jk-fade fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" onMouseDown={() => setPending(null)}>
      <div ref={box} tabIndex={-1} className="jk-panel jk-pop w-full max-w-[460px] rounded-3xl p-5 outline-none" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Choose a tool">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[17px] font-semibold">What should happen to this?</p>
            <p className="mt-0.5 truncate text-[13px] text-faint">{names}</p>
          </div>
          <button onClick={() => setPending(null)} aria-label="Cancel" className="grid size-8 shrink-0 place-items-center rounded-lg text-faint hover:bg-tint-2 hover:text-fg"><X size={16} /></button>
        </div>
        <ul className="mt-4 space-y-1.5">
          {actions.map((a) => {
            const tool = catalog.byId.get(a.tool);
            if (!tool) return null;
            return (
              <li key={`${a.addon}/${a.id}`}>
                <button onClick={() => openTool(a.tool, { files: pending })} className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition hover:border-line-strong hover:bg-tint">
                  <Tile icon={a.icon} hue={catalog.category(tool.category).hue} size={34} />
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium">{a.label}</span><span className="block truncate text-[12px] text-faint">{tool.name}</span></span>
                </button>
              </li>
            );
          })}
          {actions.length === 0 && <li className="rounded-xl border border-line px-4 py-6 text-center text-[13.5px] text-dim">None of the installed tools can open {pending.length === 1 ? "this kind of file" : "these files"}.</li>}
        </ul>
      </div>
    </div>
  );
}
