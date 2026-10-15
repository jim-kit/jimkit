import type { MetadataRoute } from "next";
import { absolute } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    // /frame/ is the bare tool the home page embeds: it has no content of its own
    rules: [{ userAgent: "*", allow: "/", disallow: ["/frame/"] }],
    sitemap: absolute("/sitemap.xml"),
    host: absolute("/"),
  };
}
