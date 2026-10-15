import { describe, expect, it } from "vitest";
import { crc32, digest, guessAlgo, md5, plainSha, sameHash } from "../src/lib/hash";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("hashes", () => {
  it("matches the published test vectors", async () => {
    expect(md5(bytes(""))).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5(bytes("abc"))).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5(bytes("a".repeat(1000)))).toBe("cabe45dcc9ae5b66ba86600cca6b8ba8");
    expect(crc32(bytes("123456789"))).toBe("cbf43926");
    expect(await digest("SHA-1", bytes("abc"))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(await digest("SHA-256", bytes("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("the plain-code SHA agrees with WebCrypto on every size around the block boundaries", async () => {
    for (const algo of ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const) {
      for (const n of [0, 1, 55, 56, 63, 64, 65, 111, 112, 119, 120, 127, 128, 129, 1000, 4097]) {
        const data = Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255);
        const expected = Array.from(new Uint8Array(await crypto.subtle.digest(algo, data)), (x) => x.toString(16).padStart(2, "0")).join("");
        expect(plainSha[algo](data), `${algo} ${n}`).toBe(expected);
      }
    }
  });

  it("compares and recognises pasted hashes", () => {
    expect(sameHash("BA78 16BF:8F01", "ba7816bf8f01")).toBe(true);
    expect(sameHash("abc  file.iso", "ABC")).toBe(true);
    expect(sameHash("", "")).toBe(false);
    expect(guessAlgo("d41d8cd98f00b204e9800998ecf8427e")).toBe("MD5");
    expect(guessAlgo("a".repeat(64))).toBe("SHA-256");
    expect(guessAlgo("zz")).toBeNull();
  });
});
