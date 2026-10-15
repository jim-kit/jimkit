"use client";

import { useEffect, useRef, type PointerEvent as RPointerEvent } from "react";
import { LINE_HEIGHT, angleFromPointer, fontCss, normAngle, pickHandleSide, scaleFromCorner, snapAngle, type Bounds, type Corner, type HandleSide, type Layout } from "./lib/editor/text";
import type { TextItem } from "./lib/editor/types";
import type { ImageEditor } from "./useImageEditor";

const CORNERS: { id: Corner; x: number; y: number; cursor: string }[] = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" }, { id: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize" }, { id: "sw", x: 0, y: 1, cursor: "nesw-resize" },
];

type Drag =
  | { kind: "scale"; corner: Corner; start: TextItem; layout: Layout }
  | { kind: "rotate"; start: TextItem; side: HandleSide };

/**
 * What sits on top of the picture while the text tool is open: a thin box round every text, and on the selected one four
 * corner handles, a turn handle and, when it is being edited, a text area laid exactly over it. Moving a text is the
 * stage's job (it owns the pointer); this layer owns the handles.
 */
export function TextLayer({ ed, z, view, touch, toBase, layoutOf }: {
  ed: ImageEditor; z: number; view: Bounds; touch: boolean; toBase: (x: number, y: number) => [number, number]; layoutOf: (t: TextItem) => Layout;
}) {
  const { state, previewScale: ps, origin } = ed;
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const cancel = () => { if (drag.current) { drag.current = null; ed.endLive(); } };
    window.addEventListener("editor:pinch", cancel);
    return () => window.removeEventListener("editor:pinch", cancel);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const hs = (touch ? 24 : 13) / z; // handle size in preview pixels, constant on screen whatever the zoom
  const gap = (touch ? 40 : 30) / z;
  const grab = (touch ? 44 : 32) / z; // the turn handle's hit area; the dot you see is smaller
  // the turn handle hangs on the top edge, or on another one when the top is out of sight
  const SIDE_AT: Record<HandleSide, { left: string; top: string; turn: number }> = {
    top: { left: "50%", top: "0%", turn: 0 }, right: { left: "100%", top: "50%", turn: 90 },
    bottom: { left: "50%", top: "100%", turn: 180 }, left: { left: "0%", top: "50%", turn: 270 },
  };

  const down = (d: Drag) => (e: RPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = d;
  };
  const move = (t: TextItem) => (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [bx, by] = toBase(e.clientX, e.clientY);
    if (d.kind === "scale") ed.updateText(t.id, scaleFromCorner(d.start, d.layout, d.corner, bx, by), true);
    else ed.updateText(t.id, { rotation: snapAngle(angleFromPointer(d.start, bx, by, d.side), e.shiftKey) }, true);
  };
  const up = () => { if (drag.current) { drag.current = null; ed.endLive(); } };

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {state.texts.map((t) => {
        const l = layoutOf(t);
        const selected = ed.selectedText === t.id;
        const editing = ed.editingText === t.id;
        const w = l.w * ps;
        const h = l.h * ps;
        const side = drag.current?.kind === "rotate" && drag.current.start.id === t.id ? drag.current.side
          : pickHandleSide({ ...t, x: (t.x - origin.x) * ps, y: (t.y - origin.y) * ps }, { w, h }, gap, view, grab / 2 + 2 / z);
        const at = SIDE_AT[side];
        return (
          <div
            key={t.id}
            className="absolute"
            style={{
              left: (t.x - origin.x) * ps - w / 2, top: (t.y - origin.y) * ps - h / 2, width: w, height: h,
              transform: `rotate(${t.rotation}deg)`, transformOrigin: "50% 50%", pointerEvents: "none",
              outline: `${(selected ? 1.5 : 1) / z}px ${selected ? "solid" : "dashed"} rgb(var(--accent-rgb) / ${selected ? 1 : 0.35})`,
            }}
          >
            {selected && (
              <>
                <div className="absolute" style={{ left: at.left, top: at.top, width: 0, height: 0, transform: `rotate(${at.turn}deg)` }}>
                  <div className="absolute left-0 top-0" style={{ width: 1.5 / z, height: gap, transform: "translate(-50%, -100%)", background: "rgb(var(--accent-rgb))" }} />
                  <div
                    data-overlay role="slider" tabIndex={0} aria-label="Rotate text" aria-valuemin={-180} aria-valuemax={180} aria-valuenow={Math.round(t.rotation)}
                    onPointerDown={down({ kind: "rotate", start: t, side })} onPointerMove={move(t)} onPointerUp={up} onPointerCancel={up}
                    onKeyDown={(e) => {
                      const k = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
                      if (!k) return;
                      e.preventDefault();
                      e.stopPropagation();
                      ed.updateText(t.id, { rotation: normAngle(t.rotation + k * (e.shiftKey ? 15 : 1)) });
                    }}
                    className="group absolute left-0 grid cursor-grab place-items-center outline-none active:cursor-grabbing"
                    style={{ top: -gap, width: grab, height: grab, transform: "translate(-50%, -50%)", touchAction: "none", pointerEvents: "auto" }}
                  >
                    <span
                      className="block rounded-full border-accent bg-white transition-transform group-hover:scale-125 group-focus-visible:scale-125 group-active:scale-125"
                      style={{ width: hs * 1.05, height: hs * 1.05, borderWidth: 2 / z, borderStyle: "solid", boxShadow: "0 1px 6px rgb(0 0 0 / .5)" }}
                    />
                  </div>
                </div>
                {CORNERS.map((c) => (
                  <div
                    key={c.id} data-overlay
                    onPointerDown={down({ kind: "scale", corner: c.id, start: t, layout: l })} onPointerMove={move(t)} onPointerUp={up} onPointerCancel={up}
                    className="absolute grid place-items-center"
                    style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: hs, height: hs, transform: "translate(-50%, -50%)", cursor: c.cursor, touchAction: "none", pointerEvents: "auto" }}
                  >
                    <span className="block bg-white" style={{ width: hs * 0.6, height: hs * 0.6, border: `${2 / z}px solid rgb(var(--accent-rgb))`, boxShadow: "0 1px 6px rgb(0 0 0 / .5)" }} />
                  </div>
                ))}
              </>
            )}
            {editing && <Editor ed={ed} t={t} l={l} />}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The text area sits over the canvas text with its own text made invisible, so what you see while typing is the same
 * drawing the export will make. Only the caret and the selection are the browser's.
 */
function Editor({ ed, t, l }: { ed: ImageEditor; t: TextItem; l: Layout }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ps = ed.previewScale;
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);
  return (
    <textarea
      ref={ref} data-overlay value={t.text} wrap="off" spellCheck={false} aria-label="Text"
      onChange={(e) => ed.updateText(t.id, { text: e.target.value }, true)}
      onBlur={() => { ed.endLive(); ed.setEditingText(null); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") ref.current?.blur();
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? ed.redo() : ed.undo(); }
      }}
      className="absolute inset-0 resize-none select-text overflow-hidden whitespace-pre border-0 bg-transparent outline-none"
      style={{
        padding: l.pad * ps, font: fontCss(t, t.size * ps), lineHeight: `${LINE_HEIGHT * t.size * ps}px`, textAlign: t.align,
        color: "transparent", caretColor: "rgb(var(--accent-rgb))", cursor: "text", touchAction: "auto", pointerEvents: "auto",
      }}
    />
  );
}
