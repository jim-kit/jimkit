import type { MetadataRoute } from "next";

// A private tool: ask crawlers to stay away. (Remove this file if you want your instance indexed.)
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
