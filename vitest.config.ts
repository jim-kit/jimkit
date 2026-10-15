import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  test: { environment: "node", include: ["apps/**/tests/**/*.test.ts", "addons/**/tests/**/*.test.ts", "packages/**/tests/**/*.test.ts", "tests/**/*.test.ts"], exclude: ["**/node_modules/**", "**/.next/**", "**/out/**"] },
});
