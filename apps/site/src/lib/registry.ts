import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** The kits that come with Jimkit, read from the addon manifests when the site is built. The community kits are read in the browser (registry-data.ts). */
/** The repository root: the build runs in apps/site and the tests at the top, so look upward for the folder that holds the addons. */
function findRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++, dir = dirname(dir)) if (existsSync(resolve(dir, "addons")) && existsSync(resolve(dir, "apps/site"))) return dir;
  return resolve(process.cwd(), "../..");
}
const ROOT = findRoot();

export interface BuiltInKit { id: string; name: string; description: string; tools: string[]; looks: string[] }
export function loadBuiltInKits(): BuiltInKit[] {
  const out: BuiltInKit[] = [];
  for (const dir of readdirSync(resolve(ROOT, "addons")).sort()) {
    const m = JSON.parse(readFileSync(resolve(ROOT, "addons", dir, "package.json"), "utf8")).jimkit;
    if (m) out.push({ id: m.id, name: m.name, description: m.description, tools: (m.tools ?? []).map((t: { name: string }) => t.name), looks: (m.themes ?? []).map((t: { name: string }) => t.name) });
  }
  // the tool kits first, then the looks
  return out.sort((a, b) => Number(a.looks.length > 0 && !a.tools.length) - Number(b.looks.length > 0 && !b.tools.length));
}

