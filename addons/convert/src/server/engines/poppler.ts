import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { MAX_PDF_PAGES, MAX_RENDER_SIDE } from "../config";
import { run } from "@jimkit/sdk/server";
import type { Engine } from "./types";

/** The longest side, in points (1/72 inch), of any page pdfinfo lists: "Page    1 size: 595.276 x 841.89 pts (A4)". */
export function largestPage(pdfinfo: string): number {
  let side = 0;
  for (const m of pdfinfo.matchAll(/^Page\s+\d+\s+size:\s*([\d.]+)\s*x\s*([\d.]+)\s*pts/gim)) side = Math.max(side, Number(m[1]), Number(m[2]));
  return side;
}

/** 150 dpi, unless a page is so big that it would take more than MAX_RENDER_SIDE pixels along one side. */
export const dpiFor = (longestPoints: number, wanted = 150) => (longestPoints > 0 ? Math.max(10, Math.min(wanted, Math.floor((MAX_RENDER_SIDE * 72) / longestPoints))) : 100);

export const popplerPng: Engine = async (ctx) => {
  const pages = join(ctx.outDir, "pages");
  await mkdir(pages, { recursive: true });
  let info = "";
  // a tiny PDF can declare a page the size of a house: look before rendering (an unreadable answer renders at a modest 100 dpi)
  await run("pdfinfo", ["-f", "1", "-l", String(MAX_PDF_PAGES), ctx.input], { cwd: ctx.outDir, timeoutMs: Math.min(ctx.timeoutMs, 60_000), signal: ctx.signal, onStdout: (c) => (info += c) }).catch(() => {});
  await run("pdftoppm", ["-png", "-r", String(dpiFor(largestPage(info))), "-l", String(MAX_PDF_PAGES), ctx.input, join(pages, "page")], {
    cwd: ctx.outDir, timeoutMs: ctx.timeoutMs, signal: ctx.signal,
  });
  const files = (await readdir(pages)).filter((n) => n.endsWith(".png")).sort();
  if (!files.length) throw new Error("no pages rendered");
  return files.map((n) => join(pages, n));
};

export const popplerText: Engine = async (ctx) => {
  await run("pdftotext", ["-layout", "-enc", "UTF-8", ctx.input, ctx.output], { cwd: ctx.outDir, timeoutMs: ctx.timeoutMs, signal: ctx.signal });
  return [ctx.output];
};
