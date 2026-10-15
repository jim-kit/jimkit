import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEXT_EXT, isTextFile } from "../src/lib/transforms";

// the chooser ("What should happen to this?") offers the editor for the extensions in package.json; the editor must accept every one of them
describe("the text editor's file types", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")).jimkit;
  const exts: string[] = manifest.fileActions.find((a: { id: string }) => a.id === "open-text").accept.ext;

  it("accepts every extension the chooser offers it for", () => {
    expect(exts.filter((e) => !TEXT_EXT.has(e))).toEqual([]);
  });
  it("recognises them by name even when the file has no type", () => {
    for (const e of ["rst", "adoc", "org", "kt", "dockerfile"]) expect(isTextFile(`notes.${e}`), e).toBe(true);
  });
  it("still refuses binaries", () => {
    expect(isTextFile("photo.png", "image/png")).toBe(false);
    expect(isTextFile("movie.mp4", "video/mp4")).toBe(false);
  });
});
