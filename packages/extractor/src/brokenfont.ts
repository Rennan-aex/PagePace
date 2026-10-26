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
 * A second signature (ADR-084) catches a mapping that shifts glyphs onto
 * **ordinary letters** instead of leaving them unmapped: the Calibre-produced
 * `n1-pt-sofia` has an incomplete ToUnicode that turns the fi/fl ligatures
 * into "à" (0xE0 falls back to the default encoding), so the text reads
 * plausible but wrong and carries no U+FFFD nor private use character. What
 * betrays it is **"à" inside a word** (`\p{L}à\p{L}`) — Portuguese, English,
 * French and Spanish never write it (crase is a word of its own) — with a
 * floor of `BROKEN_FONT_MIN_INTERNAL_ACCENTS` occurrences per block and no
 * share gate (the "à" is rare inside a paragraph, so a share would never
 * fire; measured 0 false positives in 17 digital + 12 synthetic documents,
 * 44 blocks in the sofia). Both signatures feed `brokenFontText`, the one
 * predicate `buildBook` asks.
 *
 * Known limits: a mapping that shifts glyphs onto ordinary letters without
 * producing internal "à" (e.g. "fl"→"á", inseparable from the legitimate
 * Portuguese "á") stays undetected until another block of the document trips
 * the "à" rule; one or two stray private-use glyphs in an otherwise clean
 * paragraph are ignored by design (the floor plus the share are both
 * required); Catalan does write "à" inside words, so the second signature
 * would false-positive on a Catalan book (revisit with a language gate if
 * the corpus grows one).
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
/**
 * Internal "à" occurrences needed before a block counts as a common-letter
 * swap (ADR-084). Measured on the corpus: the sofia PDF has 44 blocks at ≥ 3,
 * the single typing slip "atràs" of the curinga dies at the floor, every
 * other digital and synthetic document has zero.
 */
export const BROKEN_FONT_MIN_INTERNAL_ACCENTS = 3;

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
/** "à" (U+00E0) between two letters — never legitimate in pt/en/fr/es. */
const INTERNAL_ACCENT = /\p{L}à\p{L}/gu;

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

/**
 * Counts the occurrences of "à" inside a word (`\p{L}à\p{L}`) in `text` —
 * the signature a Calibre-style ToUnicode swap leaves on common letters
 * (ADR-084). The crase of Portuguese ("à mesa") and a lone "à" never count.
 */
export function internalAccentSwaps(text: string): number {
  return text.match(INTERNAL_ACCENT)?.length ?? 0;
}

/** True when either signature of a broken font mapping is present in `text`. */
export function brokenFontText(text: string): boolean {
  return (
    brokenFontSignal(text).broken || internalAccentSwaps(text) >= BROKEN_FONT_MIN_INTERNAL_ACCENTS
  );
}
