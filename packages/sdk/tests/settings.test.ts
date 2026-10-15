import { describe, expect, it } from "vitest";
import type { SettingDef } from "../src/index";
import { resolveSettings, validateSettings } from "../src/settings";

const defs: SettingDef[] = [
  { key: "fast", label: "Fast mode", type: "boolean", default: false },
  { key: "quality", label: "Quality", type: "number", default: 80, min: 1, max: 100 },
  { key: "title", label: "Title", type: "text", default: "hi", maxLength: 10 },
  { key: "unit", label: "Unit", type: "select", default: "mb", options: ["kb", "mb", { value: "gb", label: "Gigabytes" }] },
];

describe("resolveSettings", () => {
  it("fills in defaults and drops undeclared keys", () => {
    expect(resolveSettings(defs, { quality: 50, stray: 1 })).toEqual({ fast: false, quality: 50, title: "hi", unit: "mb" });
  });
  it("replaces stored values that no longer fit with the default, and clamps numbers", () => {
    expect(resolveSettings(defs, { fast: "yes", quality: 900, title: "far too long a title", unit: "tb" })).toEqual({ fast: false, quality: 100, title: "hi", unit: "mb" });
  });
  it("is empty for an addon without settings", () => {
    expect(resolveSettings(undefined, { a: 1 })).toEqual({});
  });
});

describe("validateSettings", () => {
  it("accepts good values and clamps numbers into range", () => {
    expect(validateSettings(defs, { fast: true, quality: 500, unit: "gb" })).toEqual({ ok: true, values: { fast: true, quality: 100, unit: "gb" } });
    expect(validateSettings(defs, { quality: -3 })).toEqual({ ok: true, values: { quality: 1 } });
  });
  it("refuses unknown keys", () => {
    expect(validateSettings(defs, { fats: true })).toEqual({ ok: false, error: 'Unknown setting "fats".' });
    expect(validateSettings(undefined, { a: 1 }).ok).toBe(false);
  });
  it("refuses values of the wrong kind", () => {
    expect(validateSettings(defs, { fast: "true" }).ok).toBe(false);
    expect(validateSettings(defs, { quality: "80" }).ok).toBe(false);
    expect(validateSettings(defs, { quality: NaN }).ok).toBe(false);
    expect(validateSettings(defs, { title: "x".repeat(11) }).ok).toBe(false);
    expect(validateSettings(defs, { unit: "tb" }).ok).toBe(false);
    expect(validateSettings(defs, [1, 2]).ok).toBe(false);
    expect(validateSettings(defs, null).ok).toBe(false);
  });
});
