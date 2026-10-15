import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

// scripts/gen-addons.mjs writes the list of addon packages that need transpiling (they ship TypeScript source)
const generated = resolve(here, "src/generated/packages.json");
const addonPackages = existsSync(generated) ? JSON.parse(readFileSync(generated, "utf8")) : [];

/** @type {import('next').NextConfig} */
export default {
  output: "standalone",
  outputFileTracingRoot: root,
  poweredByHeader: false,
  // while developing, the dev server is reached by LAN address: JIMKIT_DEV_ORIGINS=192.168.1.20,mybox.lan
  allowedDevOrigins: (process.env.JIMKIT_DEV_ORIGINS ?? "").split(",").filter(Boolean),
  reactStrictMode: true,
  transpilePackages: ["@jimkit/sdk", "@jimkit/ui", ...addonPackages],
  // keep the server bundle small: native/optional engines are never bundled
  serverExternalPackages: ["archiver"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
