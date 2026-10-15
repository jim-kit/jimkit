import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { afterAll, describe, expect, it } from "vitest";
import { Unsafe, refuseWebAccess } from "../src/server/engines/officeSafety";
import { dpiFor, largestPage } from "../src/server/engines/poppler";
import { svgSize, zoomFor } from "../src/server/engines/rsvg";
import { videoArgs, gifArgs } from "../src/server/engines/ffmpeg";
import { parse, write } from "../src/server/engines/data";
import { safeBase } from "../../../packages/sdk/src/server";

const dir = mkdtempSync(join(tmpdir(), "jk-convert-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function zip(name: string, files: Record<string, string>, store = false) {
  const out = join(dir, name);
  const a = archiver("zip", { store });
  const done = pipeline(a, createWriteStream(out));
  for (const [n, text] of Object.entries(files)) a.append(text, { name: n });
  await a.finalize();
  await done;
  return out;
}

describe("spreadsheets that call WEBSERVICE are refused before LibreOffice sees them", () => {
  const sheet = (formula: string) => `<?xml version="1.0"?><worksheet><sheetData><row><c><f>${formula}</f></c></row></sheetData></worksheet>`;
  it("refuses an xlsx with the function in a sheet, compressed or stored, in any case", async () => {
    for (const store of [false, true]) {
      const f = await zip(`a-${store}.xlsx`, { "[Content_Types].xml": "<Types/>", "xl/worksheets/sheet1.xml": sheet('WEBSERVICE("file:///etc/passwd")') }, store);
      await expect(refuseWebAccess(f, "xlsx"), String(store)).rejects.toBeInstanceOf(Unsafe);
    }
    const lower = await zip("b.xlsx", { "xl/worksheets/sheet1.xml": sheet('_xlfn.webservice("http://169.254.169.254/")') });
    await expect(refuseWebAccess(lower, "xlsx")).rejects.toThrow(/WEBSERVICE/);
  });
  it("refuses an ods (content.xml) and a flat ods", async () => {
    const ods = await zip("c.ods", { mimetype: "application/vnd.oasis.opendocument.spreadsheet", "content.xml": '<office:document-content><table:table-cell table:formula="of:=WEBSERVICE(&quot;http://x&quot;)"/></office:document-content>' });
    await expect(refuseWebAccess(ods, "ods")).rejects.toBeInstanceOf(Unsafe);
    const fods = join(dir, "d.fods"); writeFileSync(fods, '<office:document><table:table-cell table:formula="of:=WEBSERVICE(&quot;http://x&quot;)"/></office:document>');
    await expect(refuseWebAccess(fods, "fods")).rejects.toBeInstanceOf(Unsafe);
  });
  it("refuses an old binary xls that has the name, as 8-bit or as 16-bit text", async () => {
    const head = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const a = join(dir, "e.xls"); writeFileSync(a, Buffer.concat([head, Buffer.alloc(100), Buffer.from("_xlfn.WEBSERVICE"), Buffer.alloc(50)]));
    const b = join(dir, "f.xls"); writeFileSync(b, Buffer.concat([head, Buffer.alloc(100), Buffer.from("WEBSERVICE", "utf16le"), Buffer.alloc(50)]));
    await expect(refuseWebAccess(a, "xls")).rejects.toBeInstanceOf(Unsafe);
    await expect(refuseWebAccess(b, "xls")).rejects.toBeInstanceOf(Unsafe);
  });
  it("lets an ordinary spreadsheet through, and leaves other documents alone", async () => {
    const ok = await zip("g.xlsx", { "xl/worksheets/sheet1.xml": sheet("SUM(A1:A3)"), "xl/media/image1.png": "WEBSERVICE inside a picture is not a formula" });
    await expect(refuseWebAccess(ok, "xlsx")).resolves.toBeUndefined();
    const doc = join(dir, "h.docx"); writeFileSync(doc, "WEBSERVICE in a word processor document");
    await expect(refuseWebAccess(doc, "docx")).resolves.toBeUndefined();
  });
});

describe("a PDF page's size sets the resolution", () => {
  const info = "Pages:          2\nPage    1 size: 595.276 x 841.89 pts (A4)\nPage    2 size: 14400 x 14400 pts\n";
  it("reads the largest side of any page", () => {
    expect(largestPage(info)).toBe(14400);
    expect(largestPage("nothing useful")).toBe(0);
  });
  it("keeps 150 dpi for an ordinary page and lowers it for a huge one", () => {
    expect(dpiFor(842)).toBe(150);
    expect(dpiFor(14400)).toBe(35); // 7000 px across 200 inches
    expect(dpiFor(0)).toBe(100);
  });
});

describe("an SVG's size sets the zoom", () => {
  it("reads width and height, with units, or the viewBox", () => {
    expect(svgSize('<svg xmlns="x" width="16000" height="8000"></svg>')).toEqual({ w: 16000, h: 8000 });
    expect(svgSize('<svg width="10in" height="5in" />')).toEqual({ w: 960, h: 480 });
    expect(svgSize('<svg viewBox="0 0 24 24"></svg>')).toEqual({ w: 24, h: 24 });
    expect(svgSize('<svg width="100%" viewBox="0 0 30 20"/>')).toEqual({ w: 30, h: 20 });
    expect(svgSize("not an svg")).toBeNull();
  });
  it("zooms 2x, less for a big picture, and says nothing when it can't tell", () => {
    expect(zoomFor({ w: 24, h: 24 })).toBe(2);
    expect(zoomFor({ w: 16000, h: 8000 })).toBeCloseTo(7000 / 16000, 5);
    expect(zoomFor(null)).toBeNull();
  });
});

describe("video sizes", () => {
  const vf = (a: string[]) => a[a.indexOf("-vf") + 1];
  it("make both sides even for x264 and limit the longest side", () => {
    expect(vf(videoArgs("mp4", { level: "balanced", maxDim: 0 }))).toBe("scale=trunc(iw/2)*2:trunc(ih/2)*2");
    const limited = vf(videoArgs("mkv", { level: "balanced", maxDim: 640 }));
    expect(limited).toContain("if(gt(iw,ih),min(640,iw),-2)");
    expect(limited).toContain("if(gt(iw,ih),-2,min(640,ih))");
    expect(limited.endsWith("scale=trunc(iw/2)*2:trunc(ih/2)*2")).toBe(true);
  });
  it("leave a size alone when nothing asks, and for codecs that don't need even sides", () => {
    expect(videoArgs("webm", { level: "balanced", maxDim: 0 })).not.toContain("-vf");
    expect(vf(videoArgs("avi", { level: "low", maxDim: 480 }))).not.toContain("trunc");
  });
  it("limit the longest side of a GIF", () => {
    expect(vf(gifArgs({ level: "balanced", maxDim: 0 }))).toContain("min(480,iw)");
  });
});

describe("data conversions", () => {
  const csv = "zip,qty,flag\n00123,1.50,TRUE\n";
  it("give a CSV back as it was when the result is CSV or TSV", () => {
    expect(write(parse(csv, "csv", false), "tsv")).toBe("zip\tqty\tflag\n00123\t1.50\tTRUE\n");
    expect(write(parse(csv, "csv", false), "csv")).toBe(csv);
  });
  it("turns values into numbers and booleans for JSON and YAML", () => {
    expect(JSON.parse(write(parse(csv, "csv", true), "json"))).toEqual([{ zip: 123, qty: 1.5, flag: true }]);
  });
});

describe("download names", () => {
  it("are cut by characters, so an emoji is not split in half", () => {
    const name = "a".repeat(119) + "😀.png";
    const base = safeBase(name);
    expect(Array.from(base)).toHaveLength(120);
    expect(() => encodeURIComponent(base)).not.toThrow();
    expect(() => encodeURIComponent(safeBase("x\ud83d.png"))).not.toThrow();
  });
});
