import { describe, expect, it } from "vitest";
import { normalizeLook } from "../src/core/config";
import { accentHex, accentVars, customAccent, isAccent } from "../src/ui/accent";

describe("accent", () => {
  it("takes presets and custom colours, nothing else", () => {
    expect(isAccent("teal")).toBe(true);
    expect(isAccent("hex-0d6efd")).toBe(true);
    for (const bad of ["hex-0d6ef", "hex-0D6EFD", "red", "#0d6efd", "", null, 5, "hex-0d6efd;x"]) expect(isAccent(bad)).toBe(false);
  });
  it("parses what a person types", () => {
    expect(customAccent("#0D6EFD")).toBe("hex-0d6efd");
    expect(customAccent(" 0d6efd ")).toBe("hex-0d6efd");
    expect(customAccent("#0d6ef")).toBeNull();
    expect(accentHex("hex-ff00aa")).toBe("#ff00aa");
    expect(accentHex("blue")).toBeNull();
  });
  it("picks readable text and the channels", () => {
    expect(accentVars("blue")).toEqual({});
    expect(accentVars("hex-ffffff")["--accent-fg"]).toBe("#111418");
    expect(accentVars("hex-0b2a6f")["--accent-fg"]).toBe("#ffffff");
    expect(accentVars("hex-ff0000")["--accent-rgb"]).toBe("255 0 0");
  });
});

describe("normalizeLook", () => {
  it("falls back per field", () => {
    expect(normalizeLook(undefined, undefined, undefined)).toEqual({ theme: "basic", mode: "dark", accent: "blue" });
    expect(normalizeLook("metro", "light", "hex-112233")).toEqual({ theme: "metro", mode: "light", accent: "hex-112233" });
    expect(normalizeLook("nope", "dusk", "mauve", { theme: "glass", mode: "light", accent: "pink" })).toEqual({ theme: "glass", mode: "light", accent: "pink" });
  });
  it("turns the old light theme into basic + light", () => {
    expect(normalizeLook("light", undefined, "teal")).toEqual({ theme: "basic", mode: "light", accent: "teal" });
  });

  it("takes the themes that exist from the caller: a kit's theme is fine when it is installed, and falls back when it is not", () => {
    const fb = { theme: "basic", mode: "dark", accent: "blue" };
    expect(normalizeLook("dusk", "dark", "blue", fb, ["basic", "dusk"]).theme).toBe("dusk");
    expect(normalizeLook("dusk", "dark", "blue", fb, ["basic"]).theme).toBe("basic");
    // the install's default is used when the visitor's choice is gone, and Basic when that is gone too
    expect(normalizeLook("dusk", "dark", "blue", { ...fb, theme: "paper" }, ["basic", "paper"]).theme).toBe("paper");
    expect(normalizeLook("dusk", "dark", "blue", { ...fb, theme: "paper" }, ["basic"]).theme).toBe("basic");
  });
});
