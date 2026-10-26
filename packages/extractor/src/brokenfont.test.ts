import { describe, expect, it } from "vitest";
import {
  BROKEN_FONT_CONFIDENCE,
  BROKEN_FONT_MAPPING,
  BROKEN_FONT_MIN_INTERNAL_ACCENTS,
  BROKEN_FONT_MIN_SUSPECT_CHARS,
  BROKEN_FONT_MIN_SUSPECT_SHARE,
  brokenFontSignal,
  brokenFontText,
  internalAccentSwaps,
  isSuspectCodePoint,
} from "./brokenfont";

const FFFD = String.fromCharCode(0xfffd);
const PUA = (codePoint: number): string => String.fromCodePoint(codePoint);

describe("isSuspectCodePoint", () => {
  it("flags the replacement character and the three private use areas", () => {
    expect(isSuspectCodePoint(0xfffd)).toBe(true);
    expect(isSuspectCodePoint(0xe000)).toBe(true);
    expect(isSuspectCodePoint(0xf8ff)).toBe(true);
    expect(isSuspectCodePoint(0xf0000)).toBe(true);
    expect(isSuspectCodePoint(0xffffd)).toBe(true);
    expect(isSuspectCodePoint(0x100000)).toBe(true);
    expect(isSuspectCodePoint(0x10fffd)).toBe(true);
  });

  it("never flags letters, digits, punctuation, ligatures, greek or emoji", () => {
    const legitimate = [
      0x41, // A
      0xe7, // ç
      0xc1, // Á
      0x3b1, // α
      0x3a9, // Ω
      0x30, // 0
      0x2e, // .
      0x20, // space
      0xfb01, // ﬁ ligature
      0x2014, // em dash
      0x2764, // heart dingbat
      0x1f600, // emoji (astral, not private use)
    ];
    for (const codePoint of legitimate) {
      expect(isSuspectCodePoint(codePoint)).toBe(false);
    }
  });

  it("stops exactly at the private use area edges", () => {
    expect(isSuspectCodePoint(0xdfff)).toBe(false);
    expect(isSuspectCodePoint(0xf900)).toBe(false);
    expect(isSuspectCodePoint(0xeffff)).toBe(false);
    expect(isSuspectCodePoint(0x110000)).toBe(false);
  });
});

describe("brokenFontSignal", () => {
  it("reports nothing on ordinary pt/en/greek text", () => {
    const signal = brokenFontSignal("O coração não sabe de nada — the heart knows. αβγ");
    expect(signal.suspectChars).toBe(0);
    expect(signal.readableChars).toBe(39);
    expect(signal.share).toBe(0);
    expect(signal.broken).toBe(false);
  });

  it("flags a block whose text is mostly the replacement character", () => {
    const signal = brokenFontSignal(`${FFFD}${FFFD}${FFFD}${FFFD}${FFFD} ABCD`);
    expect(signal.suspectChars).toBe(5);
    expect(signal.readableChars).toBe(9);
    expect(signal.share).toBeCloseTo(5 / 9);
    expect(signal.broken).toBe(true);
  });

  it("flags private use characters, supplementary planes included", () => {
    const bmp = brokenFontSignal(`${PUA(0xe001)}${PUA(0xe002)}${PUA(0xe003)}${PUA(0xe004)}`);
    expect(bmp.broken).toBe(true);
    const astral = brokenFontSignal(`${PUA(0xf0001)}${PUA(0x100001)}${PUA(0x100002)}AB`);
    expect(astral.suspectChars).toBe(3);
    expect(astral.broken).toBe(true);
  });

  it("ignores a couple of stray glyphs inside a long paragraph", () => {
    const stray = `A paragraph of ordinary book text with one ${PUA(0xe022)} glyph and ${FFFD} beside it.`;
    const signal = brokenFontSignal(stray);
    expect(signal.suspectChars).toBe(2);
    expect(signal.broken).toBe(false);
  });

  it("needs the absolute floor even when the share is high", () => {
    expect(BROKEN_FONT_MIN_SUSPECT_CHARS).toBe(3);
    const short = brokenFontSignal(`${PUA(0xe001)}${PUA(0xe002)}AB`);
    expect(short.share).toBe(0.5);
    expect(short.broken).toBe(false);
  });

  it("needs the share even when the floor is reached", () => {
    expect(BROKEN_FONT_MIN_SUSPECT_SHARE).toBe(0.05);
    const diluted = brokenFontSignal(
      `${PUA(0xe001)}${PUA(0xe002)}${PUA(0xe003)}${"a".repeat(100)}`,
    );
    expect(diluted.suspectChars).toBe(3);
    expect(diluted.share).toBeLessThan(BROKEN_FONT_MIN_SUSPECT_SHARE);
    expect(diluted.broken).toBe(false);
  });

  it("does not count whitespace toward the share", () => {
    const spaced = brokenFontSignal(
      `${PUA(0xe001)} ${PUA(0xe002)}   ${PUA(0xe003)}\n${PUA(0xe004)}`,
    );
    expect(spaced.readableChars).toBe(4);
    expect(spaced.share).toBe(1);
    expect(spaced.broken).toBe(true);
  });

  it("reports an empty text as clean", () => {
    expect(brokenFontSignal("")).toEqual({
      suspectChars: 0,
      readableChars: 0,
      share: 0,
      broken: false,
    });
  });

  it("keeps the warning code and the confidence cap as named constants", () => {
    expect(BROKEN_FONT_MAPPING).toBe("broken-font-mapping");
    expect(BROKEN_FONT_CONFIDENCE).toBeLessThan(0.9);
  });

  it("is pure and deterministic", () => {
    const text = `texto ${PUA(0xe010)}${PUA(0xe011)}${PUA(0xe012)}${PUA(0xe013)}${FFFD}`;
    expect(brokenFontSignal(text)).toEqual(brokenFontSignal(text));
    expect(text).toContain(PUA(0xe010));
  });
});

describe("internalAccentSwaps", () => {
  it("counts à inside words — the Calibre ligature swap of the sofia PDF (ADR-084)", () => {
    // "Sofia"→"Soàa", "mais"→"maàs", "paços"→"paàos": letter+à+letter.
    expect(internalAccentSwaps("Soàa maàe paàos")).toBe(3);
    // The leading à of "ànal" never counts; two swaps in "càràter" cannot
    // overlap (the r of "càr" is already consumed), so the word counts 1.
    expect(internalAccentSwaps("ànal do càràter")).toBe(1);
  });

  it("ignores the legitimate Portuguese crase and a lone à", () => {
    expect(internalAccentSwaps("A menina foi à praia e voltou à casa.")).toBe(0);
    expect(internalAccentSwaps("à")).toBe(0);
    expect(internalAccentSwaps("à mesa do jantar, à noite.")).toBe(0);
  });

  it("ignores à behind punctuation, digits or whitespace", () => {
    expect(internalAccentSwaps("(à) 1à2 a à b à-à")).toBe(0);
  });

  it("counts only the lowercase à, the swap the Calibre map emits", () => {
    expect(internalAccentSwaps("ÀCASA ÀMESA ÀNOS")).toBe(0);
  });

  it("keeps the floor as a named constant of 3", () => {
    expect(BROKEN_FONT_MIN_INTERNAL_ACCENTS).toBe(3);
  });

  it("is pure and deterministic", () => {
    expect(internalAccentSwaps("Soàa maàe paàos")).toBe(internalAccentSwaps("Soàa maàe paàos"));
  });
});

describe("brokenFontText", () => {
  it("is true for the FFFD/PUA signature alone", () => {
    expect(brokenFontText(`${FFFD}${FFFD}${FFFD}${FFFD}${FFFD} ABCD`)).toBe(true);
  });

  it("is true for three internal à without any unmapped glyph", () => {
    expect(brokenFontText("O càràter dasà coàas doànal fim.")).toBe(true);
  });

  it("stays false below the floor of internal à", () => {
    expect(brokenFontText("Soàa e ànal nada mais.")).toBe(false);
  });

  it("stays false on ordinary text", () => {
    expect(brokenFontText("O coração não sabe de nada — the heart knows. αβγ")).toBe(false);
  });
});
