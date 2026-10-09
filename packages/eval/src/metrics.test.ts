import { describe, expect, it } from "vitest";
import {
  MAX_CER_CELLS,
  normalizeText,
  PARA_BOUNDARY_WINDOW,
  paraBoundaryF1,
  readingOrder,
  textCer,
} from "./metrics";

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

describe("paraBoundaryF1", () => {
  it("scores 1 when both sides split at the same places", () => {
    const result = paraBoundaryF1(
      ["first paragraph", "second one"],
      ["first paragraph", "second one"],
    );
    expect(result).toEqual({
      f1: 1,
      precision: 1,
      recall: 1,
      truePositives: 1,
      falseCuts: 0,
      falseMerges: 0,
    });
  });

  it("scores 1 when neither side splits", () => {
    expect(paraBoundaryF1(["one single block"], ["one single block"]).f1).toBe(1);
    expect(paraBoundaryF1(["one single block"], ["one single block"]).falseCuts).toBe(0);
  });

  it("counts a split the golden does not have as a false cut", () => {
    const result = paraBoundaryF1(["ab", "cd"], ["a", "b", "cd"]);
    expect(result.truePositives).toBe(1);
    expect(result.falseCuts).toBe(1);
    expect(result.falseMerges).toBe(0);
    expect(result.precision).toBeCloseTo(0.5, 10);
    expect(result.recall).toBe(1);
    expect(result.f1).toBeCloseTo(2 / 3, 10);
  });

  it("counts a golden boundary the extraction skipped as a false merge", () => {
    const result = paraBoundaryF1(["ab", "cd"], ["abcd"]);
    expect(result.truePositives).toBe(0);
    expect(result.falseCuts).toBe(0);
    expect(result.falseMerges).toBe(1);
    expect(result.f1).toBe(0);
  });

  it("places boundaries on normalized text, so spacing never moves them", () => {
    const result = paraBoundaryF1(
      ["line one\nline two", "second paragraph"],
      ["line  one   line two", "second\nparagraph"],
    );
    expect(result.f1).toBe(1);
  });

  it("forgives a boundary shifted by up to PARA_BOUNDARY_WINDOW characters", () => {
    expect(paraBoundaryF1(["0123456789", "x"], ["0123456789!!", "x"]).f1).toBe(1);
    const far = paraBoundaryF1(["0123456789", "x"], ["0123456789abcdefghij", "x"]);
    expect(far.f1).toBe(0);
    expect(far.falseCuts).toBe(1);
    expect(far.falseMerges).toBe(1);
    expect(PARA_BOUNDARY_WINDOW).toBe(5);
  });

  it("leaves a page break out of the comparison on both sides", () => {
    // A golden block that runs over the page break has no boundary there,
    // while the extraction always has one between two pages: skipping only
    // the extraction side would turn it into a lost golden boundary.
    const oneSided = paraBoundaryF1(
      ["page one block", "page two block"],
      ["page one block", "page two block"],
      { hypothesisPageBreaks: [1] },
    );
    expect(oneSided.falseMerges).toBe(1);
    expect(oneSided.falseCuts).toBe(0);
    expect(oneSided.f1).toBe(0);

    const both = paraBoundaryF1(
      ["page one block", "page two block"],
      ["page one block", "page two block"],
      { referencePageBreaks: [1], hypothesisPageBreaks: [1] },
    );
    expect(both).toEqual({
      f1: 1,
      precision: 1,
      recall: 1,
      truePositives: 0,
      falseCuts: 0,
      falseMerges: 0,
    });
  });

  it("keeps counting the boundaries inside a page", () => {
    const result = paraBoundaryF1(["first", "second", "third"], ["first", "second", "third"], {
      referencePageBreaks: [2],
      hypothesisPageBreaks: [2],
    });
    expect(result.truePositives).toBe(1);
    expect(result.f1).toBe(1);
  });
});

describe("readingOrder", () => {
  const golden = ["first block", "second block", "third block"];

  it("scores 1 when the extraction delivers the same order", () => {
    const result = readingOrder(golden, golden);
    expect(result).toEqual({ score: 1, edits: 0, referenceBlocks: 3, hypothesisBlocks: 3 });
  });

  it("compares normalized text, so spacing and Unicode form never move a block", () => {
    expect(readingOrder(["line one\nline two"], ["  line   one  line two "]).score).toBe(1);
    expect(readingOrder(["e\u0301lan"], ["\u00e9lan"]).score).toBe(1);
  });

  it("loses one edit per block moved out of place", () => {
    const swapped = readingOrder(["A", "B"], ["B", "A"]);
    expect(swapped.edits).toBe(2);
    expect(swapped.score).toBe(0);

    const reversed = readingOrder(golden, ["third block", "first block", "second block"]);
    expect(reversed.edits).toBe(2);
    expect(reversed.score).toBeCloseTo(1 - 2 / 3, 10);
  });

  it("drops when the two columns interleave (the case E6 has to fix)", () => {
    const reference = ["L1", "L2", "L3", "R1", "R2", "R3"];
    const interleaved = ["L1", "R1", "L2", "R2", "L3", "R3"];
    const result = readingOrder(reference, interleaved);
    expect(result.score).toBeLessThan(0.5);
    expect(result.score).toBeGreaterThan(0);
  });

  it("costs an extra block one edit, normalized by the longer side", () => {
    const split = readingOrder(["ab", "cd"], ["a", "b", "cd"]);
    expect(split.edits).toBe(2);
    expect(split.referenceBlocks).toBe(2);
    expect(split.hypothesisBlocks).toBe(3);
    expect(split.score).toBeCloseTo(1 - 2 / 3, 10);

    expect(readingOrder(["a", "b"], ["c", "d", "e", "f"]).score).toBe(0);
  });

  it("scores 1 for two empty sequences and 0 when only one side has blocks", () => {
    expect(readingOrder([], [])).toEqual({
      score: 1,
      edits: 0,
      referenceBlocks: 0,
      hypothesisBlocks: 0,
    });
    expect(readingOrder([], ["invented"]).score).toBe(0);
    expect(readingOrder(["gone"], []).score).toBe(0);
  });

  it("is deterministic: the same sequences always give the same number", () => {
    expect(readingOrder(golden, ["first block", "third block", "second block"]).score).toBe(
      readingOrder(golden, ["first block", "third block", "second block"]).score,
    );
  });

  it("refuses a comparison above the cell ceiling instead of hanging", () => {
    expect(() => readingOrder(["a", "b"], ["c", "d"], { maxCells: 3 })).toThrow(/coverage\.pages/);
    expect(MAX_CER_CELLS).toBeGreaterThan(0);
  });
});
