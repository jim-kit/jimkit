import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { matchPattern, safeBase, throttle } from "../src/server";

describe("safeBase", () => {
  it("strips paths, odd characters and the extension", () => {
    expect(safeBase("../../etc/passwd.png")).toBe("_.._etc_passwd");
    expect(safeBase("Holiday: Photo?.HEIC")).toBe("Holiday_ Photo_");
    expect(safeBase(".hidden")).toBe("file"); // a bare dotfile has no name part
    expect(safeBase("")).toBe("file");
  });
  it("bounds the length", () => {
    expect(safeBase("a".repeat(500) + ".txt").length).toBe(120);
  });
});

describe("throttle", () => {
  it("does nothing for an unlimited tier", () => {
    expect(throttle(null)).toBeNull();
  });
  it("slows a stream to roughly the requested rate after the burst", async () => {
    const t = throttle(2)!; // 250 KB/s, one second of burst
    const chunk = Buffer.alloc(125_000);
    const t0 = Date.now();
    let got = 0;
    await new Promise<void>((resolve) => {
      Readable.from([chunk, chunk, chunk, chunk]).pipe(t).on("data", (d: Buffer) => (got += d.length)).on("end", () => resolve());
    });
    const secs = (Date.now() - t0) / 1000;
    expect(got).toBe(500_000);
    expect(secs).toBeGreaterThan(0.7); // 500 KB at 250 KB/s with a 250 KB burst is about a second
    expect(secs).toBeLessThan(2.5);
  });
});

describe("matchPattern", () => {
  it("captures :params, decodes them, and refuses a malformed escape", () => {
    expect(matchPattern("jobs/:id/download", "jobs/abc/download")).toEqual({ id: "abc" });
    expect(matchPattern("jobs/:id", "jobs/a%20b")).toEqual({ id: "a b" });
    expect(matchPattern("jobs/:id", "jobs/%E0%A4%A")).toBeNull();
  });
});
