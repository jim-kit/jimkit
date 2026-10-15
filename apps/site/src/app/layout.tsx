import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import { accentVars } from "@/lib/accent";
import { LookProvider } from "@/lib/look";
import { DEFAULT_LOOK, LOOK_SCRIPT } from "@/lib/look-config";
import { DESCRIPTION, KEYWORDS, SITE_NAME, SITE_URL, TITLE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: KEYWORDS,
  category: "technology",
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE_NAME, title: TITLE, description: DESCRIPTION, url: "/", locale: "en_US" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  // the files in app/ (icon.svg, apple-icon.png, favicon.ico, opengraph-image.png, twitter-image.png) are added by Next from their names
  verification: { google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || undefined, other: process.env.NEXT_PUBLIC_BING_VERIFICATION ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_VERIFICATION } : undefined },
};
// the display face: a soft, warm serif for headlines; everything else is the system font the app uses
const display = Fraunces({ subsets: ["latin"], axes: ["opsz", "SOFT"], style: ["normal", "italic"], variable: "--font-display", display: "swap" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // the browser bar follows the page: cream on a light look, the dark brown on a dark one
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#efe8da" }, { media: "(prefers-color-scheme: dark)", color: "#15110d" }],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable} data-theme={DEFAULT_LOOK.theme} data-mode={DEFAULT_LOOK.mode} data-accent={DEFAULT_LOOK.accent} style={accentVars(DEFAULT_LOOK.accent)} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: LOOK_SCRIPT }} /></head>
      <body>
        <LookProvider>
          {children}
        </LookProvider>
      </body>
    </html>
  );
}
