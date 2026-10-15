import type { SettingDef } from "./index";

/** The choices of a select setting, as value/label pairs (a plain string is its own label). */
export function settingOptions(def: SettingDef): { value: string; label: string }[] {
  return (def.options ?? []).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}

const DEFAULT_MAX_TEXT = 200;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const clamp = (def: SettingDef, n: number) => Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n));

/** A stored value that fits the definition, or undefined (numbers are clamped into range). */
function fit(def: SettingDef, v: unknown): unknown {
  switch (def.type) {
    case "boolean": return typeof v === "boolean" ? v : undefined;
    case "number": return typeof v === "number" && Number.isFinite(v) ? clamp(def, v) : undefined;
    case "text": return typeof v === "string" && v.length <= (def.maxLength ?? DEFAULT_MAX_TEXT) ? v : undefined;
    case "select": return typeof v === "string" && settingOptions(def).some((o) => o.value === v) ? v : undefined;
  }
}

/**
 * What an addon sees: every declared setting, from the stored value when it is valid and the default when it is missing or
 * wrong (the file can be edited by hand). Keys the manifest doesn't declare are left out.
 */
export function resolveSettings(defs: SettingDef[] | undefined, stored: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of defs ?? []) out[d.key] = fit(d, stored?.[d.key]) ?? d.default;
  return out;
}

export type SettingsCheck = { ok: true; values: Record<string, unknown> } | { ok: false; error: string };

/**
 * Checks what a Settings save sends. Unknown keys and values of the wrong kind are refused, so a typo never reaches the config
 * file; numbers outside min/max are clamped.
 */
export function validateSettings(defs: SettingDef[] | undefined, input: unknown): SettingsCheck {
  if (!isObject(input)) return { ok: false, error: "Settings must be an object." };
  const values: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(input)) {
    const def = (defs ?? []).find((d) => d.key === key);
    if (!def) return { ok: false, error: `Unknown setting "${key}".` };
    const ok = fit(def, v);
    if (ok === undefined) {
      const why = { boolean: "must be on or off", number: "must be a number", text: `must be text of at most ${def.maxLength ?? DEFAULT_MAX_TEXT} characters`, select: "must be one of the listed choices" }[def.type];
      return { ok: false, error: `"${def.label}" ${why}.` };
    }
    values[key] = ok;
  }
  return { ok: true, values };
}
