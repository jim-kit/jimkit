import { availableThemes } from "@/core/look";
import { MODES, config, readFileConfig, reloadConfig, writeFileConfig, type FileConfig } from "@/core/config";
import { isAccent } from "@/ui/accent";
import { allManifests } from "@/core/addons";
import { snapshot } from "@/core/store/service";
import { addonSettingsView } from "@/core/addonsettings";
import { validateSettings } from "@jimkit/sdk/server";
import { json, readJson, sameOrigin } from "@/core/http";
import { getServerSession } from "@/core/session";

export const dynamic = "force-dynamic";

/** Settings can only be changed from the trusted tier (your own network). Everyone can read the public parts. */
export async function POST(req: Request) {
  if (!sameOrigin(req, config().proxyHops)) return json({ error: "forbidden" }, { status: 403 });
  const session = await getServerSession();
  if (session.tier !== "trusted") return json({ error: "Settings can only be changed from your own network." }, { status: 403 });

  const body = (await readJson(req, 64 * 1024)) as Partial<FileConfig> | null;
  if (!body || typeof body !== "object") return json({ error: "bad request" }, { status: 400 });
  const next: FileConfig = { ...readFileConfig(config().dataDir) };

  if (typeof body.siteName === "string") next.siteName = body.siteName.trim().slice(0, 40) || undefined;
  if (typeof body.theme === "string" && availableThemes().includes(body.theme)) next.theme = body.theme;
  if (typeof body.mode === "string" && (MODES as readonly string[]).includes(body.mode)) next.mode = body.mode;
  if (isAccent(body.accent)) next.accent = body.accent;
  if (Array.isArray(body.disabledAddons)) {
    const known = new Set(allManifests().map((m) => m.id));
    next.disabledAddons = body.disabledAddons.filter((id): id is string => typeof id === "string" && known.has(id));
  }
  // per-addon settings, checked against the manifest; one bad value refuses the whole save
  if (body.addonConfig !== undefined) {
    if (!body.addonConfig || typeof body.addonConfig !== "object" || Array.isArray(body.addonConfig)) return json({ error: "bad request" }, { status: 400 });
    const merged = { ...(next.addonConfig ?? {}) };
    for (const [id, input] of Object.entries(body.addonConfig)) {
      const manifest = allManifests().find((m) => m.id === id);
      if (!manifest?.settings?.length) return json({ error: `"${id}" has no settings.` }, { status: 400 });
      const check = validateSettings(manifest.settings, input);
      if (!check.ok) return json({ error: check.error }, { status: 400 });
      merged[id] = { ...(merged[id] ?? {}), ...check.values };
    }
    next.addonConfig = merged;
  }
  writeFileConfig(config().dataDir, next);
  const c = reloadConfig();
  // switching an addon off or on changes which tools exist: say so, so the page can follow without a reload
  const snap = Array.isArray(body.disabledAddons) ? await snapshot() : {};
  return json({ ok: true, theme: c.theme, mode: c.mode, accent: c.accent, siteName: c.siteName, disabledAddons: c.disabledAddons, addonSettings: addonSettingsView(allManifests(), c.addonConfig), ...snap });
}
