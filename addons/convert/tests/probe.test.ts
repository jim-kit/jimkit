import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findBinary, probeEngines } from "../src/server/probe";
import { canConvertFrom, planRoute, setAvailableEngines, targetsFor } from "../src/lib/registry/plan";

let dir = "";
const fake = (...names: string[]) => {
  dir = mkdtempSync(join(tmpdir(), "jk-bin-"));
  for (const n of names) { writeFileSync(join(dir, n), "#!/bin/sh\n"); chmodSync(join(dir, n), 0o755); }
  return dir;
};
afterEach(() => { setAvailableEngines(null); if (dir) rmSync(dir, { recursive: true, force: true }); dir = ""; });

describe("engine probing", () => {
  it("finds executables on a PATH and ignores non-executables", () => {
    const d = fake("ffmpeg");
    writeFileSync(join(d, "pandoc"), "not executable");
    expect(findBinary("ffmpeg", d)).toBe(join(d, "ffmpeg"));
    expect(findBinary("pandoc", d)).toBeNull();
    expect(findBinary("nothing", d)).toBeNull();
  });
  it("an empty machine still has the in-process data engine, and says which packages are missing", () => {
    const p = probeEngines(fake());
    expect(p.engines).toEqual(["data"]);
    expect(p.missing.map((m) => m.package)).toContain("ffmpeg");
    expect(p.missing.map((m) => m.package)).toContain("poppler-utils");
  });
  it("either ImageMagick spelling counts", () => {
    expect(probeEngines(fake("magick")).engines).toContain("imagemagick");
  });
});

describe("routes only use engines that exist", () => {
  it("with everything available a PNG can become many things", () => {
    expect(canConvertFrom("png")).toBe(true);
    expect(targetsFor("png").length).toBeGreaterThan(0);
  });
  it("on a machine with only the data engine, images can't be converted but CSV can", () => {
    setAvailableEngines(["data"]);
    expect(canConvertFrom("png")).toBe(false);
    expect(planRoute("png", "webp")).toBeNull();
    expect(planRoute("csv", "json")).not.toBeNull();
    expect(canConvertFrom("mp4")).toBe(false);
  });
  it("a route that needs a missing engine in the middle is dropped, one that doesn't is kept", () => {
    // svg -> webp is rsvg (svg -> png) then imagemagick (png -> webp)
    setAvailableEngines(["rsvg", "imagemagick"]);
    expect(planRoute("svg", "webp")?.steps.length).toBe(2);
    setAvailableEngines(["rsvg"]);
    expect(planRoute("svg", "webp")).toBeNull();
    expect(planRoute("svg", "png")).not.toBeNull();
  });
  it("null puts everything back", () => {
    setAvailableEngines(["data"]);
    setAvailableEngines(null);
    expect(canConvertFrom("png")).toBe(true);
  });
});
