// Text metrics for the evaluation runner (E1-T06, ADR-035).
//
// Both sides of a comparison go through `normalizeText`, so `text_cer` only
// counts real character errors and never whitespace/Unicode artefacts of the
// PDF text layer. The metric is deterministic: same strings, same number.

import { normalizeForReader } from "@pagepace/extractor";

/** Invisible hyphen used to break words; never part of what the reader sees. */
export const SOFT_HYPHEN = String.fromCharCode(0x00ad);

/**
 * Brings both texts to the same shape before comparing (ADR-035, E3-T01):
 * the extractor's `normalizeForReader` (NFC, ligatures, soft hyphens,
 * control characters, non-breaking spaces, typographic quotes) plus
 * collapsing every whitespace run (space, tab, NBSP, newline) to one space
 * and trimming. Case and punctuation are kept: they are real content and a
 * wrong case is a real error.
 */
export function normalizeText(text: string): string {
  return normalizeForReader(text).replace(/\s+/g, " ").trim();
}

/**
 * Levenshtein distance over code points (two rows, `O(n·m)` time).
 *
 * The quadratic ceiling exists because a golden covering a whole book would
 * need ~10^11 cell updates. `maxCells` fails loudly instead of hanging (the
 * fix for a huge golden is `coverage.pages`, which is the documented format).
 */
export const MAX_CER_CELLS = 200_000_000;

function editDistance(a: readonly string[], b: readonly string[]): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  let previous = new Int32Array(m + 1);
  let current = new Int32Array(m + 1);
  for (let j = 0; j <= m; j++) previous[j] = j;

  for (let i = 1; i <= n; i++) {
    current[0] = i;
    const left = a[i - 1];
    for (let j = 1; j <= m; j++) {
      const cost = left === b[j - 1] ? 0 : 1;
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      const substitution = (previous[j - 1] ?? 0) + cost;
      current[j] = Math.min(deletion, insertion, substitution);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[m] ?? 0;
}

export interface CerResult {
  /** `edits / refChars`, 0 when both sides are empty (see `textCer`). */
  cer: number;
  edits: number;
  /** Length of the normalized golden text (the denominator). */
  refChars: number;
  /** Length of the normalized extracted text. */
  hypChars: number;
}

export interface CerOptions {
  /** Cell ceiling of the edit-distance table. Defaults to `MAX_CER_CELLS`. */
  maxCells?: number;
}

/**
 * Character error rate: `editDistance(golden, extracted) / len(golden)`.
 *
 * Both arguments are raw texts; normalization happens here so every caller
 * compares the same way. An empty golden scores 0 for an empty extraction and
 * 1 for anything else (the whole extraction would be invented content).
 */
export function textCer(
  reference: string,
  hypothesis: string,
  options: CerOptions = {},
): CerResult {
  const golden = [...normalizeText(reference)];
  const extracted = [...normalizeText(hypothesis)];
  const refChars = golden.length;
  const hypChars = extracted.length;

  if (refChars === 0) {
    return { cer: hypChars === 0 ? 0 : 1, edits: hypChars, refChars, hypChars };
  }

  const maxCells = options.maxCells ?? MAX_CER_CELLS;
  if (refChars * hypChars > maxCells) {
    throw new Error(
      `textCer: comparison too large (${refChars} x ${hypChars} characters, ` +
        `limit ${maxCells} cells). Limit the golden with "coverage.pages" ` +
        `or split it into smaller documents.`,
    );
  }

  const edits = editDistance(golden, extracted);
  return { cer: edits / refChars, edits, refChars, hypChars };
}

/**
 * Two boundaries closer than this many characters count as the same one
 * (E2-T04). The comparison happens on normalized text, so a correct split
 * lands exactly on the golden boundary; the window only forgives the handful
 * of characters a small text error shifts it by.
 */
export const PARA_BOUNDARY_WINDOW = 5;

export interface ParaBoundaryResult {
  /** `2 · precision · recall / (precision + recall)`, 1 when neither side splits. */
  f1: number;
  /** Boundaries found ÷ boundaries the extraction made. */
  precision: number;
  /** Boundaries found ÷ boundaries the golden declares. */
  recall: number;
  /** Boundaries of the golden the extraction also made (inside the window). */
  truePositives: number;
  /** Boundaries the extraction made that the golden does not have (over-splitting). */
  falseCuts: number;
  /** Boundaries the golden has that the extraction did not make (under-splitting). */
  falseMerges: number;
}

/**
 * Position of every boundary between segments, measured on the concatenated
 * normalized text: segment 0 starts at 0, segment `i` starts after the text
 * of segments 0..i-1. Both sides are measured this way, so a golden split
 * into 7 blocks and an extraction split into 7 paragraphs are compared on the
 * same character stream (inter-segment spaces are dropped on both sides).
 */
function boundaryOffsets(segments: readonly string[]): number[] {
  const offsets: number[] = [];
  let total = 0;
  segments.forEach((segment, index) => {
    if (index > 0) offsets.push(total);
    total += normalizeText(segment).length;
  });
  return offsets;
}

export interface ParaBoundaryOptions {
  /**
   * Indexes of the golden blocks that start a new page. The boundary right
   * before such a block is a page break and is left out of the reference.
   * Blocks without `origin` are never skipped (nothing is known about them).
   */
  referencePageBreaks?: readonly number[];
  /**
   * Indexes of the extracted paragraphs that start a new page. The boundary
   * right before such a paragraph is left out of the extraction too.
   *
   * Page breaks are out of scope on **both** sides on purpose: at the foot of
   * a page there is no spacing signal left to tell a paragraph that continues
   * from one that ended, so counting those boundaries would only measure a
   * guess. The join between pages belongs to the block builder (E2-T05) and
   * gets its own test there (ADR-041).
   */
  hypothesisPageBreaks?: readonly number[];
}

function pageBreakBoundaries(
  offsets: readonly number[],
  pageBreaks: readonly number[] | undefined,
): number[] {
  if (pageBreaks === undefined) return [...offsets];
  const skipped = new Set(pageBreaks);
  return offsets.filter((_, boundary) => !skipped.has(boundary + 1));
}

/**
 * F1 of the paragraph boundaries of an extraction against the golden (E2-T04,
 * `para_boundary_f1`): a boundary is *found* when a golden boundary and an
 * extracted one sit at most `PARA_BOUNDARY_WINDOW` characters apart. A
 * boundary the extraction invented is a false cut, a golden boundary it
 * skipped is a false merge — the two counts are the report of the acceptance.
 *
 * Only the boundaries are compared, never the characters: `text_cer` already
 * owns the text, this metric owns the segmentation. Both sides are normalized
 * (`normalizeText`), so line breaks, spacing and Unicode form never move a
 * boundary. Deterministic: same segments, same numbers.
 */
export function paraBoundaryF1(
  reference: readonly string[],
  hypothesis: readonly string[],
  options: ParaBoundaryOptions = {},
): ParaBoundaryResult {
  const golden = pageBreakBoundaries(boundaryOffsets(reference), options.referencePageBreaks);
  const extracted = pageBreakBoundaries(boundaryOffsets(hypothesis), options.hypothesisPageBreaks);

  let left = 0;
  let right = 0;
  let match = 0;
  while (left < golden.length && right < extracted.length) {
    // Both lists are sorted by position: whoever is further behind has no
    // partner left within the window, so it is counted as an error.
    const goldenOffset = golden[left] as number;
    const extractedOffset = extracted[right] as number;
    const distance = goldenOffset - extractedOffset;
    if (Math.abs(distance) <= PARA_BOUNDARY_WINDOW) {
      match++;
      left++;
      right++;
    } else if (distance < 0) {
      left++;
    } else {
      right++;
    }
  }

  const falseCuts = extracted.length - match;
  const falseMerges = golden.length - match;
  const precision = extracted.length === 0 ? 1 : match / extracted.length;
  const recall = golden.length === 0 ? 1 : match / golden.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { f1, precision, recall, truePositives: match, falseCuts, falseMerges };
}

export interface ReadingOrderResult {
  /** `1 - edits / max(reference, hypothesis)`, 1 when neither side has blocks. */
  score: number;
  /** Block edits the alignment needed (substitutions, insertions, deletions). */
  edits: number;
  /** Number of golden blocks compared. */
  referenceBlocks: number;
  /** Number of extracted blocks compared. */
  hypothesisBlocks: number;
}

export interface ReadingOrderOptions {
  /** Cell ceiling of the edit-distance table. Defaults to `MAX_CER_CELLS`. */
  maxCells?: number;
}

/**
 * Reading order (E2-T06, `reading_order`): how far the sequence of blocks the
 * extraction delivers is from the sequence the golden declares, as a
 * normalized edit distance turned into a score where 1 is perfect.
 *
 * Every block becomes one token — its normalized text — and the two token
 * sequences are aligned with the same Levenshtein table `textCer` uses, so a
 * block moved out of place, a block the extraction invented or a golden block
 * it skipped all cost one edit each. The score is
 * `1 - edits / max(reference, hypothesis)`: the normalizer is the longer of
 * the two sequences, which keeps the result inside `[0, 1]` no matter how
 * many blocks one side has more than the other.
 *
 * Text quality belongs to `text_cer` and segmentation to `para_boundary_f1`;
 * this metric answers the REQ-EXT-02 question — *in which order would the
 * reader see the blocks*. Deterministic: same sequences, same number.
 */
export function readingOrder(
  reference: readonly string[],
  hypothesis: readonly string[],
  options: ReadingOrderOptions = {},
): ReadingOrderResult {
  const golden = reference.map((block) => normalizeText(block));
  const extracted = hypothesis.map((block) => normalizeText(block));
  const referenceBlocks = golden.length;
  const hypothesisBlocks = extracted.length;
  const span = Math.max(referenceBlocks, hypothesisBlocks);

  if (span === 0) {
    return { score: 1, edits: 0, referenceBlocks, hypothesisBlocks };
  }

  const maxCells = options.maxCells ?? MAX_CER_CELLS;
  if (referenceBlocks * hypothesisBlocks > maxCells) {
    throw new Error(
      `readingOrder: comparison too large (${referenceBlocks} x ${hypothesisBlocks} blocks, ` +
        `limit ${maxCells} cells). Limit the golden with "coverage.pages" ` +
        `or split it into smaller documents.`,
    );
  }

  const edits = editDistance(golden, extracted);
  return { score: 1 - edits / span, edits, referenceBlocks, hypothesisBlocks };
}

export interface HeaderFooterResult {
  /** `2 · precision · recall / (precision + recall)`, 1 when neither side has lines. */
  f1: number;
  /** Removed lines that the golden also leaves out ÷ removed lines. */
  precision: number;
  /** Removed lines ÷ lines the golden leaves out. */
  recall: number;
  /** Lines the golden leaves out that the extraction also removed. */
  truePositives: number;
  /** Lines the golden leaves out that the extraction kept (missed removals). */
  missed: number;
  /** Lines the extraction removed although the golden has them (content lost). */
  overRemoved: number;
}

/**
 * Header/footer removal (E3-T02, `header_footer_f1`): precision and recall of
 * the lines the extractor takes out of the reading flow.
 *
 * Both sides are **keys** the runner composes as `"<page>:<normalized line
 * text>"`, so the same line on two pages counts twice (a region is judged per
 * page) and a line on the wrong page is an error. Two empty sides score 1 —
 * a document without repeated regions has nothing to remove and nothing that
 * was wrongly removed. Deterministic: same keys, same numbers.
 */
export function headerFooterF1(
  reference: readonly string[],
  hypothesis: readonly string[],
): HeaderFooterResult {
  const golden = new Set(reference.map((key) => normalizeText(key)));
  const extracted = new Set(hypothesis.map((key) => normalizeText(key)));

  let match = 0;
  for (const key of extracted) {
    if (golden.has(key)) match++;
  }

  const missed = golden.size - match;
  const overRemoved = extracted.size - match;
  const precision = extracted.size === 0 ? 1 : match / extracted.size;
  const recall = golden.size === 0 ? 1 : match / golden.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { f1, precision, recall, truePositives: match, missed, overRemoved };
}
