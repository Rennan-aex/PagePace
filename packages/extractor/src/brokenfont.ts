/**
 * Broken font mapping detection (E3-T05 — layer 7, "saída").
 *
 * A PDF whose font has no usable `ToUnicode` map (or a broken one) reaches the
 * reader as scrambled text: the glyph codes survive, the letters do not. Two
 * signatures are reliable enough to count on — the **replacement character**
 * U+FFFD the pdf.js writes when a glyph has no unicode, and **private use
 * area** code points (U+E000–U+F8FF and the supplementary planes
 * U+F0000–U+FFFFD / U+100000–U+10FFFD), which real pt/en books never use.
 *
 * The rule is conservative on purpose: a block counts as broken only with
 * **both** a floor of suspect characters (`BROKEN_FONT_MIN_SUSPECT_CHARS`, a
 * dingbat or two is not a broken book) **and** a share of the non-whitespace
 * characters (`BROKEN_FONT_MIN_SUSPECT_SHARE`). The block keeps its text —
 * nothing is silently dropped — but carries `flags: ["broken-font-mapping"]`,
 * the reduced `BROKEN_FONT_CONFIDENCE` and the document-level warning code of
 * the same name (same contract as `ocr-text-layer`, ADR-019).
 *
 * Known limits: a mapping that shifts glyphs onto ordinary letters (plausible
 * looking, wrong) carries no signature here and stays undetected; one or two
 * stray private-use glyphs in an otherwise clean paragraph are ignored by
 * design (the floor plus the share are both required).
 */

/** `U+FFFD REPLACEMENT CHARACTER` — no unicode for the glyph. */
export const REPLACEMENT_CHARACTER = 0xfffd;
/** Start of the BMP private use area (U+E000). */
export const PRIVATE_USE_START = 0xe000;
/** End of the BMP private use area (U+F8FF). */
export const PRIVATE_USE_END = 0xf8ff;
/** Start of supplementary private use area A (U+F0000, plane 15). */
export const PRIVATE_USE_PLANE_15_START = 0xf0000;
/** End of supplementary private use area A (U+FFFFD). */
export const PRIVATE_USE_PLANE_15_END = 0xffffd;
/** Start of supplementary private use area B (U+100000, plane 16). */
export const PRIVATE_USE_PLANE_16_START = 0x100000;
/** End of supplementary private use area B (U+10FFFD). */
export const PRIVATE_USE_PLANE_16_END = 0x10fffd;

/** Value written to `Block.flags` and to `Book.extraction.warnings`. */
export const BROKEN_FONT_MAPPING = "broken-font-mapping";
/** Confidence cap of a block whose text came out of a broken font mapping. */
export const BROKEN_FONT_CONFIDENCE = 0.3;
/** Suspect characters needed before a block can count as broken (floor). */
export const BROKEN_FONT_MIN_SUSPECT_CHARS = 3;
/** Share of non-whitespace characters that must be suspect to flag a block. */
export const BROKEN_FONT_MIN_SUSPECT_SHARE = 0.05;

/** True for the replacement character and for the private use areas. */
export function isSuspectCodePoint(codePoint: number): boolean {
  if (codePoint === REPLACEMENT_CHARACTER) return true;
  return (
    (codePoint >= PRIVATE_USE_START && codePoint <= PRIVATE_USE_END) ||
    (codePoint >= PRIVATE_USE_PLANE_15_START && codePoint <= PRIVATE_USE_PLANE_15_END) ||
    (codePoint >= PRIVATE_USE_PLANE_16_START && codePoint <= PRIVATE_USE_PLANE_16_END)
  );
}

/** What `brokenFontSignal` measured on one block of text. */
export interface BrokenFontSignal {
  /** Characters with no unicode of their own (U+FFFD or private use). */
  suspectChars: number;
  /** Non-whitespace characters the share is measured against. */
  readableChars: number;
  /** `suspectChars / readableChars`, or 0 when there is nothing to measure. */
  share: number;
  /** True when both the floor and the share say the text is scrambled. */
  broken: boolean;
}

const WHITESPACE = /\s/u;

/** Counts the scrambled characters of `text` and says if the text is garbage. */
export function brokenFontSignal(text: string): BrokenFontSignal {
  let suspectChars = 0;
  let readableChars = 0;
  for (const character of text) {
    if (WHITESPACE.test(character)) continue;
    readableChars += 1;
    if (isSuspectCodePoint(character.codePointAt(0) ?? 0)) suspectChars += 1;
  }
  const share = readableChars === 0 ? 0 : suspectChars / readableChars;
  const broken =
    suspectChars >= BROKEN_FONT_MIN_SUSPECT_CHARS && share >= BROKEN_FONT_MIN_SUSPECT_SHARE;
  return { suspectChars, readableChars, share, broken };
}
