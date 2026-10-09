/**
 * Unicode normalization (E3-T01 - REQ-EXT-18, layer 7 "saida").
 *
 * PDFs carry typography as the producer wrote it, not as the reader
 * should see it: ligature glyphs (U+FB00..U+FB04), soft hyphens (U+00AD)
 * that only mark a line break, non-breaking spaces, typographic quote
 * variants and stray control characters. This module folds every one of
 * those shapes to a single ASCII/NFC form so the Book text is stable
 * across producers and the evaluation never counts encoding artefacts as
 * errors.
 *
 * Rules (in order):
 * 1. NFC - composed form, so combining marks (e + U+0301) become U+00E9.
 * 2. Ligatures - the five standard f-ligatures expand to plain letters.
 * 3. Soft hyphen - removed; discretionary break marker, never visible.
 * 4. Tab becomes a space; newline is kept (line markers of page text).
 * 5. Control characters - remaining C0, C1 and DEL are removed.
 * 6. For the reader (normalizeForReader, used by buildBook):
 *    non-breaking spaces (NBSP U+00A0, figure space U+2007, narrow NBSP
 *    U+202F) become a regular space and typographic quotes fold to ASCII
 *    apostrophe/double-quote. Spacing accents (acute, grave, tilde,
 *    circumflex as standalone glyphs) are not touched: they are real
 *    characters (and the LaTeX accent case is E3-T01b).
 *
 * Whitespace runs are not collapsed here (that is the evaluation
 * normalizer job); this function only folds character identity.
 * Deterministic and idempotent: normalizeUnicode(normalizeUnicode(x)) ===
 * normalizeUnicode(x).
 */

/** Invisible hyphen used to break words; never part of what the reader sees. */
export const SOFT_HYPHEN = "­";

/** The five standard f-ligatures, expanded to plain letters. */
const LIGATURES: Readonly<Record<string, string>> = {
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
};

/** Typographic quote variants folded to the ASCII marks. */
const QUOTES: Readonly<Record<string, string>> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
};

/** Non-breaking space variants folded to a regular space. */
const NON_BREAKING_SPACES: Readonly<Record<string, string>> = {
  " ": " ",
  " ": " ",
  " ": " ",
};

/**
 * C0 controls except newline (kept: line markers of the page text) and tab
 * (mapped to a space earlier); plus DEL and the C1 block.
 */
function isControlCode(code: number): boolean {
  if (code <= 0x08) return true;
  if (code === 0x0b || code === 0x0c) return true;
  if (code >= 0x0e && code <= 0x1f) return true;
  if (code >= 0x7f && code <= 0x9f) return true;
  return false;
}

function replaceAll(text: string, table: Readonly<Record<string, string>>): string {
  let output = "";
  for (const char of text) output += table[char] ?? char;
  return output;
}

function stripControls(text: string): string {
  let output = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (!isControlCode(code)) output += char;
  }
  return output;
}

/** Folds PDF typography (NFC, ligatures, soft hyphen, controls) to one form. */
export function normalizeUnicode(text: string): string {
  return stripControls(
    replaceAll(text.normalize("NFC"), LIGATURES).split(SOFT_HYPHEN).join("").replace(/\t/g, " "),
  );
}

/** Same folding plus quotes and non-breaking spaces (the Book run form). */
export function normalizeForReader(text: string): string {
  return replaceAll(replaceAll(normalizeUnicode(text), NON_BREAKING_SPACES), QUOTES);
}
