import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

const VECTORS: [string, string][] = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
  [
    "The quick brown fox jumps over the lazy dog",
    "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
  ],
];

describe("sha256Hex", () => {
  it.each(VECTORS)("matches the reference digest for %j", (input, expected) => {
    expect(sha256Hex(new TextEncoder().encode(input))).toBe(expected);
  });

  it("matches node:crypto for every length 0..200 (padding and bit length)", () => {
    for (let length = 0; length <= 200; length++) {
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index++) bytes[index] = (index * 31 + 7) % 256;
      expect(sha256Hex(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
  });

  it("matches node:crypto across block boundaries", () => {
    for (const length of [55, 56, 63, 64, 65, 119, 127, 128, 1000, 4096, 65_536]) {
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index++) bytes[index] = (index * 17 + index) % 256;
      expect(sha256Hex(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
  });

  it("returns lowercase hex of 64 characters", () => {
    expect(sha256Hex(new Uint8Array([1, 2, 3]))).toMatch(/^[0-9a-f]{64}$/);
  });
});
