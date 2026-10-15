/** Hash helpers: the pieces that take bytes in chunks live in incremental.ts, the file/stream driver in engine.ts. */
import { ALGOS, HMAC_ALGOS, createHasher, createHmac, toHex, type Algo, type Hasher } from "./incremental";

export { ALGOS, HMAC_ALGOS };
export type { Algo };

export const SHA = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const;

const once = (h: Hasher, data: Uint8Array) => { h.update(data); return toHex(h.digest()); };
export const md5 = (data: Uint8Array) => once(createHasher("MD5"), data);
export const crc32 = (data: Uint8Array) => once(createHasher("CRC-32"), data);

/* WebCrypto only exists on secure origins (https or localhost). A home server reached as http://192.168.x.x has no crypto.subtle,
   so the SHA family has a plain implementation to fall back on. It is slower, so it is only used when it has to be. */
export const plainSha: Record<string, (d: Uint8Array) => string> = Object.fromEntries(SHA.map((a) => [a, (d: Uint8Array) => once(createHasher(a), d)]));

const subtle = (): SubtleCrypto | null => (typeof crypto !== "undefined" && crypto.subtle ? crypto.subtle : null);

/** One hash (or HMAC, with a key) of bytes already in memory. WebCrypto where it exists, the plain code otherwise. */
export async function digest(algo: Algo, data: Uint8Array, key?: Uint8Array): Promise<string> {
  const sc = subtle();
  if (sc && algo !== "MD5" && algo !== "CRC-32" && !(key && !key.length)) { // WebCrypto refuses an empty HMAC key, the plain code doesn't
    if (key) {
      const k = await sc.importKey("raw", key as BufferSource, { name: "HMAC", hash: algo }, false, ["sign"]);
      return toHex(new Uint8Array(await sc.sign("HMAC", k, data as BufferSource)));
    }
    return toHex(new Uint8Array(await sc.digest(algo, data as BufferSource)));
  }
  return once(key ? createHmac(algo, key) : createHasher(algo), data);
}

export async function digestAll(data: Uint8Array): Promise<Record<Algo, string>> {
  const out = {} as Record<Algo, string>;
  for (const a of ALGOS) out[a] = await digest(a, data);
  return out;
}

/** The hex part of a pasted hash: groups may be separated by spaces or colons, and "hash  filename" lines are fine. */
const cleanHash = (s: string) => {
  const tokens = s.trim().split(/\s+/);
  // "hash  filename": a first word that is a whole hash by its length ends the matter, so a filename that looks like hex
  // ("2024-03-09", "face") is not folded into it. A CRC-32 (8) is only taken alone when what follows is not another group of 8.
  const first = tokens[0].replace(/[:-]/g, "");
  if (tokens.length > 1 && /^[0-9a-fA-F]+$/.test(first)) {
    if ([32, 40, 64, 96, 128].includes(first.length)) return first.toLowerCase();
    if (first.length === 8 && tokens.length === 2 && !/^[0-9a-fA-F]{8}$/.test(tokens[1])) return first.toLowerCase();
  }
  if (tokens.length > 1 && !/^[0-9a-fA-F:-]+$/.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join("").replace(/[:-]/g, "").toLowerCase();
};

/** Compare to a pasted hash: ignores case, spaces, colons and a trailing filename. */
export const sameHash = (a: string, b: string) => cleanHash(a) !== "" && cleanHash(a) === cleanHash(b);

/** Guess the algorithm from the length of a pasted hash. */
export function guessAlgo(h: string): Algo | null {
  const n = cleanHash(h).length;
  return ({ 8: "CRC-32", 32: "MD5", 40: "SHA-1", 64: "SHA-256", 96: "SHA-384", 128: "SHA-512" } as Record<number, Algo>)[n] ?? null;
}
