"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { dragHandle, type Handle } from "./lib/editor/crop";
import { layoutText, pinchText, snapAngle, topmostHit, type Layout } from "./lib/editor/text";
import { measureWith } from "./lib/editor/text-draw";
import { ASPECTS, type Rect } from "./lib/editor/types";
import { TextLayer } from "./TextLayer";
import type { ImageEditor } from "./useImageEditor";

interface View {
  z: number;
  tx: number;
  ty: number;
}

const HANDLES: { id: Handle; x: number; y: number; cursor: string }[] = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" }, { id: "n", x: 0.5, y: 0, cursor: "ns-resize" }, { id: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { id: "e", x: 1, y: 0.5, cursor: "ew-resize" }, { id: "se", x: 1, y: 1, cursor: "nwse-resize" }, { id: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { id: "sw", x: 0, y: 1, cursor: "nesw-resize" }, { id: "w", x: 0, y: 0.5, cursor: "ew-resize" },
];

/**
 * The picture on its checkerboard, with zoom and pan (wheel, pinch, drag) and the tool overlays: crop rectangle,
 * text boxes, drawing. All pointer handling is shared by the desktop and phone editors.
 */
export function Stage({ ed, touch }: { ed: ImageEditor; touch: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ z: 1, tx: 0, ty: 0 });
  const userZoomed = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; z: number; cx: number; cy: number; tx: number; ty: number } | null>(null);
  const panning = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const drawing = useRef(false);
  const textDrag = useRef<{ id: string; start: [number, number]; ox: number; oy: number; moved: boolean; px: number; py: number } | null>(null);
  const textPinch = useRef<{ id: string; text: { x: number; y: number; size: number; rotation: number }; from: [[number, number], [number, number]] } | null>(null);
  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const { display, previewScale: ps, origin, state, tool } = ed;
  const measure = useMemo(() => measureWith(document.createElement("canvas").getContext("2d")!), []);
  const layoutOf = useCallback((t: Parameters<typeof layoutText>[0]): Layout => layoutText(t, measure), [measure]);

  const fit = useCallback(() => {
    const el = box.current;
    if (!el || !display.w) return;
    const pad = touch ? 16 : 48;
    const z = Math.min((el.clientWidth - pad * 2) / display.w, (el.clientHeight - pad * 2) / display.h);
    setView({ z, tx: (el.clientWidth - display.w * z) / 2, ty: (el.clientHeight - display.h * z) / 2 });
    userZoomed.current = false;
  }, [display.w, display.h, touch]);

  useEffect(() => { if (!userZoomed.current) fit(); }, [fit]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (!userZoomed.current) fit(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);
  // a different tool can change what is shown (crop shows the whole picture), so start from a fit
  useEffect(() => { userZoomed.current = false; fit(); }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const z = Math.min(16, Math.max(0.05, v.z * factor));
      const k = z / v.z;
      return { z, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
    userZoomed.current = true;
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  ed.viewApi.current = {
    zoomBy: (f) => { const el = box.current; if (el) zoomAt(f, el.clientWidth / 2, el.clientHeight / 2); },
    fit,
    actual: () => {
      const el = box.current;
      if (!el) return;
      const z = 1 / ps;
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      const v = viewRef.current;
      const k = z / v.z;
      setView({ z, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k });
      userZoomed.current = true;
    },
    zoom: () => viewRef.current.z * ps,
  };

  /** container point to base-space point */
  const toBase = (clientX: number, clientY: number): [number, number] => {
    const r = box.current!.getBoundingClientRect();
    const v = viewRef.current;
    const cx = (clientX - r.left - v.tx) / v.z;
    const cy = (clientY - r.top - v.ty) / v.z;
    return [cx / ps + origin.x, cy / ps + origin.y];
  };

  // These run in the capture phase so a pinch works even when the fingers land on the crop box or a text box,
  // which handle their own pointers. A second finger cancels whatever they were doing.
  const onPointerDown = (e: RPointerEvent) => {
    const overlay = (e.target as HTMLElement).closest("[data-overlay]");
    if (!overlay) box.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      e.stopPropagation();
      window.dispatchEvent(new Event("editor:pinch"));
      if (drawing.current) { ed.cancelStroke(); drawing.current = false; }
      panning.current = null;
      const [a, b] = [...pointers.current.values()];
      // two fingers on the selected text turn and scale it; anywhere else they zoom the picture
      const sel = tool === "text" && ed.selectedText ? state.texts.find((t) => t.id === ed.selectedText) : null;
      if (sel) {
        const [mx, my] = toBase((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (topmostHit([sel], layoutOf, mx, my, 24 / (viewRef.current.z * ps))) {
          textDrag.current = null;
          textPinch.current = { id: sel.id, text: { x: sel.x, y: sel.y, size: sel.size, rotation: sel.rotation }, from: [toBase(a.x, a.y), toBase(b.x, b.y)] };
          gesture.current = null;
          return;
        }
      }
      const r = box.current!.getBoundingClientRect();
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: viewRef.current.z, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, tx: viewRef.current.tx, ty: viewRef.current.ty };
      return;
    }
    if (overlay) return; // a crop handle or text box owns this pointer
    if (tool === "text" && e.button === 0) {
      const [bx, by] = toBase(e.clientX, e.clientY);
      const slop = (touch ? 14 : 5) / (viewRef.current.z * ps);
      const sel = state.texts.find((t) => t.id === ed.selectedText);
      const hit = (sel && topmostHit([sel], layoutOf, bx, by, slop)) || topmostHit(state.texts, layoutOf, bx, by, slop);
      ed.setEditingText(null);
      if (hit) {
        ed.setSelectedText(hit.id);
        textDrag.current = { id: hit.id, start: [bx, by], ox: hit.x, oy: hit.y, moved: false, px: e.clientX, py: e.clientY };
        return;
      }
      ed.setSelectedText(null);
    }
    if (tool === "draw" && e.button === 0) {
      drawing.current = true;
      ed.beginStroke(toBase(e.clientX, e.clientY));
      return;
    }
    panning.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
  };

  const onPointerMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (textPinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const g = textPinch.current;
      e.stopPropagation();
      const r = pinchText(g.text, g.from, [toBase(a.x, a.y), toBase(b.x, b.y)]);
      ed.updateText(g.id, { ...r, rotation: snapAngle(r.rotation, false) }, true);
      return;
    }
    if (gesture.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const g = gesture.current;
      const r = box.current!.getBoundingClientRect();
      const k = Math.hypot(a.x - b.x, a.y - b.y) / g.dist;
      const z = Math.min(16, Math.max(0.05, g.z * k));
      const cx = (a.x + b.x) / 2 - r.left;
      const cy = (a.y + b.y) / 2 - r.top;
      // keep the point that was under the fingers under the fingers
      e.stopPropagation();
      setView({ z, tx: cx - (g.cx - g.tx) * (z / g.z), ty: cy - (g.cy - g.ty) * (z / g.z) });
      userZoomed.current = true;
      return;
    }
    if (drawing.current) return void ed.extendStroke(toBase(e.clientX, e.clientY));
    const td = textDrag.current;
    if (td) {
      if (!td.moved && Math.hypot(e.clientX - td.px, e.clientY - td.py) < 4) return;
      td.moved = true;
      const [bx, by] = toBase(e.clientX, e.clientY);
      ed.updateText(td.id, { x: td.ox + bx - td.start[0], y: td.oy + by - td.start[1] }, true);
      return;
    }
    const p = panning.current;
    if (p) {
      setView((v) => ({ ...v, tx: p.tx + e.clientX - p.x, ty: p.ty + e.clientY - p.y }));
      userZoomed.current = true;
    }
  };

  const onPointerUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (drawing.current) { drawing.current = false; ed.endStroke(); }
    if (textPinch.current) {
      if (pointers.current.size < 2) { textPinch.current = null; ed.endLive(); }
      return;
    }
    const td = textDrag.current;
    if (td) {
      textDrag.current = null;
      if (td.moved) ed.endLive();
      else {
        // a tap; two quick taps on the same text edit it
        const now = Date.now();
        if (lastTap.current?.id === td.id && now - lastTap.current.t < 400) { ed.setEditingText(td.id); lastTap.current = null; }
        else lastTap.current = { id: td.id, t: now };
      }
    }
    if (pointers.current.size === 0) panning.current = null;
    else if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      panning.current = { x: p.x, y: p.y, tx: viewRef.current.tx, ty: viewRef.current.ty };
    }
  };

  // the part of the picture's space that is on screen, so overlays can keep their handles in reach
  const bw = box.current?.clientWidth ?? 0;
  const bh = box.current?.clientHeight ?? 0;
  const visible = { x0: -view.tx / view.z, y0: -view.ty / view.z, x1: bw ? (bw - view.tx) / view.z : Infinity, y1: bh ? (bh - view.ty) / view.z : Infinity };

  const cursor = tool === "draw" ? "crosshair" : panning.current ? "grabbing" : "grab";

  return (
    <div
      ref={box}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ cursor }}
      onPointerDownCapture={onPointerDown} onPointerMoveCapture={onPointerMove} onPointerUpCapture={onPointerUp} onPointerCancelCapture={onPointerUp}
      onDoubleClick={(e) => {
        if (tool === "text") {
          const [bx, by] = toBase(e.clientX, e.clientY);
          const hit = topmostHit(state.texts, layoutOf, bx, by, 5 / (view.z * ps));
          if (hit) return void ed.setEditingText(hit.id);
        }
        fit();
      }}
    >
      <div
        className="absolute left-0 top-0"
        style={{ width: display.w, height: display.h, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.z})`, transformOrigin: "0 0" }}
      >
        <div className="absolute inset-0 shadow-[0_20px_80px_-20px_rgb(0_0_0/.9)]" style={{ background: "repeating-conic-gradient(#1a1d26 0% 25%, #11141b 0% 50%) 0 0 / 24px 24px" }} />
        <canvas ref={ed.canvasRef} className="absolute inset-0 block" style={{ width: display.w, height: display.h }} />
        {tool === "crop" && <CropOverlay ed={ed} z={view.z} touch={touch} />}
        {tool === "text" && <TextLayer ed={ed} z={view.z} view={visible} touch={touch} toBase={toBase} layoutOf={layoutOf} />}
      </div>
    </div>
  );
}

/* ───────────── crop ───────────── */

function CropOverlay({ ed, z, touch }: { ed: ImageEditor; z: number; touch: boolean }) {
  const { state, base, previewScale: ps } = ed;
  const rect: Rect = state.crop ?? { x: 0, y: 0, w: base.w, h: base.h };
  const drag = useRef<{ handle: Handle; px: number; py: number; start: Rect } | null>(null);
  const ratio = useMemo(() => {
    const a = ASPECTS.find((x) => x.id === ed.aspectId);
    if (!a || a.ratio === null) return null;
    return a.ratio === -1 ? base.w / base.h : a.ratio;
  }, [ed.aspectId, base.w, base.h]);

  const down = (handle: Handle) => (e: RPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, px: e.clientX, py: e.clientY, start: rect };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const k = 1 / (z * ps);
    ed.setCrop(dragHandle(d.start, d.handle, (e.clientX - d.px) * k, (e.clientY - d.py) * k, base, ratio), true);
  };
  const up = () => {
    if (drag.current) { drag.current = null; ed.endLive(); }
  };
  useEffect(() => {
    window.addEventListener("editor:pinch", up);
    return () => window.removeEventListener("editor:pinch", up);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const hs = (touch ? 30 : 14) / z; // handle size in canvas pixels, constant on screen whatever the zoom
  const style = { left: rect.x * ps, top: rect.y * ps, width: rect.w * ps, height: rect.h * ps };
  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <div data-overlay className="absolute" style={{ ...style, boxShadow: "0 0 0 100000px rgb(3 4 6 / .62)", outline: `${1.5 / z}px solid rgb(255 255 255 / .9)`, pointerEvents: "auto", cursor: "move", touchAction: "none" }}
        onPointerDown={down("move")} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {[1 / 3, 2 / 3].map((f) => (
          <div key={f}>
            <div className="absolute inset-y-0 bg-white/30" style={{ left: `${f * 100}%`, width: 1 / z }} />
            <div className="absolute inset-x-0 bg-white/30" style={{ top: `${f * 100}%`, height: 1 / z }} />
          </div>
        ))}
        {HANDLES.map((h) => {
          const corner = h.id.length === 2;
          return (
            <div
              key={h.id} data-overlay
              onPointerDown={down(h.id)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
              className="absolute grid place-items-center"
              style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, width: hs, height: hs, transform: "translate(-50%, -50%)", cursor: h.cursor, touchAction: "none", pointerEvents: "auto" }}
            >
              <span className="block rounded-[2px] bg-white shadow-[0_1px_6px_rgb(0_0_0/.6)]" style={{ width: corner ? hs * 0.5 : h.y === 0.5 ? hs * 0.22 : hs * 0.55, height: corner ? hs * 0.5 : h.y === 0.5 ? hs * 0.55 : hs * 0.22 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
