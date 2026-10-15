import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** The site is plain static files: `next build` writes them to out/. */
/** @type {import('next').NextConfig} */
export default {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: resolve(here, "../.."),
  // the packages ship TypeScript source
  transpilePackages: ["@jimkit/sdk", "@jimkit/ui", "@jimkit/addon-text", "@jimkit/addon-convert", "@jimkit/addon-hash", "@jimkit/addon-devtools"],
};
