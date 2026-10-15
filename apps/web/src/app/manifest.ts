import type { MetadataRoute } from "next";
import { config } from "@/core/config";

export default function manifest(): MetadataRoute.Manifest {
  const name = config().siteName;
  return { name, short_name: name, start_url: "/", display: "standalone", background_color: "#212529", theme_color: "#212529", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] };
}
