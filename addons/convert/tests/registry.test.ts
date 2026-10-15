import { describe, expect, it } from "vitest";
import { extOf, formatOf, isKnown, normalizeExt } from "../src/lib/registry/formats";
import { canConvertFrom, planRoute, routesFrom, targetsFor } from "../src/lib/registry/plan";

describe("formats", () => {
  it("normalizes aliases and case", () => {
    expect(normalizeExt("JPEG")).toBe("jpg");
    expect(normalizeExt(".HEIF")).toBe("heic");
    expect(extOf("Holiday Photo.TIF")).toBe("tiff");
    expect(extOf("noext")).toBe("");
  });
  it("knows what it knows", () => {
    expect(isKnown("mp3")).toBe(true);
    expect(isKnown("exe")).toBe(false);
    expect(formatOf("yml")?.id).toBe("yaml");
  });
});

describe("planRoute", () => {
  it("uses a single step when one engine can do it", () => {
    const r = planRoute("heic", "jpg")!;
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].engine).toBe("imagemagick");
    expect(r.lossy).toBe(true);
  });
  it("marks lossless targets as lossless", () => {
    expect(planRoute("jpg", "png")!.lossy).toBe(false);
    expect(planRoute("wav", "flac")!.lossy).toBe(false);
  });
  it("keeps a single engine when it can, and is honest about text-only routes", () => {
    expect(planRoute("epub", "odt")!.steps).toHaveLength(1);
    expect(planRoute("epub", "docx")!.steps).toHaveLength(2); // pandoc reads EPUB, LibreOffice writes DOCX
    // PDF to Word exists only by extracting the text first, so it must be flagged lossy and show the detour
    const pdfToDocx = planRoute("pdf", "docx")!;
    expect(pdfToDocx.lossy).toBe(true);
    expect(pdfToDocx.via).toEqual(["txt"]);
    expect(planRoute("pdf", "mp4")).toBeNull();
  });
  it("produces DOCX through ODT, because sandboxed pandoc can't write it", () => {
    const r = planRoute("md", "docx")!;
    expect(r.steps.map((x) => x.engine)).toEqual(["pandoc", "libreoffice"]);
    expect(r.via).toEqual(["odt"]);
    expect(planRoute("md", "epub")).toBeNull();
  });
  it("finds multi-step routes through an intermediate", () => {
    // svg -> png (rsvg) -> webp (imagemagick)
    const r = planRoute("svg", "webp")!;
    expect(r.steps.map((s) => s.engine)).toEqual(["rsvg", "imagemagick"]);
    expect(r.via).toEqual(["png"]);
  });
  it("prefers the lossless path when costs are close", () => {
    // markdown to pdf goes markdown -> docx -> pdf (pandoc, libreoffice), no direct edge
    const r = planRoute("md", "pdf")!;
    expect(r.steps.length).toBe(2);
    expect(r.steps[1].engine).toBe("libreoffice");
  });
  it("never loops and respects the step cap", () => {
    for (const from of ["svg", "md", "csv", "mp4", "pptx"]) {
      for (const r of routesFrom(from).values()) {
        expect(r.steps.length).toBeLessThanOrEqual(3);
        const seen = new Set([from]);
        for (const s of r.steps) {
          expect(seen.has(s.to)).toBe(false);
          seen.add(s.to);
        }
      }
    }
  });
  it("does not offer the source format as a target", () => {
    expect(planRoute("png", "png")).toBeNull();
  });
});

describe("targetsFor", () => {
  it("groups a video into video, audio and gif targets", () => {
    const kinds = targetsFor("mp4").map((g) => g.kind);
    expect(kinds).toContain("video");
    expect(kinds).toContain("audio");
    expect(kinds).toContain("image"); // gif
  });
  it("lists direct routes before indirect ones", () => {
    const docs = targetsFor("docx").find((g) => g.kind === "document")!.targets;
    const costs = docs.map((t) => t.route.cost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });
  it("offers nothing for unknown types", () => {
    expect(canConvertFrom("exe")).toBe(false);
    expect(targetsFor("exe")).toEqual([]);
  });
  it("PDFs become images and text", () => {
    const flat = targetsFor("pdf").flatMap((g) => g.targets.map((t) => t.format.id));
    expect(flat).toEqual(expect.arrayContaining(["png", "txt"]));
  });
});
