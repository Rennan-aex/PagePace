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

export interface HyphenJoinAccResult {
  /** `correct / total`, 1 when the extraction made no hyphen decision. */
  acc: number;
  /** Sites whose produced word the golden also holds. */
  correct: number;
  /** Hyphen sites the extraction decided. */
  total: number;
  /** Sites the extraction flagged `uncertain` (kept, but doubted). */
  uncertain: number;
}

/** Punctuation at the edges of a golden token never belongs to the word. */
const EDGE_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;

/**
 * Hyphenation join accuracy (E3-T03, `hyphen_join_acc`): the share of hyphen
 * sites where the word the extraction produced is a word the golden holds.
 *
 * A wrong join (`guardachuva`) and a wrong keep (`pala-vra`) both fail the
 * membership test, and a correct join (`palavra`) or keep (`guarda-chuva`)
 * both pass — one rule scores both directions. The golden side is the bag of
 * its tokens with edge punctuation stripped (`palavra,` → `palavra`), so a
 * comma after the word never hides a correct join. Deterministic: same site
 * words, same number.
 */
export function hyphenJoinAcc(
  golden: string,
  hypothesis: readonly { word: string; uncertain?: boolean }[],
): HyphenJoinAccResult {
  const words = new Set(
    normalizeText(golden)
      .split(" ")
      .filter((token) => token !== "")
      .map((token) => token.replace(EDGE_PUNCTUATION, "")),
  );
  let correct = 0;
  let uncertain = 0;
  for (const site of hypothesis) {
    if (site.uncertain === true) uncertain++;
    if (words.has(normalizeText(site.word))) correct++;
  }
  const total = hypothesis.length;
  return { acc: total === 0 ? 1 : correct / total, correct, total, uncertain };
}

/** One inline run of either side of the style comparison (golden or extraction). */
export interface StyleRunLike {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface StyleFlagResult {
  /** `2 · precision · recall / (precision + recall)`, 1 when no character is flagged. */
  f1: number;
  /** Flagged characters ÷ flagged characters of the extraction. */
  precision: number;
  /** Flagged characters ÷ flagged characters of the golden. */
  recall: number;
  /** Characters both sides flagged. */
  truePositives: number;
  /** Characters only the extraction flagged (invented or shifted style). */
  falsePositives: number;
  /** Characters only the golden flagged (missed style). */
  falseNegatives: number;
}

export interface StyleF1Result {
  /** Mean of the bold and italic F1 — the scalar the baseline stores. */
  f1: number;
  bold: StyleFlagResult;
  italic: StyleFlagResult;
  /** Characters compared position by position (the shorter stream). */
  comparedChars: number;
  /** Characters the golden has beyond the comparison (the longer stream won). */
  extraReferenceChars: number;
  /** Characters the extraction has beyond the comparison. */
  extraHypothesisChars: number;
}

interface LabeledChars {
  chars: string[];
  flags: boolean[];
}

/**
 * One character stream with a flag per character: blocks in order, each
 * block through the same normalization the other metrics use (`normalizeForReader`
 * + whitespace collapsed to single spaces, block edges trimmed), a space
 * carrying the flag of the run it came from.
 */
function labeledChars(
  blocks: readonly (readonly StyleRunLike[])[],
  flag: "bold" | "italic",
): LabeledChars {
  const chars: string[] = [];
  const flags: boolean[] = [];
  let previousSpace = true;
  for (const runs of blocks) {
    for (const run of runs) {
      const value = run[flag] === true;
      for (const char of normalizeForReader(run.text)) {
        if (/\s/.test(char)) {
          if (previousSpace) continue;
          chars.push(" ");
          flags.push(value);
          previousSpace = true;
          continue;
        }
        chars.push(char);
        flags.push(value);
        previousSpace = false;
      }
    }
    // A block boundary is always a space, whatever the run edges hold.
    if (!previousSpace) {
      chars.push(" ");
      flags.push(false);
      previousSpace = true;
    }
  }
  if (chars[chars.length - 1] === " ") {
    chars.pop();
    flags.pop();
  }
  return { chars, flags };
}

function flagCounts(
  reference: LabeledChars,
  hypothesis: LabeledChars,
): Omit<StyleFlagResult, "f1" | "precision" | "recall"> {
  const shared = Math.min(reference.flags.length, hypothesis.flags.length);
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  for (let index = 0; index < shared; index++) {
    const golden = reference.flags[index] === true;
    const extracted = hypothesis.flags[index] === true;
    if (golden && extracted) truePositives++;
    else if (extracted) falsePositives++;
    else if (golden) falseNegatives++;
  }
  for (let index = shared; index < reference.flags.length; index++) {
    if (reference.flags[index] === true) falseNegatives++;
  }
  for (let index = shared; index < hypothesis.flags.length; index++) {
    if (hypothesis.flags[index] === true) falsePositives++;
  }
  return { truePositives, falsePositives, falseNegatives };
}

function finishFlag(counts: Omit<StyleFlagResult, "f1" | "precision" | "recall">): StyleFlagResult {
  const { truePositives, falsePositives, falseNegatives } = counts;
  const total = 2 * truePositives + falsePositives + falseNegatives;
  const precision =
    truePositives + falsePositives === 0 ? 1 : truePositives / (truePositives + falsePositives);
  const recall =
    truePositives + falseNegatives === 0 ? 1 : truePositives / (truePositives + falseNegatives);
  return { f1: total === 0 ? 1 : (2 * truePositives) / total, precision, recall, ...counts };
}

/**
 * Inline style F1 per character (E4-T01, `style_f1`): bold and italic are
 * scored separately over the two character streams — golden blocks against
 * the blocks the `Book` builder emits — and the metric is the mean of the
 * two F1s. A character both sides flag is a hit, a character only one side
 * flags is an error, and a document with no flagged character on either
 * side scores 1 (nothing to find, nothing invented).
 *
 * The streams are compared **position by position** on the normalized text,
 * like the known limit of `reading_order` (ADR-043): a text error shifts the
 * stream and costs style too — with `text_cer = 0` the comparison is exact.
 * Deterministic: same runs, same numbers.
 */
export function styleF1(
  reference: readonly (readonly StyleRunLike[])[],
  hypothesis: readonly (readonly StyleRunLike[])[],
): StyleF1Result {
  const referenceBold = labeledChars(reference, "bold");
  const hypothesisBold = labeledChars(hypothesis, "bold");
  const bold = finishFlag(flagCounts(referenceBold, hypothesisBold));
  const italic = finishFlag(
    flagCounts(labeledChars(reference, "italic"), labeledChars(hypothesis, "italic")),
  );
  const shared = Math.min(referenceBold.chars.length, hypothesisBold.chars.length);
  return {
    f1: (bold.f1 + italic.f1) / 2,
    bold,
    italic,
    comparedChars: shared,
    extraReferenceChars: referenceBold.chars.length - shared,
    extraHypothesisChars: hypothesisBold.chars.length - shared,
  };
}

/** One heading of either side of the comparison (golden or extraction). */
export interface HeadingLike {
  text: string;
  /** Only meaningful when both sides declare it (schema: 1..6 for a heading). */
  level?: number;
}

/** A matched heading whose level did not agree. */
export interface HeadingLevelMismatch {
  text: string;
  expected: number | null;
  actual: number | null;
}

export interface HeadingDetectionResult {
  /** `2 · precision · recall / (precision + recall)`, 1 when neither side has headings. */
  f1: number;
  /** Headings found ÷ headings the extraction emitted. */
  precision: number;
  /** Headings found ÷ headings the golden declares. */
  recall: number;
  /** Matched headings whose level also matched ÷ matched headings, 1 when nothing matched on both sides. */
  levelAcc: number;
  /** Headings both sides declare, matched on their normalized text. */
  truePositives: number;
  /** Headings only the extraction emitted (false positives). */
  falsePositives: HeadingLike[];
  /** Headings only the golden declares (missed headings). */
  falseNegatives: HeadingLike[];
  /** Matched headings whose level disagrees. */
  levelMismatches: HeadingLevelMismatch[];
}

/**
 * Heading detection and levels (E4-T02, `heading_f1` / `heading_level_acc`):
 * precision and recall over the headings of each side, matched on their
 * normalized text (a multiset — the same title twice on both sides matches
 * twice). A heading the extraction invented is a false positive, one the
 * golden declares is missed, and a heading found at the wrong depth is a
 * level mismatch: `levelAcc` is the share of matched headings whose level
 * agreed. Two empty sides score 1 (nothing to find, nothing invented).
 * Deterministic: same headings, same numbers.
 */
export function headingDetection(
  reference: readonly HeadingLike[],
  hypothesis: readonly HeadingLike[],
): HeadingDetectionResult {
  const unmatched = new Map<string, HeadingLike[]>();
  for (const heading of reference) {
    const key = normalizeText(heading.text);
    const bucket = unmatched.get(key);
    if (bucket === undefined) unmatched.set(key, [heading]);
    else bucket.push(heading);
  }

  const falsePositives: HeadingLike[] = [];
  const falseNegatives: HeadingLike[] = [];
  const levelMismatches: HeadingLevelMismatch[] = [];
  let truePositives = 0;
  let levelMatches = 0;
  for (const heading of hypothesis) {
    const key = normalizeText(heading.text);
    const match = unmatched.get(key)?.shift();
    if (match === undefined) {
      falsePositives.push(heading);
      continue;
    }
    truePositives++;
    if (match.level === heading.level) {
      levelMatches++;
    } else {
      levelMismatches.push({
        text: key,
        expected: match.level ?? null,
        actual: heading.level ?? null,
      });
    }
  }
  for (const bucket of unmatched.values()) falseNegatives.push(...bucket);

  const precision = hypothesis.length === 0 ? 1 : truePositives / hypothesis.length;
  const recall = reference.length === 0 ? 1 : truePositives / reference.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const levelAcc =
    reference.length === 0 && hypothesis.length === 0
      ? 1
      : levelMatches / Math.max(truePositives, 1);
  return {
    f1,
    precision,
    recall,
    levelAcc,
    truePositives,
    falsePositives,
    falseNegatives,
    levelMismatches,
  };
}

/** One note call of either side of the comparison (golden or extraction). */
export interface NoteLinkLike {
  /** 1-based page the calling block starts on. */
  page: number;
  /** Label of the note the run calls (`"1"`, `"*"`). */
  label: string;
}

export interface FootnoteLinkResult {
  /** `2 · precision · recall / (precision + recall)`, 1 when neither side has links. */
  acc: number;
  /** Links found ÷ links the extraction emitted. */
  precision: number;
  /** Links found ÷ links the golden declares. */
  recall: number;
  /** Links both sides declare, matched on (page, label). */
  truePositives: number;
  /** Links only the extraction emitted (invented or mislabelled). */
  falsePositives: NoteLinkLike[];
  /** Links only the golden declares (missed links). */
  falseNegatives: NoteLinkLike[];
}

/**
 * Footnote call links (E5-T02, `footnote_link_acc`): precision and recall
 * over the note→call pairs of each side, matched on their key
 * `"<1-based page>:<label>"` — a multiset, so the same label twice on one
 * page counts twice when both sides agree. A link the extraction invented is
 * a false positive, one the golden declares is missed (the note was detected
 * but not linked, or linked to the wrong page or label). Two empty sides
 * score 1 — a document without notes has nothing to link and nothing was
 * invented. Deterministic: same pairs, same numbers.
 */
export function footnoteLinkAcc(
  reference: readonly NoteLinkLike[],
  hypothesis: readonly NoteLinkLike[],
): FootnoteLinkResult {
  const key = (link: NoteLinkLike): string => `${link.page}:${normalizeText(link.label)}`;
  const unmatched = new Map<string, NoteLinkLike[]>();
  for (const link of reference) {
    const bucket = unmatched.get(key(link));
    if (bucket === undefined) unmatched.set(key(link), [link]);
    else bucket.push(link);
  }

  const falsePositives: NoteLinkLike[] = [];
  const falseNegatives: NoteLinkLike[] = [];
  let truePositives = 0;
  for (const link of hypothesis) {
    const match = unmatched.get(key(link))?.shift();
    if (match === undefined) falsePositives.push(link);
    else truePositives++;
  }
  for (const bucket of unmatched.values()) falseNegatives.push(...bucket);

  const precision = hypothesis.length === 0 ? 1 : truePositives / hypothesis.length;
  const recall = reference.length === 0 ? 1 : truePositives / reference.length;
  const acc = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { acc, precision, recall, truePositives, falsePositives, falseNegatives };
}

/** One block of either side of the block-kind comparison. */
export interface BlockKindLike {
  text: string;
  kind: string;
}

/** F1 of a single block kind. */
export interface BlockKindScore {
  /** `2 · precision · recall / (precision + recall)`, 1 when neither side has this kind. */
  f1: number;
  precision: number;
  recall: number;
  truePositives: number;
  falsePositives: BlockKindLike[];
  falseNegatives: BlockKindLike[];
}

export interface BlockKindF1Result {
  /** Macro-average of the per-kind F1s over the kinds present on either side, 1 when neither side has blocks. */
  f1: number;
  /** F1 per block kind (heading, paragraph, blockquote, epigraph, footnote, endnote, list_item). */
  byKind: Map<string, BlockKindScore>;
}

/**
 * Block kind F1 (E5-T04, `block_kind_f1`): per-kind precision and recall over
 * the blocks of each side, matched on their normalized text (a multiset — the
 * same text twice on both sides matches twice). A block the extraction emitted
 * under a kind the golden does not declare is a false positive for that kind;
 * a golden block under a kind the extraction never emits is a missed one. The
 * metric is the **macro-average** of the per-kind F1s over the kinds present
 * on either side, so a single hard kind is not drowned by the easy ones. Two
 * empty sides score 1 (nothing to find, nothing invented). Deterministic:
 * same blocks, same numbers.
 */
export function blockKindF1(
  reference: readonly BlockKindLike[],
  hypothesis: readonly BlockKindLike[],
): BlockKindF1Result {
  const byKind = new Map<string, BlockKindScore>();
  const kinds = new Set<string>();
  for (const block of reference) kinds.add(block.kind);
  for (const block of hypothesis) kinds.add(block.kind);

  for (const kind of kinds) {
    const golden = reference.filter((block) => block.kind === kind);
    const extracted = hypothesis.filter((block) => block.kind === kind);
    const unmatched = new Map<string, number>();
    for (const block of golden) {
      const key = normalizeText(block.text);
      unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
    }

    const falsePositives: BlockKindLike[] = [];
    const falseNegatives: BlockKindLike[] = [];
    let truePositives = 0;
    for (const block of extracted) {
      const key = normalizeText(block.text);
      const count = unmatched.get(key) ?? 0;
      if (count > 0) {
        truePositives++;
        unmatched.set(key, count - 1);
      } else {
        falsePositives.push(block);
      }
    }
    for (const [key, count] of unmatched) {
      for (let index = 0; index < count; index++) {
        falseNegatives.push({ text: key, kind });
      }
    }

    const precision = extracted.length === 0 ? 1 : truePositives / extracted.length;
    const recall = golden.length === 0 ? 1 : truePositives / golden.length;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    byKind.set(kind, { f1, precision, recall, truePositives, falsePositives, falseNegatives });
  }

  let f1: number;
  if (byKind.size === 0) {
    f1 = 1;
  } else {
    let sum = 0;
    for (const score of byKind.values()) sum += score.f1;
    f1 = sum / byKind.size;
  }
  return { f1, byKind };
}

/** One extracted block with the confidence the `Book` reports for it. */
export interface ConfidenceBlockLike extends BlockKindLike {
  confidence: number;
}

/** How the confidence calibration of one document scored (E7-T01). */
export interface ConfidenceCalibrationResult {
  /**
   * Negated point-biserial correlation between `confidence` and the error
   * flag: 1 = every wrong block is less confident than every right one (or
   * nothing is wrong), 0 = confidence says nothing about the error,
   * negative = the wrong blocks are the confident ones.
   */
  score: number;
  /** Extracted blocks judged (the hypothesis side). */
  blocks: number;
  /** Blocks judged wrong — the false positives of the text+kind matching. */
  wrong: number;
  /** Mean confidence of the blocks judged right, `null` when there are none. */
  meanRight: number | null;
  /** Mean confidence of the blocks judged wrong, `null` when none is wrong. */
  meanWrong: number | null;
}

/**
 * Block confidence calibration (`confidence_calibration`, E7-T01): are the
 * blocks the extraction is unsure about the ones it got wrong?
 *
 * A block is **wrong** exactly when it is a false positive of the
 * `blockKindF1` matching — its `(kind, normalized text)` pair matches no
 * golden block (a multiset, the same rule as `block_kind_f1`, so the two
 * metrics always agree on what an error is). Golden blocks the extraction
 * missed carry no confidence and are not judged: calibration can only be
 * measured on the blocks the reader receives.
 *
 * The score is the **point-biserial correlation** between `confidence` and
 * the error flag (1 = wrong, 0 = right), negated so higher is better.
 * Conventions when the correlation is undefined: no wrong block scores 1
 * (nothing to doubt), every block wrong scores 0 (confidence separated
 * nothing), constant confidence with errors present scores 0 (no signal).
 * Deterministic: same blocks, same number.
 */
export function confidenceCalibration(
  reference: readonly BlockKindLike[],
  hypothesis: readonly ConfidenceBlockLike[],
): ConfidenceCalibrationResult {
  const unmatched = new Map<string, number>();
  for (const block of reference) {
    const key = JSON.stringify([block.kind, normalizeText(block.text)]);
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
  }

  const wrongFlags: boolean[] = [];
  let rightSum = 0;
  let rightCount = 0;
  let wrongSum = 0;
  let wrong = 0;
  for (const block of hypothesis) {
    const key = JSON.stringify([block.kind, normalizeText(block.text)]);
    const count = unmatched.get(key) ?? 0;
    if (count > 0) {
      unmatched.set(key, count - 1);
      wrongFlags.push(false);
      rightSum += block.confidence;
      rightCount++;
    } else {
      wrongFlags.push(true);
      wrongSum += block.confidence;
      wrong++;
    }
  }

  const blocks = hypothesis.length;
  const meanRight = rightCount === 0 ? null : rightSum / rightCount;
  const meanWrong = wrong === 0 ? null : wrongSum / wrong;

  let score: number;
  if (blocks === 0 || wrong === 0) {
    score = 1;
  } else if (wrong === blocks) {
    score = 0;
  } else {
    const meanConfidence = (rightSum + wrongSum) / blocks;
    const meanError = wrong / blocks;
    let covariance = 0;
    let varianceConfidence = 0;
    let varianceError = 0;
    hypothesis.forEach((block, index) => {
      const error = wrongFlags[index] === true ? 1 : 0;
      const dConfidence = block.confidence - meanConfidence;
      const dError = error - meanError;
      covariance += dConfidence * dError;
      varianceConfidence += dConfidence * dConfidence;
      varianceError += dError * dError;
    });
    const denominator = Math.sqrt(varianceConfidence * varianceError);
    // Constant confidence with errors present: the model had no signal.
    score = denominator === 0 ? 0 : -covariance / denominator;
  }

  return { score, blocks, wrong, meanRight, meanWrong };
}

export interface SentenceF1Result {
  /** `2 · precision · recall / (precision + recall)`, 1 when neither side breaks. */
  f1: number;
  /** Boundaries found ÷ boundaries the segmenter made. */
  precision: number;
  /** Boundaries found ÷ boundaries the annotation declares. */
  recall: number;
  /** Break offsets both sides agree on. */
  truePositives: number;
  /** Break offsets the segmenter made that the annotation does not have. */
  falsePositives: number;
  /** Break offsets the annotation has that the segmenter did not make. */
  falseNegatives: number;
  /** The false positives, ascending, for the report. */
  invented: number[];
  /** The false negatives, ascending, for the report. */
  missed: number[];
}

/**
 * F1 of the sentence breaks of a segmenter run against the annotated corpus
 * (SEG-T05, `sentence_f1`): a break is a character offset where one sentence
 * ends and the next one starts, and the two sides are compared exactly. A
 * break the segmenter invented is a false positive (over-splitting), an
 * annotated break it skipped is a false negative (under-splitting) — the two
 * counts are the report of the acceptance.
 *
 * Both arrays must be sorted and must leave the break at the very end of the
 * text out (it is implied by the text, not decided): the caller passes the
 * trimmed ends of every span but the last. Empty sides score 1 (two empty
 * sides agree), the convention of `paraBoundaryF1`.
 */
export function sentenceF1(
  reference: readonly number[],
  hypothesis: readonly number[],
): SentenceF1Result {
  const invented: number[] = [];
  const missed: number[] = [];
  let left = 0;
  let right = 0;
  let match = 0;
  while (left < reference.length && right < hypothesis.length) {
    const referenceOffset = reference[left] as number;
    const hypothesisOffset = hypothesis[right] as number;
    if (referenceOffset === hypothesisOffset) {
      match++;
      left++;
      right++;
    } else if (referenceOffset < hypothesisOffset) {
      missed.push(referenceOffset);
      left++;
    } else {
      invented.push(hypothesisOffset);
      right++;
    }
  }
  while (left < reference.length) missed.push(reference[left++] as number);
  while (right < hypothesis.length) invented.push(hypothesis[right++] as number);

  const precision = hypothesis.length === 0 ? 1 : match / hypothesis.length;
  const recall = reference.length === 0 ? 1 : match / reference.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    f1,
    precision,
    recall,
    truePositives: match,
    falsePositives: invented.length,
    falseNegatives: missed.length,
    invented,
    missed,
  };
}
