import { cookies } from "next/headers";
import { enabledManifests } from "./addons";
import { config, normalizeLook } from "./config";

/** Basic, and every theme a switched-on addon brings. */
export const availableThemes = (): string[] => ["basic", ...enabledManifests().flatMap((m) => (m.themes ?? []).map((t) => t.id))];

/** The look this visitor gets: their own cookies where they have chosen, the server default where they haven't. */
export async function currentLook() {
  const c = await cookies();
  const cfg = config();
  return normalizeLook(c.get("jk_theme")?.value, c.get("jk_mode")?.value, c.get("jk_accent")?.value, { theme: cfg.theme, mode: cfg.mode, accent: cfg.accent }, availableThemes());
}
