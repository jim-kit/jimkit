import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");

// The full variant lists its Debian packages in a stage that copies only a few folders. `jimkit apt` runs scripts/gen-addons.mjs, so
// every file that script imports from outside those folders has to be copied too, or `docker build` of the full image fails at once.
describe("Dockerfile aptlist stage", () => {
  const docker = readFileSync(join(root, "docker/Dockerfile"), "utf8");
  const stage = docker.slice(docker.indexOf("AS aptlist"), docker.indexOf("AS manifests"));
  const copied = [...stage.matchAll(/^COPY (\S+) /gm)].map((m) => m[1]);

  it("copies what gen-addons.mjs imports from outside cli, scripts and addons", () => {
    const script = readFileSync(join(root, "scripts/gen-addons.mjs"), "utf8");
    const imports = [...script.matchAll(/from "\.\.\/([^"]+)"/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const file of imports) {
      expect(copied.some((c) => file === c || file.startsWith(`${c}/`)), `${file} is imported by scripts/gen-addons.mjs but not copied in the aptlist stage`).toBe(true);
    }
  });
});
