import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { data } from "../src/server/engines/data";

const dir = mkdtempSync(join(tmpdir(), "jimkit-data-"));
let n = 0;
async function conv(input: string, inputExt: string, to: string) {
  const src = join(dir, `in-${n}.${inputExt}`);
  const out = join(dir, `out-${n++}.${to}`);
  writeFileSync(src, input);
  await data({ input: src, inputExt, to, output: out, outDir: dir, quality: { level: "balanced", maxDim: 0 }, timeoutMs: 5000, signal: new AbortController().signal, onProgress: () => {} });
  return readFileSync(out, "utf8");
}

describe("data engine", () => {
  it("csv to json keeps types", async () => {
    expect(JSON.parse(await conv("name,age\nAda,36\nLinus,54\n", "csv", "json"))).toEqual([{ name: "Ada", age: 36 }, { name: "Linus", age: 54 }]);
  });
  it("json to csv takes the union of keys", async () => {
    const csv = await conv('[{"a":1},{"b":2}]', "json", "csv");
    expect(csv.split("\n")[0]).toBe("a,b");
  });
  it("yaml to tsv to csv round trips", async () => {
    const tsv = await conv("- x: 1\n  y: two\n", "yaml", "tsv");
    expect(tsv).toContain("x\ty");
    expect(await conv(tsv, "tsv", "csv")).toContain("x,y");
  });
  it("refuses data that isn't a table, with a helpful message", async () => {
    await expect(conv('{"a": 1}', "json", "csv")).rejects.toThrow(/list of objects/);
  });
});
