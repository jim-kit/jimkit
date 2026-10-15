import type { Metadata, Viewport } from "next";
import { enabledManifests } from "@/core/addons";
import { config } from "@/core/config";
import { currentLook } from "@/core/look";
import { accentVars } from "@/ui/accent";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const name = config().siteName;
  return {
    title: name,
    description: "Small tools for files and text. Runs on your own machine.",
    applicationName: name,
    robots: { index: false, follow: false },
    icons: { icon: "/icon.svg" },
    appleWebApp: { capable: true, title: name, statusBarStyle: "black-translucent" },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#212529" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { theme, mode, accent } = await currentLook();
  // a theme that comes from an installed kit has its stylesheet served from the data folder; one built into the image is already in the page's CSS
  const kit = enabledManifests().find((m) => m.source?.themeCss && m.themes?.some((t) => t.id === theme));
  const flat = enabledManifests().some((m) => m.themes?.some((t) => t.id === theme && t.flat));
  return (
    <html lang="en" data-theme={theme} data-mode={mode} data-accent={accent} data-flat={flat ? "" : undefined} style={accentVars(accent, mode === "light" ? "light" : "dark")} suppressHydrationWarning>
      <head>{kit?.source && <link rel="stylesheet" href={`/api/kits/${kit.id}/${kit.source.sha256}/theme.css`} />}</head>
      <body>{children}</body>
    </html>
  );
}
