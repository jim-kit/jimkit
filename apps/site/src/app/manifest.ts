import type { MetadataRoute } from "next";
import { DESCRIPTION, SITE_NAME } from "@/lib/site";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME}: self-hosted toolbox`,
    short_name: SITE_NAME,
    description: DESCRIPTION,
    start_url: "/",
    display: "browser",
    background_color: "#15110d",
    theme_color: "#15110d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
