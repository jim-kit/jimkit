import { readFile, stat, writeFile } from "node:fs/promises";
import Papa from "papaparse";
import YAML from "yaml";
import { MAX_DATA_BYTES } from "../config";
import type { Engine } from "./types";

type Rows = Record<string, unknown>[];

/**
 * `typed`: turn "1.50" into 1.5 and "true" into true. Wanted when the result is JSON or YAML, where a number is a number; not when the
 * result is another CSV or TSV, which must give back exactly the text it was given (a zip code "00123" stays "00123").
 */
export function parse(text: string, ext: string, typed: boolean): unknown {
  if (ext === "csv" || ext === "tsv") {
    const r = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: "greedy", dynamicTyping: typed, delimiter: ext === "tsv" ? "\t" : "" });
    if (r.errors.length && !r.data.length) throw new Error(`Couldn't read this ${ext.toUpperCase()}: ${r.errors[0].message}`);
    return r.data;
  }
  if (ext === "json") return JSON.parse(text);
  return YAML.parse(text);
}

function toRows(data: unknown): Rows {
  if (Array.isArray(data) && data.every((x) => x && typeof x === "object" && !Array.isArray(x))) return data as Rows;
  throw new Error("Tables need a list of objects, like [{\"name\": \"a\"}, {\"name\": \"b\"}].");
}

export function write(data: unknown, to: string): string {
  if (to === "json") return JSON.stringify(data, null, 2) + "\n";
  if (to === "yaml") return YAML.stringify(data);
  const rows = toRows(data);
  const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return Papa.unparse({ fields, data: rows.map((r) => fields.map((f) => (r[f] === undefined ? "" : typeof r[f] === "object" ? JSON.stringify(r[f]) : r[f]))) }, { delimiter: to === "tsv" ? "\t" : ",", newline: "\n" }) + "\n";
}

export const data: Engine = async (ctx) => {
  if ((await stat(ctx.input)).size > MAX_DATA_BYTES) throw new Error("This file is too large for a data conversion (16 MB max).");
  const text = await readFile(ctx.input, "utf8");
  await writeFile(ctx.output, write(parse(text, ctx.inputExt, ctx.to === "json" || ctx.to === "yaml"), ctx.to));
  return [ctx.output];
};
