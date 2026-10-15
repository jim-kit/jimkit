import { run } from "@jimkit/sdk/server";
import type { Engine } from "./types";

const READER: Record<string, string> = { md: "markdown", html: "html", docx: "docx", odt: "odt", epub: "epub", rst: "rst", tex: "latex", txt: "markdown" };
const WRITER: Record<string, string> = { md: "gfm", html: "html5", odt: "odt", rst: "rst", tex: "latex", txt: "plain" };

// --sandbox stops pandoc reading any file the command line doesn't name, which is what keeps a crafted document from
// pulling server files into the output (an image link to /proc/1/environ, LaTeX \input). The price is that pandoc can't
// fetch its own built-in templates, so they are generated once at image build time and passed in explicitly.
const ASSETS = process.env.PANDOC_ASSETS ?? "/opt/pandoc";
const TEMPLATE: Record<string, string[]> = {
  odt: [`--reference-doc=${ASSETS}/reference.odt`],
  html: ["-s", `--template=${ASSETS}/default.html5`, "--metadata", "title=Document"],
  tex: ["-s", `--template=${ASSETS}/default.latex`, "--metadata", "title=Document"],
};

export const pandoc: Engine = async (ctx) => {
  const r = READER[ctx.inputExt];
  const w = WRITER[ctx.to];
  if (!r || !w) throw new Error("unsupported document type");
  const args = ["--sandbox", "-f", r, "-t", w, ...(TEMPLATE[ctx.to] ?? []), "-o", ctx.output, ctx.input];
  await run("pandoc", args, { cwd: ctx.outDir, timeoutMs: ctx.timeoutMs, signal: ctx.signal });
  return [ctx.output];
};
