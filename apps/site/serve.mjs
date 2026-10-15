// Serves the built site (out/) with nothing but Node: node serve.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "out");
const port = Number(process.argv[2] ?? process.env.PORT ?? 3300);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".txt": "text/plain", ".ico": "image/x-icon" };

async function find(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const file = join(root, clean);
  if (!file.startsWith(root)) return null;
  for (const c of [file, join(file, "index.html"), `${file}.html`]) {
    try { if ((await stat(c)).isFile()) return c; } catch { /* next */ }
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://x");
  const file = await find(pathname);
  const target = file ?? join(root, "404.html");
  try {
    const body = await readFile(target);
    res.writeHead(file ? 200 : 404, {
      "content-type": TYPES[extname(target)] ?? "application/octet-stream",
      // hashed build files never change; pages should be fetched fresh
      "cache-control": pathname.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}).listen(port, () => console.log(`site on :${port}`));
