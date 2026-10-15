import { INITIAL, type EditState } from "./types";

export interface History {
  present: EditState;
  past: EditState[];
  future: EditState[];
}

const LIMIT = 60;

export const createHistory = (initial: EditState = INITIAL): History => ({ present: initial, past: [], future: [] });

/** Record a new state; a no-change commit is ignored so dragging a slider back to where it began adds nothing. */
export function commit(h: History, next: EditState): History {
  if (next === h.present) return h;
  return { present: next, past: [...h.past, h.present].slice(-LIMIT), future: [] };
}
export function undo(h: History): History {
  const prev = h.past[h.past.length - 1];
  return prev ? { present: prev, past: h.past.slice(0, -1), future: [h.present, ...h.future] } : h;
}
export function redo(h: History): History {
  const next = h.future[0];
  return next ? { present: next, past: [...h.past, h.present], future: h.future.slice(1) } : h;
}
export const canUndo = (h: History) => h.past.length > 0;
export const canRedo = (h: History) => h.future.length > 0;
export const reset = (h: History): History => commit(h, INITIAL);
