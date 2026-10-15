import type { AddonManifest } from "@jimkit/sdk";
import { resolveSettings } from "@jimkit/sdk/server";

/** Current values of every declared addon setting (defaults filled in), by addon id. Addons without settings are left out. */
export function addonSettingsView(manifests: AddonManifest[], addonConfig: Record<string, Record<string, unknown>>) {
  const out: Record<string, Record<string, unknown>> = {};
  for (const m of manifests) if (m.settings?.length) out[m.id] = resolveSettings(m.settings, addonConfig[m.id]);
  return out;
}
