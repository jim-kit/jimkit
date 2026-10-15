import { open } from "node:fs/promises";
import { MAX_RENDER_SIDE } from "../config";
import { run } from "@jimkit/sdk/server";
import type { Engine } from "./types";

const UNIT: Record<string, number> = { "": 1, px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };

/** The declared size of an SVG in pixels, from the start of the file: width and height, else the viewBox. Null when it says nothing. */
export function svgSize(head: string): { w: number; h: number } | null {
  const tag = /<svg\b[^>]*>/i.exec(head)?.[0];
  if (!tag) return null;
  const len = (name: string) => {
    const m = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)\\s*([a-z%]*)\\s*["']`, "i").exec(tag);
    return m && m[2] !== "%" && UNIT[m[2].toLowerCase()] !== undefined ? Number(m[1]) * UNIT[m[2].toLowerCase()] : null;
  };
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  const w = len("width") ?? (vb ? Number(vb[1]) : null), h = len("height") ?? (vb ? Number(vb[2]) : null);
  return w && h && Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null;
}

/** 2x for sharpness, less when the picture is already large: never more than MAX_RENDER_SIDE pixels on the longest side. */
export const zoomFor = (size: { w: number; h: number } | null) => (size ? Math.max(0.01, Math.min(2, MAX_RENDER_SIDE / Math.max(size.w, size.h))) : null);

export const rsvg: Engine = async (ctx) => {
  const args = ["--format", ctx.to === "pdf" ? "pdf" : "png", "--output", ctx.output];
  if (ctx.quality.maxDim > 0) {
    // fit inside a square of that side, keeping the proportions (the longest side is the one that is limited)
    const side = Math.min(ctx.quality.maxDim, MAX_RENDER_SIDE);
    args.push("--width", String(side), "--height", String(side), "--keep-aspect-ratio");
  } else if (ctx.to === "png") {
    const f = await open(ctx.input, "r");
    const head = await f.read({ buffer: Buffer.alloc(16 * 1024), position: 0 }).then((r) => r.buffer.subarray(0, r.bytesRead).toString("utf8")).finally(() => f.close());
    const zoom = zoomFor(svgSize(head));
    // a size we can't read is drawn inside a box rather than at whatever it claims
    if (zoom === null) args.push("--width", "2048", "--height", "2048", "--keep-aspect-ratio");
    else args.push("--zoom", String(zoom));
  }
  args.push(ctx.input);
  await run("rsvg-convert", args, { cwd: ctx.outDir, timeoutMs: ctx.timeoutMs, signal: ctx.signal });
  return [ctx.output];
};
