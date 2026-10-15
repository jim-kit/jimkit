/** A QR Code encoder (ISO/IEC 18004 model 2): numeric, alphanumeric and byte modes, versions 1-40, error correction L/M/Q/H. */

export type Ecc = "L" | "M" | "Q" | "H";
const ECC_INDEX: Record<Ecc, number> = { L: 0, M: 1, Q: 2, H: 3 };
const ECC_FORMAT_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };

// per version (index 0 unused): error-correction codewords in each block, and the number of blocks
const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
export type Mode = "numeric" | "alphanumeric" | "byte";

export function pickMode(text: string): Mode {
  if (/^[0-9]*$/.test(text)) return "numeric";
  if ([...text].every((c) => ALNUM.includes(c))) return "alphanumeric";
  return "byte";
}

/** Data modules in a symbol of this version, before taking out the error correction (function patterns excluded) */
export function rawModules(ver: number): number {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const a = Math.floor(ver / 7) + 2;
    n -= (25 * a - 10) * a - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

/** Data codewords (bytes) a version holds at an error-correction level */
export function dataCodewords(ver: number, ecc: Ecc): number {
  const e = ECC_INDEX[ecc];
  return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[e][ver] * BLOCKS[e][ver];
}

const countBits = (mode: Mode, ver: number) => {
  const t = ver <= 9 ? 0 : ver <= 26 ? 1 : 2;
  return { numeric: [10, 12, 14], alphanumeric: [9, 11, 13], byte: [8, 16, 16] }[mode][t];
};

function segmentBits(mode: Mode, text: string, bytes: Uint8Array, ver: number): number[] | null {
  const bits: number[] = [];
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  const len = mode === "byte" ? bytes.length : text.length;
  const cb = countBits(mode, ver);
  if (len >= 1 << cb) return null;
  put(mode === "numeric" ? 1 : mode === "alphanumeric" ? 2 : 4, 4);
  put(len, cb);
  if (mode === "numeric") {
    for (let i = 0; i < text.length; i += 3) { const g = text.slice(i, i + 3); put(Number(g), g.length * 3 + 1); }
  } else if (mode === "alphanumeric") {
    for (let i = 0; i < text.length; i += 2) {
      if (i + 1 < text.length) put(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
      else put(ALNUM.indexOf(text[i]), 6);
    }
  } else for (const b of bytes) put(b, 8);
  return bits;
}

/** Data codewords for the text, padded to fill `ver`; null when it doesn't fit */
export function encodeData(text: string, ver: number, ecc: Ecc, mode = pickMode(text)): Uint8Array | null {
  const bits = segmentBits(mode, text, new TextEncoder().encode(text), ver);
  const cap = dataCodewords(ver, ecc) * 8;
  if (!bits || bits.length > cap) return null;
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0); // terminator
  while (bits.length % 8) bits.push(0);
  const out = new Uint8Array(cap / 8);
  for (let i = 0; i < bits.length; i++) out[i >> 3] |= bits[i] << (7 - (i & 7));
  for (let i = bits.length / 8, pad = 0xec; i < out.length; i++, pad ^= 0xec ^ 0x11) out[i] = pad;
  return out;
}

/* ───────── Reed-Solomon over GF(256), polynomial 0x11D ───────── */

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gmul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function generator(degree: number): Uint8Array {
  let g = Uint8Array.of(1);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(g.length + 1);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); }
    g = next;
  }
  return g; // highest power first, leading 1
}

export function eccFor(data: Uint8Array, degree: number): Uint8Array {
  const g = generator(degree);
  const rem = new Uint8Array(degree);
  for (const b of data) {
    const f = b ^ rem[0];
    rem.copyWithin(0, 1); rem[degree - 1] = 0;
    if (f) for (let i = 0; i < degree; i++) rem[i] ^= gmul(g[i + 1], f);
  }
  return rem;
}

/** Splits the data into blocks, adds error correction to each and interleaves them */
export function interleave(data: Uint8Array, ver: number, ecc: Ecc): Uint8Array {
  const e = ECC_INDEX[ecc];
  const nBlocks = BLOCKS[e][ver], eccLen = ECC_PER_BLOCK[e][ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const shortBlocks = nBlocks - (raw % nBlocks), shortLen = Math.floor(raw / nBlocks);
  const blocks: Uint8Array[] = [], eccs: Uint8Array[] = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const len = shortLen - eccLen + (i < shortBlocks ? 0 : 1);
    const d = data.subarray(k, k + len);
    k += len;
    blocks.push(d);
    eccs.push(eccFor(d, eccLen));
  }
  const out: number[] = [];
  for (let i = 0; i <= shortLen - eccLen; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < eccLen; i++) for (const b of eccs) out.push(b[i]);
  return Uint8Array.from(out);
}

/* ───────── the matrix ───────── */

export interface QrCode { size: number; version: number; ecc: Ecc; mask: number; mode: Mode; modules: boolean[][] }

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

export function formatBits(ecc: Ecc, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

function alignmentPositions(ver: number): number[] {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

function maskTest(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0;
    default: return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
  }
}

/** Lower is better: runs of one colour, 2x2 blocks, finder-like patterns and the dark/light balance (the four rules in the standard) */
function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0, dark = 0;
  const lines = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < n; i++) {
      let run = 1, s = "";
      for (let j = 0; j < n; j++) {
        s += get(i, j) ? "1" : "0";
        if (j > 0 && get(i, j) === get(i, j - 1)) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1;
      }
      for (const p of ["10111010000", "00001011101"]) for (let k = s.indexOf(p); k >= 0; k = s.indexOf(p, k + 1)) score += 40;
    }
  };
  lines((i, j) => m[i][j]);
  lines((i, j) => m[j][i]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y][x]) dark++;
    if (x < n - 1 && y < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  }
  const total = n * n;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

export interface QrOptions { ecc?: Ecc; minVersion?: number; mask?: number }

export function encodeQr(text: string, opts: QrOptions = {}): QrCode {
  const ecc = opts.ecc ?? "M";
  const mode = pickMode(text);
  let version = 0, data: Uint8Array | null = null;
  for (let v = Math.max(1, opts.minVersion ?? 1); v <= 40 && !data; v++) { data = encodeData(text, v, ecc, mode); if (data) version = v; }
  if (!data) throw new RangeError("Too long for a QR code at this error correction level");
  const codewords = interleave(data, version, ecc);
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { if (x >= 0 && y >= 0 && x < size && y < size) { modules[y][x] = dark; fn[y][x] = true; } };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); }
  }
  const ap = alignmentPositions(version);
  ap.forEach((cy, i) => ap.forEach((cx, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const drawFormat = (mask: number) => {
    const b = formatBits(ecc, mask);
    for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
    set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    const b = versionBits(version);
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit(b, i)); set(c, a, bit(b, i)); }
  }

  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fn[y][x] && k < codewords.length * 8) { modules[y][x] = bit(codewords[k >>> 3], 7 - (k & 7)); k++; }
    }
  }

  const apply = (mask: number) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskTest(mask, x, y)) modules[y][x] = !modules[y][x]; };
  let mask = opts.mask ?? -1;
  if (mask < 0) {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      apply(m); drawFormat(m);
      const p = penalty(modules);
      if (p < best) { best = p; mask = m; }
      apply(m); // undo
    }
  }
  apply(mask); drawFormat(mask);
  return { size, version, ecc, mask, mode, modules };
}

/* ───────── output ───────── */

/** An SVG with one path for all dark modules. `quiet` is the blank border in modules (the standard asks for 4). */
export function toSvg(qr: QrCode, quiet = 4, dark = "#000000", light: string | null = "#ffffff"): string {
  const total = qr.size + quiet * 2;
  let d = "";
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x]) continue;
      let w = 1;
      while (x + w < qr.size && qr.modules[y][x + w]) w++;
      d += `M${x + quiet} ${y + quiet}h${w}v1h-${w}z`;
      x += w;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">${light ? `<rect width="${total}" height="${total}" fill="${light}"/>` : ""}<path d="${d}" fill="${dark}"/></svg>\n`;
}

/** RGBA pixels, `scale` pixels per module, for PNG export and for testing with a decoder */
export function toPixels(qr: QrCode, scale: number, quiet = 4): { data: Uint8ClampedArray<ArrayBuffer>; width: number } {
  const width = (qr.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    if (!qr.modules[y][x]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return { data, width };
}

/* ───────── payload helpers ───────── */

const wifiEscape = (s: string) => s.replace(/[;,:"\\]/g, (c) => "\\" + c);

export function wifiPayload(o: { ssid: string; password: string; security: "WPA" | "WEP" | "nopass"; hidden: boolean }): string {
  const pass = o.security === "nopass" ? "" : `P:${wifiEscape(o.password)};`;
  return `WIFI:T:${o.security};S:${wifiEscape(o.ssid)};${pass}${o.hidden ? "H:true;" : ""};`;
}
