#!/usr/bin/env node
// End-to-end check of the conversion API against a running server, using files generated here by the real engines.
//   docker run -d --name jk-e2e -p 3000:3000 -e JIMKIT_PROXY_HOPS=1 -e JIMKIT_SESSION_SECRET=e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e jimkit:full
//   docker cp addons/convert/scripts/e2e.mjs jk-e2e:/tmp/e2e-run.mjs && docker exec jk-e2e node /tmp/e2e-run.mjs
// JIMKIT_PROXY_HOPS=1 lets the script play a stranger (X-Forwarded-For: 203.0.113.9), so the public-tier limits are exercised.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import http from "node:http";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const DIR = "/tmp/e2e";
if (process.env.XFF === undefined) process.env.XFF = "203.0.113.9";
mkdirSync(DIR, { recursive: true });
const sh = (cmd, args) => execFileSync(cmd, args, { cwd: DIR, stdio: "pipe" });

// ---- sample inputs, made with the engines themselves
// (ImageMagick's own pattern generators are blocked by the security policy, so ffmpeg makes the sample images)
sh("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=300x200:rate=1", "-frames:v", "1", "sample.png"]);
sh("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=300x200:rate=1", "-frames:v", "1", "sample.jpg"]);
writeFileSync(`${DIR}/logo.svg`, '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#8b93ff"/><circle cx="60" cy="40" r="25" fill="#fff"/></svg>');
sh("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "sample.wav"]);
sh("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=15", "-f", "lavfi", "-i", "sine=duration=2", "-pix_fmt", "yuv420p", "-shortest", "sample.mp4"]);
writeFileSync(`${DIR}/note.md`, "# Hello\n\nSome **bold** text and a list:\n\n- one\n- two\n");
sh("pandoc", ["note.md", "-o", "sample.docx"]);
sh("rsvg-convert", ["--format", "pdf", "--output", "sample.pdf", "logo.svg"]);
writeFileSync(`${DIR}/people.csv`, "name,age\nAda,36\nLinus,54\n");
writeFileSync(`${DIR}/cfg.json`, JSON.stringify({ a: 1, b: [1, 2] }));
writeFileSync(`${DIR}/rows.yaml`, "- name: Ada\n  age: 36\n- name: Linus\n  age: 54\n");
writeFileSync(`${DIR}/broken.png`, "this is not a png at all");
let heic = true;
try { sh("convert", ["png:sample.png", "heic:sample.heic"]); } catch { heic = false; }

// ---- tiny client
let cookie = "";
async function call(method, path, { body, headers = {}, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Origin: BASE, "X-Forwarded-For": process.env.XFF ?? "203.0.113.9", ...(cookie ? { Cookie: cookie } : {}), ...(body && !raw ? { "Content-Type": "application/json" } : {}), ...headers },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return res;
}
async function upload(file, name = file) {
  const buf = readFileSync(`${DIR}/${file}`);
  return call("PUT", `/api/a/convert/upload?name=${encodeURIComponent(name)}`, { raw: buf, headers: { "Content-Type": "application/octet-stream" } });
}
async function convert(uploadId, to, extra = {}) {
  const res = await call("POST", "/api/a/convert/convert", { body: { items: [{ uploadId, to, ...extra }] } });
  return (await res.json()).jobs?.[0];
}
async function wait(id, ms = 240_000) {
  const t0 = Date.now();
  for (;;) {
    const j = (await (await call("GET", `/api/a/convert/jobs?ids=${id}`)).json()).jobs[0];
    if (j.state === "done" || j.state === "failed") return j;
    if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + id);
    await new Promise((r) => setTimeout(r, 400));
  }
}
const mime = (p) => execFileSync("file", ["--brief", "--mime-type", p]).toString().trim();

let pass = 0, fail = 0;
async function check(label, file, to, expect, extra, verify) {
  const t0 = Date.now();
  try {
    const up = await upload(file);
    if (up.status !== 200) throw new Error(`upload ${up.status} ${await up.text()}`);
    const { id } = await up.json();
    const job = await convert(id, to, extra);
    const done = await wait(job.id);
    if (done.state !== "done") throw new Error(`job failed: ${done.error}`);
    const dl = await call("GET", `/api/a/convert/jobs/${job.id}/download`);
    const out = `${DIR}/out-${label.replace(/\W+/g, "_")}`;
    writeFileSync(out, Buffer.from(await dl.arrayBuffer()));
    const got = mime(out), size = statSync(out).size;
    if (size < 1 && !verify) throw new Error("empty output");
    if (expect && !expect.test(got)) throw new Error(`mime ${got} did not match ${expect}`);
    if (verify) verify(readFileSync(out), out);
    globalThis.lastOut = out;
    console.log(`  ok   ${label.padEnd(26)} -> ${done.outputs[0].name.padEnd(18)} ${got.padEnd(34)} ${String(size).padStart(7)} B  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    pass++;
  } catch (e) {
    console.log(`  FAIL ${label.padEnd(26)} ${e.message}`);
    fail++;
  }
}

console.log("conversions:");
await check("png -> webp", "sample.png", "webp", /webp/);
await check("png -> jpg (low)", "sample.png", "jpg", /jpeg/, { level: "low" });
await check("jpg -> png resized", "sample.jpg", "png", /png/, { maxDim: 100 });
await check("png -> avif", "sample.png", "avif", /avif|heif/);
if (heic) await check("heic -> jpg", "sample.heic", "jpg", /jpeg/); else console.log("  skip heic (no encoder in this build)");
await check("svg -> png", "logo.svg", "png", /png/);
await check("svg -> webp (2 steps)", "logo.svg", "webp", /webp/);
await check("wav -> mp3", "sample.wav", "mp3", /mpeg|audio/);
await check("wav -> flac", "sample.wav", "flac", /flac/);
await check("wav -> opus", "sample.wav", "opus", /ogg|opus|audio/);
await check("mp4 -> webm", "sample.mp4", "webm", /webm|matroska/);
await check("mp4 -> mp3 (extract)", "sample.mp4", "mp3", /mpeg|audio/);
await check("mp4 -> gif", "sample.mp4", "gif", /gif/);
await check("md -> docx (pandoc)", "note.md", "docx", /officedocument|zip/);
await check("docx -> pdf (libreoffice)", "sample.docx", "pdf", /pdf/);
execFileSync("cp", [globalThis.lastOut, `${DIR}/text.pdf`]);
await check("docx -> txt (libreoffice)", "sample.docx", "txt", /text/);
await check("md -> pdf (2 steps)", "note.md", "pdf", /pdf/);
await check("pdf -> png (pages)", "sample.pdf", "png", /png|zip/);
const must = (re, what) => (buf) => { if (!re.test(buf.toString("utf8"))) throw new Error(`output doesn't contain ${what}`); };
await check("pdf -> txt (has text)", "text.pdf", "txt", /text/, undefined, must(/Hello/, '"Hello"'));
await check("csv -> json", "people.csv", "json", /json|text/, undefined, (b) => { const r = JSON.parse(b.toString()); if (r[0].name !== "Ada" || r[1].age !== 54) throw new Error("wrong rows"); });
await check("json -> yaml", "cfg.json", "yaml", /text/, undefined, must(/a: 1/, "a: 1"));
await check("yaml -> csv", "rows.yaml", "csv", /text|csv/, undefined, must(/name,age/, "the header row"));

console.log("rejections:");
async function expectStatus(label, res, status) {
  const ok = res.status === status;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(44)} HTTP ${res.status}${ok ? "" : ` (wanted ${status})`}`);
  ok ? pass++ : fail++;
}
await expectStatus("unsupported type (.exe)", await call("PUT", "/api/a/convert/upload?name=a.exe", { raw: Buffer.from("MZ"), headers: {} }), 415);
await expectStatus("oversize (declared 3 GB, public tier)", await new Promise((resolve) => {
  const u = new URL(BASE);
  const req = http.request({ host: u.hostname, port: u.port, method: "PUT", path: "/api/a/convert/upload?name=big.mp4", headers: { "Content-Length": String(3 * 1024 ** 3), Origin: BASE, "X-Forwarded-For": "203.0.113.9" } }, (r) => { r.resume(); resolve({ status: r.statusCode }); });
  req.on("error", () => resolve({ status: "error" }));
  req.end("x");
}), 413);
await expectStatus("other origin (CSRF)", await fetch(BASE + "/api/a/convert/convert", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" }), 403);
{
  const up = await (await upload("sample.png")).json();
  await expectStatus("no route (png -> mp4)", await call("POST", "/api/a/convert/convert", { body: { items: [{ uploadId: up.id, to: "mp4" }] } }), 400);
  const other = await fetch(BASE + "/api/a/convert/convert", { method: "POST", headers: { Origin: BASE, "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.9", Cookie: "jk_cid=" + "0".repeat(32) }, body: JSON.stringify({ items: [{ uploadId: up.id, to: "webp" }] }) });
  await expectStatus("someone else's upload", other, 404);
}
{
  const up = await (await upload("broken.png")).json();
  const job = await convert(up.id, "jpg");
  const done = await wait(job.id);
  const ok = done.state === "failed" && /couldn't read|damaged/i.test(done.error ?? "") && !/\/data|\/tmp|\//.test((done.error ?? "").replace(/\bnot really\b/, ""));
  console.log(`  ${ok ? "ok  " : "FAIL"} ${"damaged file fails politely".padEnd(44)} "${done.error}"`);
  ok ? pass++ : fail++;
}


console.log("hostile inputs (none may leak server files or secrets):");
async function hostile(label, file, name, to, leaked) {
  try {
    const up = await upload(file, name);
    if (up.status !== 200) throw new Error(`upload ${up.status}`);
    const { id } = await up.json();
    const job = await convert(id, to);
    const done = await wait(job.id);
    let body = Buffer.alloc(0);
    if (done.state === "done") body = Buffer.from(await (await call("GET", `/api/a/convert/jobs/${job.id}/download`)).arrayBuffer());
    // docx/odt are zips and pdf streams are compressed, so extract the real text before searching it
    let text = body.toString("latin1");
    const outName = done.state === "done" ? done.outputs[0].name : "";
    if (/\.(docx|odt)$/.test(outName)) {
      writeFileSync(`${DIR}/h.zip`, body);
      text += execFileSync("sh", ["-c", `unzip -p ${DIR}/h.zip | tr -c '[:print:]\\n' ' '; unzip -l ${DIR}/h.zip`]).toString();
    } else if (/\.pdf$/.test(outName)) {
      writeFileSync(`${DIR}/h.pdf`, body);
      text += execFileSync("pdftotext", [`${DIR}/h.pdf`, "-"]).toString();
    }
    if (done.state === "done") console.log(`       (searched ${text.length} chars of ${outName})`);
    const hit = leaked.find((re) => re.test(text));
    const ok = !hit;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(44)} ${done.state}${hit ? `  LEAKED ${hit}` : ""}`);
    ok ? pass++ : fail++;
  } catch (e) {
    console.log(`  FAIL ${label.padEnd(44)} ${e.message}`);
    fail++;
  }
}
const SECRET = /e2e-e2e-e2e|JIMKIT_SESSION_SECRET/;
// positive control: a document that really contains the marker must be caught, or the check proves nothing
writeFileSync(`${DIR}/control.md`, "# control\n\nLEAK-MARKER-123\n");
{
  const up = await (await upload("control.md")).json();
  const job = await convert(up.id, "docx");
  const done = await wait(job.id);
  const body = Buffer.from(await (await call("GET", `/api/a/convert/jobs/${job.id}/download`)).arrayBuffer());
  writeFileSync(`${DIR}/c.zip`, body);
  const found = /LEAK-MARKER-123/.test(execFileSync("sh", ["-c", `unzip -p ${DIR}/c.zip | tr -c '[:print:]\\n' ' '`]).toString());
  console.log(`  ${found ? "ok  " : "FAIL"} positive control (docx text is searchable)`);
  found ? pass++ : fail++;
}
writeFileSync(`${DIR}/lfi.md`, "# hi\n\n![x](/proc/1/environ)\n\n![y](/etc/passwd)\n");
await hostile("markdown image link -> docx", "lfi.md", "lfi.md", "docx", [SECRET, /root:/]);
writeFileSync(`${DIR}/lfi.tex`, "\\documentclass{article}\\begin{document}\\input{/etc/passwd}\\verbatiminput{/proc/1/environ}\\end{document}\n");
await hostile("latex \\input of server files -> txt", "lfi.tex", "lfi.tex", "txt", [SECRET, /root:/]);
writeFileSync(`${DIR}/evil.mp4`, "ffconcat version 1.0\nfile /etc/passwd\nfile /proc/1/environ\n");
await hostile("ffmpeg concat script named .mp4", "evil.mp4", "evil.mp4", "webm", [SECRET, /root:/]);
writeFileSync(`${DIR}/evil.png`, 'push graphic-context\nviewbox 0 0 64 64\nimage over 0,0 0,0 "label:@/etc/passwd"\npop graphic-context\n');
await hostile("ImageMagick script named .png", "evil.png", "evil.png", "jpg", [SECRET, /root:/]);
writeFileSync(`${DIR}/evil.svg`, '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="60"><text x="5" y="30">x</text><image xlink:href="/etc/passwd" width="200" height="60"/></svg>');
await hostile("svg referencing /etc/passwd", "evil.svg", "evil.svg", "png", [SECRET, /root:/]);
writeFileSync(`${DIR}/evil.html`, '<html><body><iframe src="file:///etc/passwd"></iframe><img src="/proc/1/environ"></body></html>');
await hostile("html with file:// iframe -> pdf", "evil.html", "evil.html", "pdf", [SECRET, /root:/]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
