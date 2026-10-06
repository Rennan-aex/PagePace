import { describe, expect, it } from "vitest";
import { MAX_CER_CELLS, normalizeText, textCer } from "./metrics";

describe("normalizeText", () => {
  it("collapses every whitespace run into one space and trims", () => {
    expect(normalizeText("  a \t b\r\n c  ")).toBe("a b c");
  });

  it("treats a non-breaking space as a space", () => {
    expect(normalizeText("a\u00a0b")).toBe("a b");
  });

  it("removes the invisible soft hyphen", () => {
    expect(normalizeText(`co${String.fromCharCode(0x00ad)}operate`)).toBe("cooperate");
  });

  it("applies Unicode NFC so composed and decomposed accents match", () => {
    expect(normalizeText("e\u0301")).toBe("\u00e9");
  });

  it("keeps case and punctuation (they are real content)", () => {
    expect(normalizeText("Hello, World.")).toBe("Hello, World.");
    expect(normalizeText("Hello")).not.toBe(normalizeText("hello"));
  });
});

describe("textCer", () => {
  it("is 0 for identical texts", () => {
    const result = textCer("the same text", "the same text");
    expect(result).toEqual({ cer: 0, edits: 0, refChars: 13, hypChars: 13 });
  });

  it("is 0 when only whitespace and Unicode form differ", () => {
    expect(textCer("one two\nthree", "one   two three").cer).toBe(0);
    expect(textCer("a\u00a0b", "a b").cer).toBe(0);
    expect(textCer("e\u0301lan", "\u00e9lan").cer).toBe(0);
  });

  it("counts one substitution in 100 characters as 0.01", () => {
    const golden = "a".repeat(100);
    const extracted = `${"a".repeat(50)}b${"a".repeat(49)}`;
    const result = textCer(golden, extracted);
    expect(result.edits).toBe(1);
    expect(result.cer).toBeCloseTo(0.01, 10);
  });

  it("counts deletions and insertions relative to the golden length", () => {
    expect(textCer("abcdef", "abdef")).toEqual({
      cer: 1 / 6,
      edits: 1,
      refChars: 6,
      hypChars: 5,
    });
    expect(textCer("abc", "abxc")).toEqual({
      cer: 1 / 3,
      edits: 1,
      refChars: 3,
      hypChars: 4,
    });
  });

  it("scores an empty golden as 0 for nothing and 1 for any content", () => {
    expect(textCer("", "")).toEqual({ cer: 0, edits: 0, refChars: 0, hypChars: 0 });
    expect(textCer("", "invented")).toEqual({
      cer: 1,
      edits: 8,
      refChars: 0,
      hypChars: 8,
    });
  });

  it("reports a wrong case as one character error", () => {
    expect(textCer("Hello", "hello").edits).toBe(1);
    expect(textCer("Hello", "hello").cer).toBeCloseTo(0.2, 10);
  });

  it("is deterministic: the same inputs always give the same number", () => {
    const golden = "the quick brown fox jumps over the lazy dog";
    const extracted = "the quik brown fox jumps over the lazy dogg";
    expect(textCer(golden, extracted).cer).toBe(textCer(golden, extracted).cer);
    expect(textCer(golden, extracted).edits).toBe(2);
  });

  it("refuses a comparison above the cell ceiling instead of hanging", () => {
    expect(() => textCer("a".repeat(10), "b".repeat(10), { maxCells: 10 })).toThrow(
      /coverage\.pages/,
    );
    expect(MAX_CER_CELLS).toBeGreaterThan(0);
  });
});
