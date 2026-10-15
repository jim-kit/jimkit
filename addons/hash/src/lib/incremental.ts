/** Hashes that take their input in pieces, so a file can be streamed through them without ever being held whole. */

export interface Hasher {
  update(chunk: Uint8Array): void;
  /** The finished hash. Call once. */
  digest(): Uint8Array;
}

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** Merkle-Damgard plumbing: collects input into blocks, pads and appends the length. Subclasses only compress one block. */
abstract class Blocks implements Hasher {
  private buf: Uint8Array;
  private fill = 0;
  private total = 0;
  constructor(private block: number, private lenBytes: 8 | 16, private little = false) { this.buf = new Uint8Array(block); }
  protected abstract compress(d: Uint8Array, o: number): void;
  protected abstract out(): Uint8Array;

  update(chunk: Uint8Array) {
    const { block, buf } = this;
    this.total += chunk.length;
    let i = 0;
    if (this.fill) {
      const take = Math.min(block - this.fill, chunk.length);
      buf.set(chunk.subarray(0, take), this.fill);
      this.fill += take; i = take;
      if (this.fill < block) return;
      this.compress(buf, 0); this.fill = 0;
    }
    for (; i + block <= chunk.length; i += block) this.compress(chunk, i);
    if (i < chunk.length) { buf.set(chunk.subarray(i)); this.fill = chunk.length - i; }
  }

  digest() {
    const { block, buf, lenBytes } = this;
    const hi = Math.floor(this.total / 2 ** 29), lo = (this.total << 3) >>> 0; // length in bits, split in two words
    buf[this.fill++] = 0x80;
    if (this.fill > block - lenBytes) { buf.fill(0, this.fill); this.compress(buf, 0); this.fill = 0; }
    buf.fill(0, this.fill);
    const dv = new DataView(buf.buffer);
    if (this.little) { dv.setUint32(block - 8, lo, true); dv.setUint32(block - 4, hi, true); }
    else { dv.setUint32(block - 8, hi, false); dv.setUint32(block - 4, lo, false); }
    this.compress(buf, 0);
    return this.out();
  }
}

const be = (d: Uint8Array, o: number) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) | 0;
const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

function words(h: ArrayLike<number>, little = false): Uint8Array {
  const out = new Uint8Array(h.length * 4);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < h.length; i++) dv.setUint32(i * 4, h[i] >>> 0, little);
  return out;
}

/* ───── MD5 ───── */

const MD5_K = Int32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

class Md5 extends Blocks {
  private h = new Int32Array([0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476]);
  private m = new Int32Array(16);
  constructor() { super(64, 8, true); }
  protected compress(d: Uint8Array, o: number) {
    const m = this.m, h = this.h;
    for (let i = 0; i < 16; i++, o += 4) m[i] = d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24);
    let a = h[0], b = h[1], c = h[2], dd = h[3];
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (b & c) | (~b & dd); g = i; }
      else if (i < 32) { f = (dd & b) | (~dd & c); g = (5 * i + 1) & 15; }
      else if (i < 48) { f = b ^ c ^ dd; g = (3 * i + 5) & 15; }
      else { f = c ^ (b | ~dd); g = (7 * i) & 15; }
      f = (f + a + MD5_K[i] + m[g]) | 0;
      a = dd; dd = c; c = b;
      b = (b + rotl(f, MD5_S[(i >> 4) * 4 + (i & 3)])) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += dd;
  }
  protected out() { return words(this.h, true); }
}

/* ───── SHA-1 ───── */

class Sha1 extends Blocks {
  private h = new Int32Array([0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476, 0xc3d2e1f0 | 0]);
  private w = new Int32Array(80);
  constructor() { super(64, 8); }
  protected compress(d: Uint8Array, o: number) {
    const w = this.w, h = this.h;
    for (let i = 0; i < 16; i++, o += 4) w[i] = be(d, o);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h[0], b = h[1], c = h[2], dd = h[3], e = h[4];
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (b & c) | (~b & dd); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ dd; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & dd) | (c & dd); k = 0x8f1bbcdc | 0; }
      else { f = b ^ c ^ dd; k = 0xca62c1d6 | 0; }
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0;
      e = dd; dd = c; c = rotl(b, 30); b = a; a = t;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += dd; h[4] += e;
  }
  protected out() { return words(this.h); }
}

/* ───── SHA-256 ───── */

const K256 = Int32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

class Sha256 extends Blocks {
  private h = Int32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  private w = new Int32Array(64);
  constructor() { super(64, 8); }
  protected compress(d: Uint8Array, o: number) {
    const w = this.w, h = this.h;
    for (let i = 0; i < 16; i++, o += 4) w[i] = be(d, o);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      w[i] = (w[i - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) + w[i - 7] + (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10))) | 0;
    }
    let a = h[0], b = h[1], c = h[2], dd = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (dd + t1) | 0; dd = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += dd; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  protected out() { return words(this.h); }
}

/* ───── SHA-384 / SHA-512: 64-bit words kept as (high, low) pairs of 32-bit ints, which is far faster than BigInt ───── */

// first 32 bits and last 32 bits of each 64-bit round constant, in order
const K512 = Int32Array.from([
  0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd, 0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc, 0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019, 0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
  0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe, 0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2, 0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1, 0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
  0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3, 0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65, 0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483, 0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
  0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210, 0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4, 0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725, 0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
  0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926, 0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df, 0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8, 0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
  0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001, 0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30, 0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910, 0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
  0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53, 0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8, 0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb, 0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
  0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60, 0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec, 0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9, 0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
  0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207, 0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178, 0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6, 0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
  0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493, 0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c, 0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a, 0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817,
]);

const IV512 = [0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1, 0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179];
const IV384 = [0xcbbb9d5d, 0xc1059ed8, 0x629a292a, 0x367cd507, 0x9159015a, 0x3070dd17, 0x152fecd8, 0xf70e5939, 0x67332667, 0xffc00b31, 0x8eb44a87, 0x68581511, 0xdb0c2e0d, 0x64f98fa7, 0x47b5481d, 0xbefa4fa4];

class Sha512 extends Blocks {
  private h: Int32Array; // hi0, lo0, hi1, lo1, ...
  private w = new Int32Array(160);
  constructor(iv: number[], private bytes: number) { super(128, 16); this.h = Int32Array.from(iv); }
  protected compress(d: Uint8Array, o: number) {
    const w = this.w, h = this.h;
    for (let i = 0; i < 32; i++, o += 4) w[i] = be(d, o);
    for (let i = 16; i < 80; i++) {
      // s0 = rotr1 ^ rotr8 ^ shr7 of w[i-15]; s1 = rotr19 ^ rotr61 ^ shr6 of w[i-2]
      const xh = w[2 * (i - 15)], xl = w[2 * (i - 15) + 1], yh = w[2 * (i - 2)], yl = w[2 * (i - 2) + 1];
      const s0h = ((xh >>> 1) | (xl << 31)) ^ ((xh >>> 8) | (xl << 24)) ^ (xh >>> 7);
      const s0l = ((xl >>> 1) | (xh << 31)) ^ ((xl >>> 8) | (xh << 24)) ^ ((xl >>> 7) | (xh << 25));
      const s1h = ((yh >>> 19) | (yl << 13)) ^ ((yl >>> 29) | (yh << 3)) ^ (yh >>> 6);
      const s1l = ((yl >>> 19) | (yh << 13)) ^ ((yh >>> 29) | (yl << 3)) ^ ((yl >>> 6) | (yh << 26));
      const lo = (w[2 * (i - 16) + 1] >>> 0) + (s0l >>> 0) + (w[2 * (i - 7) + 1] >>> 0) + (s1l >>> 0);
      w[2 * i + 1] = lo | 0;
      w[2 * i] = (w[2 * (i - 16)] + s0h + w[2 * (i - 7)] + s1h + Math.floor(lo / 4294967296)) | 0;
    }
    let ah = h[0], al = h[1], bh = h[2], bl = h[3], ch = h[4], cl = h[5], dh = h[6], dl = h[7];
    let eh = h[8], el = h[9], fh = h[10], fl = h[11], gh = h[12], gl = h[13], hh = h[14], hl = h[15];
    for (let i = 0; i < 80; i++) {
      // S1 = rotr14 ^ rotr18 ^ rotr41 of e
      const S1h = ((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23));
      const S1l = ((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23));
      const chh = (eh & fh) ^ (~eh & gh), chl = (el & fl) ^ (~el & gl);
      const l1 = (hl >>> 0) + (S1l >>> 0) + (chl >>> 0) + (K512[2 * i + 1] >>> 0) + (w[2 * i + 1] >>> 0);
      const t1l = l1 | 0;
      const t1h = (hh + S1h + chh + K512[2 * i] + w[2 * i] + Math.floor(l1 / 4294967296)) | 0;
      // S0 = rotr28 ^ rotr34 ^ rotr39 of a
      const S0h = ((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25));
      const S0l = ((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25));
      const mjh = (ah & bh) ^ (ah & ch) ^ (bh & ch), mjl = (al & bl) ^ (al & cl) ^ (bl & cl);
      const l2 = (S0l >>> 0) + (mjl >>> 0);
      const t2l = l2 | 0, t2h = (S0h + mjh + Math.floor(l2 / 4294967296)) | 0;
      hh = gh; hl = gl; gh = fh; gl = fl; fh = eh; fl = el;
      const le = (dl >>> 0) + (t1l >>> 0);
      el = le | 0; eh = (dh + t1h + Math.floor(le / 4294967296)) | 0;
      dh = ch; dl = cl; ch = bh; cl = bl; bh = ah; bl = al;
      const la = (t1l >>> 0) + (t2l >>> 0);
      al = la | 0; ah = (t1h + t2h + Math.floor(la / 4294967296)) | 0;
    }
    const v = [ah, al, bh, bl, ch, cl, dh, dl, eh, el, fh, fl, gh, gl, hh, hl];
    for (let i = 0; i < 16; i += 2) {
      const lo = (h[i + 1] >>> 0) + (v[i + 1] >>> 0);
      h[i + 1] = lo | 0;
      h[i] = (h[i] + v[i] + Math.floor(lo / 4294967296)) | 0;
    }
  }
  protected out() { return words(this.h).subarray(0, this.bytes); }
}

/* ───── CRC-32 ───── */

let crcTable: Int32Array | null = null;

class Crc32 implements Hasher {
  private crc = -1;
  update(data: Uint8Array) {
    if (!crcTable) {
      crcTable = new Int32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; }
    }
    let crc = this.crc;
    for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    this.crc = crc;
  }
  digest() { return words([~this.crc]); }
}

/* ───── the public bits ───── */

export const ALGOS = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512", "CRC-32"] as const;
export type Algo = (typeof ALGOS)[number];

/** Algorithms that have an HMAC (a CRC is not a cryptographic hash). */
export const HMAC_ALGOS: readonly Algo[] = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"];

export function createHasher(algo: Algo): Hasher {
  switch (algo) {
    case "MD5": return new Md5();
    case "SHA-1": return new Sha1();
    case "SHA-256": return new Sha256();
    case "SHA-384": return new Sha512(IV384, 48);
    case "SHA-512": return new Sha512(IV512, 64);
    case "CRC-32": return new Crc32();
  }
}

const BLOCK: Partial<Record<Algo, number>> = { "MD5": 64, "SHA-1": 64, "SHA-256": 64, "SHA-384": 128, "SHA-512": 128 };

/** HMAC (RFC 2104) on top of any of the block hashes, so it streams like the hash itself. */
export function createHmac(algo: Algo, key: Uint8Array): Hasher {
  const block = BLOCK[algo];
  if (!block) throw new Error(`${algo} has no HMAC`);
  let k = key;
  if (k.length > block) { const h = createHasher(algo); h.update(k); k = h.digest(); }
  const ipad = new Uint8Array(block).fill(0x36), opad = new Uint8Array(block).fill(0x5c);
  k.forEach((b, i) => { ipad[i] ^= b; opad[i] ^= b; });
  const inner = createHasher(algo);
  inner.update(ipad);
  return {
    update: (c) => inner.update(c),
    digest() {
      const outer = createHasher(algo);
      outer.update(opad);
      outer.update(inner.digest());
      return outer.digest();
    },
  };
}
