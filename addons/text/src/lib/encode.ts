/** Encoders and decoders for the Encode tool. Every function returns text or an explanation, never throws. */
export type R = { ok: true; text: string } | { ok: false; error: string };
const ok = (text: string): R => ({ ok: true, text });
const bad = (error: string): R => ({ ok: false, error });

const bytesToBinary = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return s; };
const utf8 = (s: string) => new TextEncoder().encode(s);
const fromUtf8 = (b: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(b);

export const toBase64 = (s: string, url = false): R => {
  const b = btoa(bytesToBinary(utf8(s)));
  return ok(url ? b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : b);
};

export function bytesFromBase64(s: string): Uint8Array | string {
  const clean = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return "That isn't valid Base64";
  try {
    const bin = atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, "="));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch { return "That isn't valid Base64"; }
}

export const fromBase64 = (s: string): R => {
  const b = bytesFromBase64(s);
  if (typeof b === "string") return bad(b);
  try { return ok(fromUtf8(b)); } catch { return bad("Decoded, but the bytes aren't text (binary data?)"); }
};

export const toUrl = (s: string, whole = false): R => {
  // a half of an emoji (a lone surrogate, from a cut-off paste) can't be put in a URL: say so, as the other converters do
  try { return ok(whole ? encodeURI(s) : encodeURIComponent(s)); } catch { return bad("The text ends in half of a character (a cut-off emoji?), which can't be URL-encoded"); }
};
export const fromUrl = (s: string): R => { try { return ok(decodeURIComponent(s.replace(/\+/g, " "))); } catch { return bad("Broken %-escape in the input"); } };

export const toHex = (s: string, sep = " "): R => ok(Array.from(utf8(s), (x) => x.toString(16).padStart(2, "0")).join(sep));
export const fromHex = (s: string): R => {
  const clean = s.replace(/0x/gi, "").replace(/[\s,:-]+/g, "");
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2) return bad("Hex needs an even number of 0-9 a-f digits");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  try { return ok(fromUtf8(out)); } catch { return bad("Those bytes aren't valid text"); }
};

export const toBinary = (s: string): R => ok(Array.from(utf8(s), (x) => x.toString(2).padStart(8, "0")).join(" "));
export const fromBinary = (s: string): R => {
  const clean = s.replace(/\s+/g, "");
  if (!/^[01]*$/.test(clean) || clean.length % 8) return bad("Binary needs groups of eight 0s and 1s");
  const out = new Uint8Array(clean.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 8, i * 8 + 8), 2);
  try { return ok(fromUtf8(out)); } catch { return bad("Those bytes aren't valid text"); }
};

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", euro: "€", pound: "£", yen: "¥", deg: "°", times: "×", laquo: "«", raquo: "»" };
export const toHtml = (s: string, all = false): R => ok(s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`).replace(all ? /[^\x20-\x7e\n\t]/gu : /$^/g, (c) => `&#${c.codePointAt(0)};`));
export const fromHtml = (s: string): R => ok(s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return m; } }
  return NAMED[e.toLowerCase()] ?? m;
}));

export const toUnicode = (s: string): R => ok([...s].map((c) => (c.codePointAt(0)! > 0x7e || c.codePointAt(0)! < 0x20 ? (c.codePointAt(0)! > 0xffff ? `\\u{${c.codePointAt(0)!.toString(16)}}` : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`) : c)).join(""));
export const fromUnicode = (s: string): R => ok(s.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})|\\n|\\t|\\r/gi, (m, a, b, c) => {
  if (a || b || c) { const n = parseInt(a ?? b ?? c, 16); return n <= 0x10ffff ? String.fromCodePoint(n) : m; } // beyond Unicode: left as typed
  return m === "\\n" ? "\n" : m === "\\t" ? "\t" : "\r";
}));

const ROT = (n: number) => (s: string) => s.replace(/[a-z]/gi, (c) => { const base = c <= "Z" ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - base + n) % 26 + 26) % 26 + base); });
export const rot13 = (s: string): R => ok(ROT(13)(s));

export function jwt(s: string): R {
  const parts = s.trim().split(".");
  if (parts.length < 2 || parts.length > 3) return bad("A JWT has three dot-separated parts");
  const out: Record<string, unknown> = {};
  for (const [i, name] of ["header", "payload"].entries()) {
    const b = bytesFromBase64(parts[i]);
    if (typeof b === "string") return bad(`The ${name} isn't valid Base64`);
    try { out[name] = JSON.parse(fromUtf8(b)); } catch { return bad(`The ${name} isn't JSON`); }
  }
  const p = out.payload as Record<string, unknown>;
  const dates: string[] = [];
  for (const k of ["iat", "nbf", "exp"]) if (typeof p?.[k] === "number") {
    const t = new Date((p[k] as number) * 1000);
    dates.push(`${k}: ${Number.isFinite(t.getTime()) ? t.toISOString() : "not a date"}`); // 99999999999999 seconds is past what a date can hold
  }
  return ok(JSON.stringify(out, null, 2) + (dates.length ? "\n\n" + dates.join("\n") : "") + (parts[2] ? "\n\n(signature present, not verified)" : "\n\n(unsigned)"));
}

export const MODES = [
  { id: "base64", label: "Base64", enc: (s: string) => toBase64(s), dec: fromBase64 },
  { id: "base64url", label: "Base64 URL-safe", enc: (s: string) => toBase64(s, true), dec: fromBase64 },
  { id: "url", label: "URL component", enc: (s: string) => toUrl(s), dec: fromUrl },
  { id: "hex", label: "Hex", enc: (s: string) => toHex(s), dec: fromHex },
  { id: "binary", label: "Binary", enc: toBinary, dec: fromBinary },
  { id: "html", label: "HTML entities", enc: (s: string) => toHtml(s), dec: fromHtml },
  { id: "unicode", label: "Unicode escapes", enc: toUnicode, dec: fromUnicode },
  { id: "rot13", label: "ROT13", enc: rot13, dec: rot13 },
  { id: "jwt", label: "JWT (decode)", enc: null, dec: jwt },
] as const;
export type EncodeMode = (typeof MODES)[number]["id"];
