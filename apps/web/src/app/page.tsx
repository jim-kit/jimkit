import { cookies, headers } from "next/headers";
import type { Tier } from "@jimkit/sdk";
import { addonStatuses, enabledManifests } from "@/core/addons";
import { addonSettingsView } from "@/core/addonsettings";
import { config } from "@/core/config";
import { currentLook } from "@/core/look";
import { getServerSession, sessionView } from "@/core/session";
import { COLLAPSED_COOKIE, FAVS_COOKIE, HIDDEN_COOKIE, HUES_COOKIE, LAYOUT_COOKIE, ORDER_COOKIE } from "@/ui/arrange";
import { isMobileUa } from "@/ui/device";
import { Providers, type ModeId, type ThemeId } from "@/ui/providers";
import { Shell } from "@/ui/shell";

export const dynamic = "force-dynamic";
const TIERS = ["trusted", "unlocked", "public"] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ tier?: string }> }) {
  const h = await headers();
  const { tier } = await searchParams;
  // `?tier=` previews a tier while developing. Ignored in production.
  const assume = process.env.NODE_ENV !== "production" ? (TIERS.find((t) => t === tier) as Tier | undefined) : undefined;
  const cfg = config();
  const look = await currentLook();
  return (
    <Providers
      manifests={enabledManifests()}
      status={await addonStatuses()}
      initialSession={sessionView(await getServerSession(assume))}
      initialTheme={look.theme as ThemeId}
      initialMode={look.mode as ModeId}
      initialAccent={look.accent}
      addonSettings={addonSettingsView(enabledManifests(), cfg.addonConfig)}
      siteName={cfg.siteName}
      initialMobile={isMobileUa(h.get("user-agent") ?? "")}
      initialOrder={(await cookies()).get(ORDER_COOKIE)?.value ?? ""}
      initialHidden={(await cookies()).get(HIDDEN_COOKIE)?.value ?? ""}
      initialLayout={(await cookies()).get(LAYOUT_COOKIE)?.value ?? ""}
      initialFavs={(await cookies()).get(FAVS_COOKIE)?.value ?? ""}
      initialHues={(await cookies()).get(HUES_COOKIE)?.value ?? ""}
      initialCollapsed={(await cookies()).get(COLLAPSED_COOKIE)?.value ?? ""}
    >
      <Shell />
    </Providers>
  );
}
