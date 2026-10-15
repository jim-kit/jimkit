/** Hashes a Blob or bytes with the chosen algorithms (or HMACs, with a key), reporting progress. Runs in the hash worker. */
import { ALGOS, createHasher, createHmac, toHex, type Algo, type Hasher } from "./incremental";
import { digest } from "./hash";

export type Results = Partial<Record<Algo, string>>;
export interface Job { algos: Algo[]; key?: Uint8Array }

/** Files up to this size are read once and hashed with WebCrypto where it exists; bigger ones stream through the plain code. */
export const IN_MEMORY_MAX = 64 * 1024 * 1024;
const SLICE = 1024 * 1024;

const make = (algo: Algo, key?: Uint8Array): Hasher => (key ? createHmac(algo, key) : createHasher(algo));

/** Feed one buffer through a hasher a slice at a time, so a long hash can report progress. */
function feed(h: Hasher, data: Uint8Array, onBytes: (n: number) => void) {
  for (let o = 0; o < data.length; o += SLICE) { const part = data.subarray(o, Math.min(data.length, o + SLICE)); h.update(part); onBytes(part.length); }
}

export async function hashBytes(data: Uint8Array, job: Job, onProgress?: (fraction: number) => void): Promise<Results> {
  const out: Results = {};
  const algos = ALGOS.filter((a) => job.algos.includes(a) && (!job.key || a !== "CRC-32"));
  const work = Math.max(1, data.length * algos.length);
  let done = 0;
  const hasCrypto = typeof crypto !== "undefined" && !!crypto.subtle;
  for (const a of algos) {
    if (hasCrypto && a !== "MD5" && a !== "CRC-32") { out[a] = await digest(a, data, job.key); done += data.length; }
    else { const h = make(a, job.key); feed(h, data, (n) => { done += n; onProgress?.(done / work); }); out[a] = toHex(h.digest()); }
    onProgress?.(done / work);
  }
  return out;
}

export async function hashBlob(blob: Blob, job: Job, onProgress?: (fraction: number) => void, memoryMax = IN_MEMORY_MAX): Promise<Results> {
  if (blob.size <= memoryMax) return hashBytes(new Uint8Array(await blob.arrayBuffer()), job, onProgress);
  // too big to hold: one pass over the stream, every selected algorithm fed the same chunks
  const algos = ALGOS.filter((a) => job.algos.includes(a) && (!job.key || a !== "CRC-32"));
  const hashers = algos.map((a) => make(a, job.key));
  const reader = blob.stream().getReader();
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const h of hashers) h.update(value);
    read += value.length;
    onProgress?.(read / blob.size);
  }
  const out: Results = {};
  algos.forEach((a, i) => { out[a] = toHex(hashers[i].digest()); });
  return out;
}
