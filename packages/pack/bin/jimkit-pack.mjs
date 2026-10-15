#!/usr/bin/env node
// jimkit-pack [folder] [--out file]   builds <folder>/dist/jimkit-kit.json, the file to attach to a GitHub release
import { resolve } from "node:path";
import { packKit } from "../src/pack.mjs";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dir = resolve(args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out") ?? ".");
try {
  const r = await packKit(dir, { out: flag("--out") });
  console.log(`${r.manifest.name} ${r.manifest.version}: ${r.file} (${(r.bytes / 1024).toFixed(1)} kB${r.manifest.server ? ", with a server part" : ""})`);
  console.log(`sha256 ${r.sha256}`);
} catch (e) {
  console.error(`jimkit-pack: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
