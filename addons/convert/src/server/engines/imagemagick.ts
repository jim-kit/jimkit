import { run } from "@jimkit/sdk/server";
import { findBinary } from "../probe";
import type { Engine } from "./types";

// Both the input and the output coder are named explicitly, so a file can't talk ImageMagick into another format.
const CODER: Record<string, string> = { jpg: "jpeg", png: "png", webp: "webp", avif: "avif", heic: "heic", gif: "gif", bmp: "bmp", tiff: "tiff", ico: "ico" };
const ANIMATED = new Set(["gif", "webp"]);
const NEEDS_FLAT = new Set(["jpg", "bmp"]);
const QUALITY: Record<string, Record<string, number>> = {
  jpg: { low: 60, balanced: 82, high: 94 },
  webp: { low: 55, balanced: 80, high: 93 },
  avif: { low: 40, balanced: 60, high: 80 },
  png: { low: 95, balanced: 95, high: 95 },
};

export const imagemagick: Engine = async (ctx) => {
  const inCoder = CODER[ctx.inputExt];
  const outCoder = CODER[ctx.to];
  if (!inCoder || !outCoder) throw new Error("unsupported image type");
  const keepFrames = ANIMATED.has(ctx.inputExt) && ANIMATED.has(ctx.to);
  const args = ["-limit", "memory", "1GiB", "-limit", "map", "2GiB", "-limit", "disk", "4GiB", "-limit", "thread", "2"];
  args.push(`${inCoder}:${ctx.input}${keepFrames ? "" : "[0]"}`, "-auto-orient");
  if (NEEDS_FLAT.has(ctx.to)) args.push("-background", "white", "-alpha", "remove", "-alpha", "off");
  if (ctx.quality.maxDim > 0) args.push("-resize", `${ctx.quality.maxDim}x${ctx.quality.maxDim}>`);
  const q = QUALITY[ctx.to]?.[ctx.quality.level];
  if (q) args.push("-quality", String(q));
  if (ctx.to === "ico") args.push("-resize", "256x256>", "-define", "icon:auto-resize=256,128,64,48,32,16");
  args.push(`${outCoder}:${ctx.output}`);
  // ImageMagick 6 has `convert`; 7 may have only `magick` (which takes the same arguments): use whichever the probe found
  await run(findBinary("convert") ? "convert" : "magick", args, { cwd: ctx.outDir, timeoutMs: ctx.timeoutMs, signal: ctx.signal });
  return [ctx.output];
};
