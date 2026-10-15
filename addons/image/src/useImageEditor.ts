"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FILTERS, applyAdjust } from "./lib/editor/adjust";
import { inscribedScale, rectForAspect } from "./lib/editor/crop";
import { canRedo, canUndo, commit, createHistory, redo as redoH, reset as resetH, undo as undoH, type History } from "./lib/editor/history";
import { baseSize, compose, exportImage, loadSource, outputSize, sampleExport, turnedSize, type ExportOptions, type RenderCache, type Source } from "./lib/editor/render";
import { clampSide, resizeState } from "./lib/editor/resize";
import { newText } from "./lib/editor/text";
import { flipAnnotations, rotateAnnotations } from "./lib/editor/transform";
import { ASPECTS, NEUTRAL, type Adjust, type EditState, type FilterId, type Rect, type Stroke, type TextItem } from "./lib/editor/types";

export type ToolId = "crop" | "resize" | "adjust" | "filters" | "draw" | "text";

/** What the stage lends the toolbar: zoom buttons and the like. */
export interface ViewApi {
  zoomBy: (factor: number) => void;
  fit: () => void;
  actual: () => void;
  /** current zoom, 1 being one picture pixel per screen pixel of the preview */
  zoom: () => number;
}

export interface DrawSettings {
  kind: "pen" | "marker";
  color: string;
  /** as a share of the picture's longer side, so a brush looks the same on any resolution */
  size: number;
}

export const SWATCHES = ["#ffffff", "#0b0d12", "#ff4d6d", "#ff9f43", "#ffd93d", "#5eead4", "#4dabf7", "#8b93ff", "#c08bff", "#ff8ad8"];

let uid = 0;
const newId = () => `e${Date.now().toString(36)}${uid++}`;

/** The centred crop that removes the empty corners a straightened picture has. */
export function autoCrop(src: { width: number; height: number }, s: EditState): Rect | null {
  if (s.straighten === 0) return null;
  const quarter = s.rotation === 90 || s.rotation === 270;
  const w = quarter ? src.height : src.width;
  const h = quarter ? src.width : src.height;
  const k = inscribedScale(w, h, s.straighten);
  const b = turnedSize(src, s);
  const cw = w * k;
  const ch = h * k;
  // worked out in the unsquished picture, where the maths is, then squished with it
  return { x: ((b.w - cw) / 2) * s.stretch.x, y: ((b.h - ch) / 2) * s.stretch.y, w: cw * s.stretch.x, h: ch * s.stretch.y };
}

export function useImageEditor(file: File, previewMax: number) {
  const [src, setSrc] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hist, setHist] = useState<History>(() => createHistory());
  const [live, setLive] = useState<EditState | null>(null);
  const [tool, setToolState] = useState<ToolId>("adjust");
  const [draw, setDraw] = useState<DrawSettings>({ kind: "pen", color: "#ff4d6d", size: 0.008 });
  const [aspectId, setAspectId] = useState("free");
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [liveStroke, setLiveStroke] = useState<Stroke | null>(null);
  const [display, setDisplay] = useState({ w: 0, h: 0 });
  const [thumbs, setThumbs] = useState<Partial<Record<FilterId, string>>>({});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cache = useRef<RenderCache>({});

  const state = live ?? hist.present;
  const stateRef = useRef(state);
  stateRef.current = state;
  const liveRef = useRef(live);
  liveRef.current = live;
  const srcRef = useRef(src);
  srcRef.current = src;

  // ── load the picture
  useEffect(() => {
    let dead = false;
    let bitmap: ImageBitmap | null = null;
    setSrc(null);
    setError(null);
    loadSource(file).then(
      (s) => {
        if (dead) return void (s.image as ImageBitmap).close?.();
        bitmap = s.image as ImageBitmap;
        cache.current = {};
        setSrc(s);
      },
      (e: Error) => !dead && setError(e.message),
    );
    return () => {
      dead = true;
      bitmap?.close?.();
    };
  }, [file]);

  // ── filter thumbnails, made once from a small copy of the picture
  useEffect(() => {
    if (!src) return;
    const side = 112;
    const k = side / Math.min(src.width, src.height);
    const c = document.createElement("canvas");
    c.width = Math.round(src.width * k);
    c.height = Math.round(src.height * k);
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(src.image, 0, 0, c.width, c.height);
    const original = ctx.getImageData(0, 0, c.width, c.height);
    const out: Partial<Record<FilterId, string>> = {};
    for (const f of FILTERS) {
      const copy = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
      applyAdjust(copy, NEUTRAL, f.id, 100);
      ctx.putImageData(copy, 0, 0);
      out[f.id] = c.toDataURL("image/jpeg", 0.7);
    }
    setThumbs(out);
  }, [src]);

  const base = useMemo(() => (src ? baseSize(src, state) : { w: 0, h: 0 }), [src, state]);
  const ps = src ? Math.min(1, previewMax / Math.max(base.w, base.h)) : 1;
  const cropping = tool === "crop";
  const showCrop = !cropping && !!state.crop;
  const origin = showCrop ? { x: state.crop!.x, y: state.crop!.y } : { x: 0, y: 0 };

  // ── draw the preview
  useEffect(() => {
    if (!src || !canvasRef.current) return;
    const raf = requestAnimationFrame(() => {
      const cv = canvasRef.current;
      if (!cv) return;
      const out = compose(src, state, { scale: ps, crop: showCrop, liveStroke }, cache.current);
      if (cv.width !== out.width || cv.height !== out.height) {
        cv.width = out.width;
        cv.height = out.height;
      }
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(out, 0, 0);
      setDisplay((d) => (d.w === out.width && d.h === out.height ? d : { w: out.width, h: out.height }));
    });
    return () => cancelAnimationFrame(raf);
  }, [src, state, ps, showCrop, liveStroke]);

  // ── editing
  /** Apply a change. `live` shows it without recording history (slider or handle being dragged). */
  const edit = useCallback((fn: (s: EditState) => EditState, opts?: { live?: boolean }) => {
    const next = fn(stateRef.current);
    if (opts?.live) {
      liveRef.current = next;
      setLive(next);
    } else {
      liveRef.current = null;
      setLive(null);
      setHist((h) => commit(h, next));
    }
  }, []);

  /** End a drag: the live state becomes one history entry. */
  const endLive = useCallback(() => {
    const cur = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (cur) setHist((h) => commit(h, cur));
  }, []);

  const setTool = useCallback((t: ToolId) => {
    setToolState(t);
    setSelectedText(null);
    setEditingText(null);
  }, []);

  const setAdjust = useCallback((key: keyof Adjust, value: number, liveDrag = true) => edit((s) => ({ ...s, adjust: { ...s.adjust, [key]: value } }), { live: liveDrag }), [edit]);
  const setFilter = useCallback((filter: FilterId) => edit((s) => ({ ...s, filter, filterAmount: filter === "none" ? 100 : s.filterAmount })), [edit]);
  const setFilterAmount = useCallback((filterAmount: number, liveDrag = true) => edit((s) => ({ ...s, filterAmount }), { live: liveDrag }), [edit]);

  const setStraighten = useCallback((deg: number, liveDrag = true) => {
    const source = srcRef.current;
    if (!source) return;
    edit((s) => {
      const next = { ...s, straighten: Math.round(deg * 10) / 10 };
      return { ...next, crop: autoCrop(source, next) };
    }, { live: liveDrag });
  }, [edit]);

  const rotate = useCallback((dir: 1 | -1) => {
    const source = srcRef.current;
    if (!source) return;
    edit((s) => {
      const b = baseSize(source, s);
      const ann = rotateAnnotations(s.strokes, s.texts, b.w, b.h, dir);
      const rotation = ((s.rotation + (dir === 1 ? 90 : 270)) % 360) as EditState["rotation"];
      // the squish is across and down the screen, so a quarter turn swaps it
      const next: EditState = { ...s, rotation, ...ann, crop: null, stretch: { x: s.stretch.y, y: s.stretch.x } };
      if (s.straighten !== 0) return { ...next, crop: autoCrop(source, next) };
      if (s.crop) {
        const c = s.crop;
        next.crop = dir === 1 ? { x: b.h - (c.y + c.h), y: c.x, w: c.h, h: c.w } : { x: c.y, y: b.w - (c.x + c.w), w: c.h, h: c.w };
      }
      return next;
    });
  }, [edit]);

  const flip = useCallback((axis: "h" | "v") => {
    const source = srcRef.current;
    if (!source) return;
    edit((s) => {
      const b = baseSize(source, s);
      const ann = flipAnnotations(s.strokes, s.texts, b.w, b.h, s.rotation + s.straighten, axis, s.stretch);
      const next: EditState = { ...s, flipH: axis === "h" ? !s.flipH : s.flipH, flipV: axis === "v" ? !s.flipV : s.flipV, ...ann };
      if (s.straighten === 0 && s.crop) {
        const c = s.crop;
        // mirroring is about the picture's own axis, which after a quarter turn is the other screen axis
        const screenAxis = s.rotation === 90 || s.rotation === 270 ? (axis === "h" ? "v" : "h") : axis;
        next.crop = screenAxis === "h" ? { ...c, x: b.w - (c.x + c.w) } : { ...c, y: b.h - (c.y + c.h) };
      } else if (s.straighten !== 0) next.crop = autoCrop(source, next);
      return next;
    });
  }, [edit]);

  const setCrop = useCallback((crop: Rect | null, liveDrag = true) => edit((s) => ({ ...s, crop }), { live: liveDrag }), [edit]);

  const setAspect = useCallback((id: string) => {
    const source = srcRef.current;
    if (!source) return;
    setAspectId(id);
    const a = ASPECTS.find((x) => x.id === id);
    if (!a || a.ratio === null) return;
    const s = stateRef.current;
    const b = baseSize(source, s);
    const ratio = a.ratio === -1 ? b.w / b.h : a.ratio;
    const area = s.crop ?? { x: 0, y: 0, w: b.w, h: b.h };
    const r = rectForAspect({ w: area.w, h: area.h }, ratio);
    setCrop({ x: area.x + r.x, y: area.y + r.y, w: r.w, h: r.h }, false);
  }, [setCrop]);

  // strokes. The stroke being drawn is mirrored in a ref so ending it can add it to the picture without doing that inside a state updater (React may run those twice).
  const strokeRef = useRef<Stroke | null>(null);
  const beginStroke = useCallback((p: [number, number]) => {
    const s = srcRef.current;
    const b = s ? baseSize(s, stateRef.current) : { w: 1000, h: 1000 };
    const size = Math.max(2, draw.size * Math.max(b.w, b.h) * (draw.kind === "marker" ? 2.6 : 1));
    const st: Stroke = { id: newId(), kind: draw.kind, color: draw.color, size, points: [p] };
    strokeRef.current = st;
    setLiveStroke(st);
  }, [draw]);
  const extendStroke = useCallback((p: [number, number]) => {
    const st = strokeRef.current;
    if (!st) return;
    const next = { ...st, points: [...st.points, p] };
    strokeRef.current = next;
    setLiveStroke(next);
  }, []);
  const cancelStroke = useCallback(() => {
    strokeRef.current = null;
    setLiveStroke(null);
  }, []);
  const endStroke = useCallback(() => {
    const st = strokeRef.current;
    strokeRef.current = null;
    setLiveStroke(null);
    if (st) edit((s) => ({ ...s, strokes: [...s.strokes, st] }));
  }, [edit]);

  // text
  const addText = useCallback(() => {
    const source = srcRef.current;
    if (!source) return;
    const s = stateRef.current;
    const b = baseSize(source, s);
    const area = s.crop ?? { x: 0, y: 0, w: b.w, h: b.h };
    const size = Math.round(Math.max(18, Math.min(area.h, area.w) * 0.08));
    const item = newText({ id: newId(), x: area.x + area.w / 2, y: area.y + area.h / 2, size });
    edit((st) => ({ ...st, texts: [...st.texts, item] }));
    setSelectedText(item.id);
    setEditingText(item.id);
    setToolState("text");
  }, [edit]);
  const updateText = useCallback((id: string, patch: Partial<TextItem>, liveDrag = false) => edit((s) => ({ ...s, texts: s.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }), { live: liveDrag }), [edit]);
  const deleteText = useCallback((id: string) => {
    edit((s) => ({ ...s, texts: s.texts.filter((t) => t.id !== id) }));
    setSelectedText(null);
  }, [edit]);
  const duplicateText = useCallback((id: string) => {
    const copy = stateRef.current.texts.find((t) => t.id === id);
    if (!copy) return;
    const item = { ...copy, id: newId(), x: copy.x + copy.size * 0.6, y: copy.y + copy.size * 0.6 };
    edit((s) => ({ ...s, texts: [...s.texts, item] }));
    setSelectedText(item.id);
  }, [edit]);
  /** Move a text one step in the stack, or to the very front or back. */
  const orderText = useCallback((id: string, to: "forward" | "back" | "front" | "backmost") => edit((s) => {
    const i = s.texts.findIndex((t) => t.id === id);
    if (i < 0) return s;
    const j = to === "forward" ? i + 1 : to === "back" ? i - 1 : to === "front" ? s.texts.length - 1 : 0;
    if (j < 0 || j >= s.texts.length || j === i) return s;
    const texts = [...s.texts];
    const [t] = texts.splice(i, 1);
    texts.splice(j, 0, t);
    return { ...s, texts };
  }), [edit]);

  /** Make the picture w x h pixels (after any crop), squishing or stretching it. Drawings and text come along. */
  const resizeTo = useCallback((w: number, h: number, liveDrag = false) => {
    const source = srcRef.current;
    if (!source) return;
    edit((s) => {
      const o = outputSize(source, s);
      return resizeState(s, clampSide(w) / o.w, clampSide(h) / o.h);
    }, { live: liveDrag });
  }, [edit]);

  // history
  const undo = useCallback(() => { liveRef.current = null; setLive(null); setHist(undoH); }, []);
  const redo = useCallback(() => { liveRef.current = null; setLive(null); setHist(redoH); }, []);
  const resetAll = useCallback(() => { setAspectId("free"); setSelectedText(null); setEditingText(null); setHist(resetH); }, []);

  const exportAs = useCallback((o: ExportOptions) => {
    const source = srcRef.current;
    if (!source) return Promise.reject(new Error("Nothing loaded."));
    return exportImage(source, stateRef.current, o);
  }, []);
  const sampleAs = useCallback((o: ExportOptions) => {
    const source = srcRef.current;
    if (!source) return Promise.reject(new Error("Nothing loaded."));
    return sampleExport(source, stateRef.current, o);
  }, []);
  const viewApi = useRef<ViewApi | null>(null);

  const out = src ? outputSize(src, state) : { w: 0, h: 0 };

  return {
    src, error, loading: !src && !error, state, base, previewScale: ps, origin, display, cropping, showCrop, thumbs, canvasRef,
    tool, setTool, draw, setDraw, aspectId, setAspect, selectedText, setSelectedText, editingText, setEditingText, liveStroke,
    edit, endLive, setAdjust, setFilter, setFilterAmount, setStraighten, rotate, flip, setCrop,
    beginStroke, extendStroke, endStroke, cancelStroke, addText, updateText, deleteText, duplicateText, orderText, resizeTo, viewApi,
    undo, redo, resetAll, canUndo: canUndo(hist), canRedo: canRedo(hist), dirty: hist.past.length > 0 || !!live,
    outputSize: out, exportAs, sampleAs, work: base,
  };
}

export type ImageEditor = ReturnType<typeof useImageEditor>;
