#!/usr/bin/env node
// The jimkit command line. Everything it does is also doable by hand; it just saves the typing.
// A kit is an addon: the word people see. `jimkit addons ...` works as well as `jimkit kits ...`.
//
//   jimkit kits list                    what is built into this checkout, what each needs
//   jimkit kits info <id>               one kit's tools, system packages and settings
//   jimkit kits new <id>                scaffold a kit in addons/<id>, with a release workflow
//   jimkit kits pack [folder]           build <folder>/dist/jimkit-kit.json, the file to attach to a GitHub release
//   jimkit kits add <source>            build a kit into this checkout: an npm package, a git URL, or a local folder
//   jimkit kits remove <id>             leave a kit out of the build
//   jimkit apt [--addons a,b]           the Debian packages the kits need (for a custom image)
//   jimkit unlock-hash "<code>"         the value for JIMKIT_UNLOCK_HASH
//   jimkit doctor                       check the install for common problems
//   jimkit build [--docker [--variant lite|full] [--addons a,b] [--tag name]]   regenerate the registry and build the app, or a Docker image
//
// Kits from GitHub are added while Jimkit runs, from the Kits screen: no build, no restart.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discover } from "../scripts/gen-addons.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "jimkit.config.json");
const readConfig = () => (existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : { addons: "*" });
const writeConfig = (c) => writeFileSync(configPath, JSON.stringify(c, null, 2) + "\n");
const say = (...a) => console.log(...a);
const die = (msg) => { console.error(`jimkit: ${msg}`); process.exit(1); };

function enabledIds(all) {
  const c = readConfig();
  return c.addons === "*" || !c.addons ? all.map((a) => a.id) : c.addons;
}

function listAddons() {
  const all = discover(root);
  const on = new Set(enabledIds(all));
  if (!all.length) return say("No addons found.");
  const w = Math.max(...all.map((a) => a.id.length));
  for (const a of all) {
    const m = a.manifest;
    say(`${on.has(a.id) ? "●" : "○"} ${a.id.padEnd(w)}  v${m.version.padEnd(7)} ${m.tools.length} tool${m.tools.length === 1 ? " " : "s"}  ${m.description}`);
  }
  say("\n● built into this install   ○ installed but left out (jimkit.config.json)");
}

function info(id) {
  const a = discover(root).find((x) => x.id === id);
  if (!a) die(`no addon "${id}". Try: jimkit addons list`);
  const m = a.manifest;
  say(`${m.name} (${m.id}) v${m.version}\n${m.description}\npackage: ${a.name}\nserver: ${m.server ? "yes" : "no"}`);
  say("\nTools:");
  for (const t of m.tools) say(`  ${t.id.padEnd(14)} ${t.name}: ${t.blurb} [${t.category}]${t.trusted ? " (trusted tiers only)" : ""}`);
  if (m.system?.apt?.length) say(`\nDebian packages: ${m.system.apt.join(" ")}`);
  if (m.settings?.length) { say("\nSettings panel:"); for (const d of m.settings) say(`  ${d.key} (${d.type}, default ${JSON.stringify(d.default)}): ${d.label}`); }
  if (m.env?.length) { say("\nSettings:"); for (const e of m.env) say(`  ${e.name}${e.default ? ` (default ${e.default})` : ""}: ${e.description}`); }
}

function add(source) {
  if (!source) die("usage: jimkit kits add <npm package | git URL | ./folder>   (to add a kit from GitHub while Jimkit runs, use the Kits screen)");
  const before = new Set(discover(root).map((a) => a.id));
  if (existsSync(source) && existsSync(join(source, "package.json"))) {
    const name = JSON.parse(readFileSync(join(source, "package.json"), "utf8")).jimkit?.id;
    if (!name) die(`${source}/package.json has no "jimkit" manifest`);
    cpSync(source, join(root, "addons", name), { recursive: true, filter: (p) => !p.includes("node_modules") });
    say(`copied ${source} to addons/${name}`);
  } else {
    const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", source], { cwd: root, stdio: "inherit" });
    if (r.status !== 0) die("npm install failed");
  }
  const after = discover(root).filter((a) => !before.has(a.id));
  if (!after.length) die("installed, but no addon manifest was found in it (package.json needs a \"jimkit\" field)");
  const c = readConfig();
  if (Array.isArray(c.addons)) { for (const a of after) if (!c.addons.includes(a.id)) c.addons.push(a.id); writeConfig(c); }
  spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: root, stdio: "inherit" });
  for (const a of after) say(`\n+ ${a.id}: ${a.manifest.name}. Rebuild to use it: jimkit build${a.manifest.system?.apt?.length ? " --docker (it needs system packages: " + a.manifest.system.apt.join(", ") + ")" : ""}`);
}

function remove(id) {
  const all = discover(root);
  const a = all.find((x) => x.id === id);
  if (!a) die(`no addon "${id}"`);
  const c = readConfig();
  c.addons = enabledIds(all).filter((x) => x !== id);
  writeConfig(c);
  say(`- ${id} is left out of the build (jimkit.config.json). Its files stay; delete addons/${id} to remove them for good.`);
}

function scaffold(id) {
  if (!id || !/^[a-z][a-z0-9-]{1,30}$/.test(id)) die("usage: jimkit addons new <id>   (lowercase letters, digits, dashes)");
  const dir = join(root, "addons", id);
  if (existsSync(dir)) die(`addons/${id} already exists`);
  mkdirSync(join(dir, "src"), { recursive: true });
  const title = id.replace(/(^|-)(\w)/g, (_, a, b) => (a ? " " : "") + b.toUpperCase());
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: `@jimkit/addon-${id}`, version: "0.1.0", description: `${title}: a Jimkit addon.`, license: "MIT", type: "module",
    exports: { "./client": "./src/client.ts", "./server": "./src/server.ts" },
    peerDependencies: { "@jimkit/sdk": "*", "@jimkit/ui": "*", "lucide-react": "*", react: "^19.0.0" },
    jimkit: {
      id, name: title, description: `${title}: replace this with one sentence about what it does.`,
      tools: [{ id: `${id}-tool`, category: "utilities", name: title, blurb: "Say what it does in a few words", icon: "Puzzle" }],
      server: true,
    },
  }, null, 2) + "\n");
  writeFileSync(join(dir, "src/client.ts"), `import { defineClient } from "@jimkit/sdk";\n\nexport default defineClient({\n  // one lazy loader per tool: its code is only fetched when the tool is opened\n  tools: { "${id}-tool": () => import("./Tool") },\n});\n`);
  writeFileSync(join(dir, "src/Tool.tsx"), `"use client";

import type { ToolProps } from "@jimkit/sdk";
import { useHost } from "@jimkit/sdk/react";
import { Btn, ToolFrame, toast } from "@jimkit/ui";
import { useState } from "react";

export default function Tool({ tool, hue, onClose, mobile }: ToolProps) {
  const host = useHost();
  const [reply, setReply] = useState<string | null>(null);

  async function ping() {
    const r = await host.api("${id}", "hello");
    const body = await r.json();
    setReply(body.message);
    toast.success("The server answered");
  }

  return (
    <ToolFrame title={tool.name} icon={tool.icon} hue={hue} onClose={onClose} mobile={mobile}>
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="text-[17px] font-semibold">Hello from ${title}.</p>
          <p className="mt-1 text-[14px] text-dim">You are on the {host.session.tier} tier.</p>
          <div className="mt-5"><Btn primary onClick={ping}>Ask the server</Btn></div>
          {reply && <p className="mt-4 font-mono text-[13px] text-faint">{reply}</p>}
        </div>
      </div>
    </ToolFrame>
  );
}
`);
  writeFileSync(join(dir, "src/server.ts"), `import { defineServer } from "@jimkit/sdk";

export default defineServer({
  routes: {
    // GET /api/a/${id}/hello
    "GET hello": ({ client }, ctx) => ctx.reply(client, { message: \`hello from ${id}, \${client.tier} client\` }),
  },
});
`);
  mkdirSync(join(dir, ".github/workflows"), { recursive: true });
  writeFileSync(join(dir, ".gitignore"), "node_modules\ndist\n");
  writeFileSync(join(dir, ".github/workflows/release.yml"), RELEASE_WORKFLOW);
  writeFileSync(join(dir, "README.md"), `# ${title}

A kit for Jimkit. Replace this with what it does.

## Try it

Inside a Jimkit checkout this folder is \`addons/${id}\`: \`npm run dev\` and open it from the home page.

## Publish it

1. Put this folder in a GitHub repository (the address people will use is \`you/your-repository\`).
2. Bump \`version\` in package.json, then \`git tag v0.1.0 && git push --tags\`. The workflow in \`.github/workflows\` builds
   \`dist/jimkit-kit.json\` and attaches it to a release. Without the workflow: \`jimkit kits pack\`, then
   \`gh release create v0.1.0 dist/jimkit-kit.json\`.
3. People add it from Jimkit's Kits screen by pasting \`you/your-repository\`. To be listed there, submit it at https://jimkit.thejimmy.dev/kits/submit/ (sign in with GitHub; a maintainer approves new kits).
`);
  const c = readConfig();
  if (Array.isArray(c.addons) && !c.addons.includes(id)) { c.addons.push(id); writeConfig(c); }
  spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: root, stdio: "inherit" });
  say(`\nCreated addons/${id}.\n  Run \`npm run dev\` and open it from the home page.\n  Edit src/Tool.tsx and src/server.ts.`);
}

const RELEASE_WORKFLOW = `# Builds the kit and attaches dist/jimkit-kit.json to the release for a tag like v1.2.0.
name: Release
on:
  push:
    tags: ["v*"]
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx --yes @jimkit/pack
      - run: gh release create "\${{ github.ref_name }}" dist/jimkit-kit.json --generate-notes
        env:
          GH_TOKEN: \${{ github.token }}
`;

function parseAddonsFlag(args) {
  const i = args.indexOf("--addons");
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

function apt(args = []) {
  const all = discover(root);
  const flag = parseAddonsFlag(args);
  const on = new Set(flag ? (flag === "*" ? all.map((a) => a.id) : flag.split(",")) : enabledIds(all));
  const pk = [...new Set(all.filter((a) => on.has(a.id)).flatMap((a) => a.manifest.system?.apt ?? []))].sort();
  say(pk.join(" "));
}

/** KEY=value lines of .env (the shell-style quoting the installer and the docs use). */
function readEnv(file) {
  const env = {};
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

/** The proxy setting and the published port: who can reach Jimkit, and does the proxy count match what really arrives. */
async function checkNetwork(ok, no, note) {
  const env = readEnv(join(root, ".env"));
  if (!env) return note("no .env here, so the proxy and port settings weren't checked");
  const hops = Number(env.JIMKIT_PROXY_HOPS ?? 0) || 0;
  const bind = env.JIMKIT_BIND || "0.0.0.0";
  const port = env.JIMKIT_PORT || "3000";
  const open = bind === "0.0.0.0";
  if (hops > 0 && open) no(`JIMKIT_PROXY_HOPS=${hops} but the port is open on every network, so anyone can reach it around the proxy. Set JIMKIT_BIND=127.0.0.1 in .env (this machine's LAN address if the proxy is elsewhere), then: docker compose up -d`);
  else if (hops > 0) ok(`behind ${hops} prox${hops === 1 ? "y" : "ies"}, port published on ${bind} only`);
  else ok(open ? "no proxy in front, port open to your network" : `no proxy in front, port published on ${bind} only`);

  let health;
  try {
    const r = await fetch(`http://${open ? "127.0.0.1" : bind}:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
    health = await r.json();
  } catch {
    return note(`Jimkit isn't answering on port ${port}; what it receives wasn't checked`);
  }
  if (!health.proxy) return note("the running instance only reports proxy problems to addresses in JIMKIT_TRUSTED_CIDRS, and this machine isn't one");
  if (health.proxy.hops !== hops) no(`.env says JIMKIT_PROXY_HOPS=${hops} but the running instance uses ${health.proxy.hops}. Restart it: docker compose up -d`);
  if (health.proxy.unexpectedAt) no("requests with X-Forwarded-For arrive but JIMKIT_PROXY_HOPS=0, so every visitor looks like the proxy. Set JIMKIT_PROXY_HOPS=1 and JIMKIT_BIND=127.0.0.1, then: docker compose up -d");
  if (health.proxy.missingAt) no(`requests arrived without X-Forwarded-For while JIMKIT_PROXY_HOPS=${hops}: someone bypassed the proxy, or the proxy doesn't send the header`);
  if (!health.proxy.unexpectedAt && !health.proxy.missingAt) ok("the requests Jimkit has seen match the proxy setting");
}

async function doctor() {
  let bad = 0;
  const ok = (m) => say(`  ok   ${m}`);
  const no = (m) => { bad++; say(`  FAIL ${m}`); };
  const note = (m) => say(`  --   ${m}`);
  const major = Number(process.versions.node.split(".")[0]);
  major >= 22 ? ok(`Node ${process.versions.node}`) : no(`Node ${process.versions.node}: Jimkit needs 22 or newer`);
  const all = discover(root);
  const c = readConfig();
  const want = c.addons === "*" ? all.map((a) => a.id) : c.addons ?? [];
  const missing = want.filter((id) => !all.some((a) => a.id === id));
  missing.length ? no(`jimkit.config.json lists addons that aren't installed: ${missing.join(", ")}`) : ok(`${want.length} addon${want.length === 1 ? "" : "s"} configured, all present`);
  const need = [...new Set(all.filter((a) => want.includes(a.id)).flatMap((a) => a.manifest.system?.apt ?? []))];
  if (need.length) {
    const have = spawnSync("dpkg-query", ["-W", "-f=${Package}\\n", ...need], { encoding: "utf8" });
    if (have.error) note(`can't check system packages here (not Debian/Ubuntu); the Docker image installs them: ${need.length} packages`);
    else {
      const found = new Set((have.stdout || "").split("\n").filter(Boolean));
      const lacking = need.filter((p) => !found.has(p));
      lacking.length ? no(`missing system packages: ${lacking.join(" ")} (apt install them, or use the Docker image)`) : ok("system packages present");
    }
  }
  existsSync(join(root, "apps/web/src/generated/manifests.json")) ? ok("registry generated") : no("registry not generated: run jimkit build");
  await checkNetwork(ok, no, note);
  say(bad ? `\n${bad} problem${bad === 1 ? "" : "s"} found.` : "\nAll good.");
  process.exit(bad ? 1 : 0);
}

function build(args) {
  if (args.includes("--docker")) {
    const tag = args.includes("--tag") ? args[args.indexOf("--tag") + 1] : `jimkit:${args.includes("--variant") ? args[args.indexOf("--variant") + 1] : "full"}`;
    const flag = parseAddonsFlag(args);
    const vi = args.indexOf("--variant");
    const variant = vi >= 0 ? args[vi + 1] : "full";
    // a custom addon list needs its own package list; the stock variants work it out inside the Dockerfile
    const custom = flag ? ["--build-arg", `ADDONS=${flag}`, "--build-arg", `APT_PACKAGES=${execFileSync("node", [join(root, "cli/jimkit.mjs"), "apt", "--addons", flag], { encoding: "utf8" }).trim()}`] : ["--build-arg", `VARIANT=${variant}`];
    const r = spawnSync("docker", ["build", "-f", "docker/Dockerfile", ...custom, "-t", tag, "."], { cwd: root, stdio: "inherit" });
    process.exit(r.status ?? 1);
  }
  spawnSync("node", [join(root, "scripts/gen-addons.mjs")], { stdio: "inherit" });
  const r = spawnSync("npm", ["run", "build", "-w", "apps/web"], { cwd: root, stdio: "inherit" });
  process.exit(r.status ?? 1);
}

/** Builds the single file a GitHub release carries. */
async function pack(args) {
  const { packKit } = await import("../packages/pack/src/pack.mjs");
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined;
  const dir = resolve(args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out") ?? ".");
  try {
    const r = await packKit(dir, { out });
    say(`${r.manifest.name} ${r.manifest.version}: ${r.file} (${(r.bytes / 1024).toFixed(1)} kB${r.manifest.server ? ", with a server part" : ""})\nsha256 ${r.sha256}`);
    say(`\nTo publish: git tag v${r.manifest.version} && git push --tags   (the workflow in .github/workflows attaches the file)\n         or: gh release create v${r.manifest.version} ${r.file}`);
  } catch (e) {
    die(e instanceof Error ? e.message : String(e));
  }
}

const [cmd, sub, ...rest] = process.argv.slice(2);
if (cmd === "addons" || cmd === "kits") {
  if (sub === "list" || !sub) listAddons();
  else if (sub === "info") info(rest[0]);
  else if (sub === "add") add(rest[0]);
  else if (sub === "remove") remove(rest[0]);
  else if (sub === "new") scaffold(rest[0]);
  else if (sub === "pack") await pack(rest);
  else die(`unknown kits command "${sub}"`);
} else if (cmd === "apt") apt([sub, ...rest].filter(Boolean));
else if (cmd === "unlock-hash") { const r = spawnSync("node", [join(root, "scripts/hash-code.mjs"), sub ?? ""], { stdio: "inherit" }); process.exit(r.status ?? 1); }
else if (cmd === "doctor") await doctor();
else if (cmd === "build") build([sub, ...rest].filter(Boolean));
else {
  say(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
  process.exit(cmd ? 1 : 0);
}
