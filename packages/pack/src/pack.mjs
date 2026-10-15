// Packs a kit (an addon folder) into dist/jimkit-kit.json: its browser code, its stylesheet and its server code in one file.
//
// The host provides React, the UI kit and the SDK at run time, so none of them is bundled in; everything else the kit imports is.
// The stylesheet holds only the Tailwind utilities the kit's own source uses, written against the host's theme tokens, so the kit
// follows every theme and the host's CSS isn't repeated.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { ADDON_API_VERSION, BUNDLE_ASSET, BUNDLE_FORMAT, validateBundle } from "@jimkit/sdk/bundle";

const require = createRequire(import.meta.url);

/** What the page offers a kit at run time (see apps/web/src/ui/host-modules.ts). */
export const CLIENT_MODULES = ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "@jimkit/ui", "@jimkit/ui/motion", "@jimkit/sdk", "@jimkit/sdk/react"];
/** What the server offers a kit's server code (see apps/web/src/core/store/runtime.ts). */
export const SERVER_MODULES = ["@jimkit/sdk", "@jimkit/sdk/server"];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Imports of the host's own modules become reads from `globalThis.__jimkit.modules`, so the kit shares the host's React. */
function hostModules(names) {
  const filter = new RegExp(`^(${names.map(escapeRe).join("|")})$`);
  return {
    name: "jimkit-host-modules",
    setup(b) {
      b.onResolve({ filter }, (a) => ({ path: a.path, namespace: "jimkit-host" }));
      b.onLoad({ filter: /.*/, namespace: "jimkit-host" }, (a) => ({
        loader: "js",
        contents: `const m = globalThis.__jimkit && globalThis.__jimkit.modules[${JSON.stringify(a.path)}];\nif (!m) throw new Error("Jimkit does not provide ${a.path} here");\nmodule.exports = m;`,
      }));
    },
  };
}

const entry = (dir, base) => ["ts", "tsx", "js", "jsx", "mjs"].map((x) => join(dir, "src", `${base}.${x}`)).find(existsSync);

/** The custom properties the host's tokens define: the host emits those, so the kit's stylesheet must not redefine them. */
function tokenNames() {
  const text = readFileSync(require.resolve("@jimkit/ui/tokens.css"), "utf8");
  return new Set([...text.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
}

async function stylesheet(dir) {
  const src = join(dir, "src");
  const input = [
    `@import "tailwindcss/theme.css" layer(theme);`,
    `@import "@jimkit/ui/tokens.css";`,
    `@import "tailwindcss/utilities.css" layer(utilities) source(none);`,
    `@source ${JSON.stringify(src)};`,
  ].join("\n");
  const from = join(dir, "__jimkit_pack.css");
  const result = await postcss([tailwind({ base: dir, optimize: { minify: true } })]).process(input, { from });
  const tokens = tokenNames();
  const root = postcss.parse(result.css);
  // the host defines its tokens (and a theme may change them): drop the copies this build emitted, keep the rest of Tailwind's defaults
  root.walkDecls((d) => { if (tokens.has(d.prop) && d.parent?.type === "rule" && /^:root|:host/.test(d.parent.selector)) d.remove(); });
  root.walkRules((r) => { if (!r.nodes?.length) r.remove(); });
  root.walkAtRules((r) => { if (r.name === "layer" && r.nodes && !r.nodes.length) r.remove(); });
  const css = root.toString().trim();
  // in a layer of its own, ranked below the host's utilities: both sheets define `.flex`, and the later sheet would otherwise win over the host's `lg:hidden`
  return css ? `@layer kit{${css}}` : "";
}

/**
 * A theme's stylesheet is plain CSS, shipped as it is. Every rule has to start from the theme it belongs to
 * (`:root[data-theme="paper"] .jk-card`), or choosing the theme would not be the only way to change the page.
 */
export function lintThemeCss(css, ids) {
  const root = postcss.parse(css);
  const own = (sel) => ids.some((id) => sel.includes(`[data-theme="${id}"]`) || sel.includes(`[data-theme='${id}']`));
  const problems = [];
  root.walkRules((r) => {
    if (r.parent?.type === "atrule" && /keyframes$/i.test(r.parent.name)) return;
    for (const sel of r.selectors) if (!own(sel)) problems.push(sel.trim());
  });
  root.walkAtRules((a) => { if (a.name === "import") problems.push("@import"); });
  if (problems.length) {
    const first = problems.slice(0, 3).map((p) => `  ${p}`).join("\n");
    throw new Error(`theme.css has rules that are not scoped to your theme${ids.length > 1 ? "s" : ""} (${ids.join(", ")}). Start each one with :root[data-theme="${ids[0]}"]:\n${first}`);
  }
}

async function script(dir, file, { server }) {
  const out = await build({
    entryPoints: [file],
    absWorkingDir: dir,
    bundle: true,
    write: false,
    format: "esm",
    platform: server ? "node" : "browser",
    target: server ? "node22" : "es2022",
    jsx: "automatic",
    minify: true,
    legalComments: "none",
    logLevel: "silent",
    plugins: [hostModules(server ? SERVER_MODULES : CLIENT_MODULES)],
    // bundled CommonJS code that calls require("fs") needs a require in an ES module
    banner: server ? { js: 'import { createRequire as __jkRequire } from "node:module"; const require = __jkRequire(import.meta.url);' } : undefined,
  });
  return out.outputFiles[0].text;
}

/** Reads the manifest the way the build does: the "jimkit" field of package.json, with the package's own version, author and homepage as fallbacks. */
export function readManifest(dir) {
  const pj = join(dir, "package.json");
  if (!existsSync(pj)) throw new Error(`no package.json in ${dir}`);
  const pkg = JSON.parse(readFileSync(pj, "utf8"));
  if (!pkg.jimkit?.id) throw new Error(`${pj} has no "jimkit" field (see docs/addons.md)`);
  const author = typeof pkg.author === "string" ? pkg.author.replace(/\s*[<(].*$/, "") : pkg.author?.name;
  const manifest = { version: pkg.version, author, homepage: typeof pkg.homepage === "string" ? pkg.homepage : undefined, ...pkg.jimkit };
  manifest.apiVersion ??= ADDON_API_VERSION;
  for (const k of Object.keys(manifest)) if (manifest[k] === undefined) delete manifest[k];
  return manifest;
}

/** Builds <dir>/dist/jimkit-kit.json (or `out`). Returns { file, bytes, sha256, manifest }. Throws with a message a person can act on. */
export async function packKit(dir, { out } = {}) {
  dir = resolve(dir);
  const manifest = readManifest(dir);
  const clientFile = entry(dir, "client");
  const serverFile = entry(dir, "server");
  const themeFile = [join(dir, "src", "theme.css"), join(dir, "theme.css")].find(existsSync);
  if (!clientFile && !serverFile && !themeFile) throw new Error(`${dir}/src has none of client.ts, server.ts or theme.css`);
  if (themeFile && !manifest.themes) throw new Error(`${themeFile} exists, but package.json's "jimkit" field has no "themes" (see docs/themes.md)`);
  if (manifest.themes && !themeFile && !clientFile) throw new Error(`"themes" is declared but there is neither a src/theme.css nor a src/client.ts (with a layout)`);
  const files = {};
  if (themeFile) {
    const css = readFileSync(themeFile, "utf8");
    lintThemeCss(css, manifest.themes.map((t) => t.id));
    files["theme.css"] = css;
  }
  try {
    if (clientFile) {
      files["client.js"] = await script(dir, clientFile, { server: false });
      const css = await stylesheet(dir);
      if (css) files["client.css"] = css;
    }
    if (serverFile) files["server.js"] = await script(dir, serverFile, { server: true });
  } catch (e) {
    throw new Error(`the build failed:\n${e instanceof Error ? e.message : e}`);
  }
  const checked = validateBundle({ format: BUNDLE_FORMAT, manifest, files });
  if (!checked.ok) throw new Error(checked.error);
  const text = JSON.stringify(checked.bundle);
  const file = resolve(out ?? join(dir, "dist", BUNDLE_ASSET));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return { file, bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex"), manifest: checked.bundle.manifest };
}
