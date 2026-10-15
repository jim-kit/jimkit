import { createHash, createHmac as nodeHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ALGOS, HMAC_ALGOS, createHasher, createHmac, toHex, type Algo } from "../src/lib/incremental";
import { hashBlob, hashBytes } from "../src/lib/engine";
import { digest } from "../src/lib/hash";

const bytes = (s: string) => new TextEncoder().encode(s);
const nodeName = (a: Algo) => a.toLowerCase().replace("-", "");
const hexOf = (a: Algo, d: Uint8Array, chunks: number[]) => {
  const h = createHasher(a);
  let o = 0;
  for (const c of chunks) { h.update(d.subarray(o, o + c)); o += c; }
  h.update(d.subarray(o));
  return toHex(h.digest());
};
const sample = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255);

describe("incremental hashes", () => {
  it("match the published vectors, fed in one piece", () => {
    const run = (a: Algo, s: string) => hexOf(a, bytes(s), []);
    expect(run("MD5", "")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(run("MD5", "abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(run("SHA-1", "abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(run("SHA-256", "abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(run("SHA-384", "abc")).toBe("cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7");
    expect(run("SHA-512", "abc")).toBe("ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f");
    expect(run("CRC-32", "123456789")).toBe("cbf43926");
    expect(run("SHA-256", "a".repeat(1_000_000))).toBe("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"); // the million-a vector
  });

  it("give the same answer however the input is split, around every block boundary", () => {
    for (const a of ALGOS) {
      for (const n of [0, 1, 55, 56, 63, 64, 65, 111, 112, 119, 120, 127, 128, 129, 1000, 4097]) {
        const d = sample(n);
        const whole = a === "CRC-32" ? hexOf(a, d, []) : createHash(nodeName(a)).update(d).digest("hex");
        if (a !== "CRC-32") expect(hexOf(a, d, []), `${a} ${n}`).toBe(whole);
        for (const split of [[1], [63, 2], [64, 64], [127, 1, 200], [5, 5, 5, 5]]) expect(hexOf(a, d, split), `${a} ${n} ${split}`).toBe(whole);
      }
    }
  });

  it("HMAC matches RFC 4231 and Node, with short, block-sized and over-long keys", () => {
    // RFC 4231 test case 2
    const k = bytes("Jefe"), m = bytes("what do ya want for nothing?");
    const h = createHmac("SHA-256", k); h.update(m);
    expect(toHex(h.digest())).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    for (const a of HMAC_ALGOS) {
      for (const kl of [0, 4, 64, 65, 128, 129, 300]) {
        const key = sample(kl), d = sample(1000);
        const hm = createHmac(a, key);
        hm.update(d.subarray(0, 333)); hm.update(d.subarray(333));
        expect(toHex(hm.digest()), `${a} key ${kl}`).toBe(nodeHmac(nodeName(a), key).update(d).digest("hex"));
      }
    }
    expect(() => createHmac("CRC-32", k)).toThrow();
  });
});

describe("hashing a file", () => {
  const data = sample(300_000);
  const expected = (algos: Algo[]) => Object.fromEntries(algos.map((a) => [a, a === "CRC-32" ? hexOf(a, data, []) : createHash(nodeName(a)).update(data).digest("hex")]));

  it("gives the same hashes streamed as read whole", async () => {
    const algos: Algo[] = ["MD5", "SHA-1", "SHA-256", "SHA-512", "CRC-32"];
    const seen: number[] = [];
    const streamed = await hashBlob(new Blob([data]), { algos }, (f) => seen.push(f), 1000);
    expect(streamed).toEqual(expected(algos));
    expect(await hashBlob(new Blob([data]), { algos })).toEqual(expected(algos));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((f, i) => i === 0 || f >= seen[i - 1])).toBe(true);
    expect(seen[seen.length - 1]).toBeCloseTo(1, 5);
  });

  it("does HMAC both ways and leaves CRC-32 out of it", async () => {
    const key = bytes("secret");
    const want = nodeHmac("sha256", key).update(data).digest("hex");
    expect(await hashBlob(new Blob([data]), { algos: ["SHA-256", "CRC-32"], key }, undefined, 1000)).toEqual({ "SHA-256": want });
    expect(await hashBytes(data, { algos: ["SHA-256"], key })).toEqual({ "SHA-256": want });
    // WebCrypto rejects an empty key; an empty key is still a valid HMAC key
    expect(await digest("SHA-256", data, new Uint8Array(0))).toBe(nodeHmac("sha256", "").update(data).digest("hex"));
  });
});
