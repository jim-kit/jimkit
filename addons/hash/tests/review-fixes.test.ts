import { describe, expect, it } from "vitest";
import { sameHash } from "../src/lib/hash";

const md5 = "d41d8cd98f00b204e9800998ecf8427e";
describe("comparing with a pasted checksum line", () => {
  it("ignores a filename, even one made of hex digits or numerals", () => {
    for (const name of ["backup", "2024-03-09", "face", "deadbeef.iso", "*notes.txt"]) expect(sameHash(`${md5}  ${name}`, md5), name).toBe(true);
  });
  it("still reads a hash written in groups", () => {
    expect(sameHash("d41d8cd9 8f00b204 e9800998 ecf8427e", md5)).toBe(true);
    expect(sameHash("D4:1D:8C:D9:8F:00:B2:04:E9:80:09:98:EC:F8:42:7E", md5)).toBe(true);
  });
  it("takes a CRC-32 with a filename", () => {
    expect(sameHash("cbf43926  check.txt", "cbf43926")).toBe(true);
  });
  it("a different hash is different", () => {
    expect(sameHash(`${md5.replace("d4", "d5")}  x`, md5)).toBe(false);
  });
});
