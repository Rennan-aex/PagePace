// Block confidence model (E7-T01 — REQ-EXT-13: every block carries a
// confidence 0–1 and the flags that explain it).
//
// Each doubt flag a block carries lowers its confidence by a fixed weight
// from CONFIDENCE_FLAG_WEIGHTS; the weights **add up**, so two independent
// doubts lower it further than either one alone. Structural flags (the
// sidebar of E6-T03) carry no weight: they say where the block sits, not
// how sure the extraction is. An unknown flag is ignored instead of guessed.
//
// Weight table (against the digital base 0.9 — weight = base − the
// historical single-flag confidence kept by each heuristic):
//
//   broken-font-mapping        0.6   text full of unmapped glyphs   (0.9 → 0.3)
//   call-without-note          0.2   sup call the notes never match (0.9 → 0.7)
//   note-without-call          0.2   note nobody calls              (0.9 → 0.7)
//   uncertain-caption          0.2   label accepted by one rule     (0.9 → 0.7)
//   uncertain-footnote         0.2   note accepted by one rule      (0.9 → 0.7)
//   uncertain-hyphen           0.2   hyphen site kept under doubt   (0.9 → 0.7)
//   uncertain-list             0.2   item accepted by the indent    (0.9 → 0.7)
//   uncertain-quote            0.2   quote accepted by the indent   (0.9 → 0.7)
//   sidebar                    0.0   structural, not doubt
//
// The OCR base (0.5) subtracts the same weights — a doubt on an OCR text
// layer makes the block less trustworthy, never more. The result is clamped
// at MIN_BLOCK_CONFIDENCE (the text exists even when every flag fires) and
// rounded so the same book always reports the same number. The `eval`
// measures the calibration with `confidence_calibration` (E7-T01).
import { BROKEN_FONT_MAPPING } from "./brokenfont";
import { UNCERTAIN_CAPTION_FLAG } from "./captions";
import { UNCERTAIN_FOOTNOTE_FLAG } from "./footnotes";
import { UNCERTAIN_HYPHEN_FLAG } from "./hyphen";
import { UNCERTAIN_LIST_FLAG } from "./lists";
import { CALL_WITHOUT_NOTE_FLAG, NOTE_WITHOUT_CALL_FLAG } from "./notelinks";
import { UNCERTAIN_QUOTE_FLAG } from "./quotes";
import { SIDEBAR_FLAG } from "./sidebars";

/** Confidence of every block of a digital document before any flag (E2-T05, ADR-042). */
export const BOOK_BLOCK_CONFIDENCE = 0.9;
/** Confidence base for documents whose text comes from an embedded OCR layer (ADR-019). */
export const OCR_TEXT_LAYER_CONFIDENCE = 0.5;
/** Lowest confidence a block can carry: the text exists even when every flag fires. */
export const MIN_BLOCK_CONFIDENCE = 0.1;
/** Decimal places kept in a block confidence (deterministic rounding). */
export const CONFIDENCE_DECIMALS = 2;

/**
 * How much each flag lowers the block confidence (E7-T01). Doubt flags weigh
 * `base − the heuristic's historical confidence`; structural flags weigh 0.
 */
export const CONFIDENCE_FLAG_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  [BROKEN_FONT_MAPPING]: 0.6,
  [CALL_WITHOUT_NOTE_FLAG]: 0.2,
  [NOTE_WITHOUT_CALL_FLAG]: 0.2,
  [UNCERTAIN_CAPTION_FLAG]: 0.2,
  [UNCERTAIN_FOOTNOTE_FLAG]: 0.2,
  [UNCERTAIN_HYPHEN_FLAG]: 0.2,
  [UNCERTAIN_LIST_FLAG]: 0.2,
  [UNCERTAIN_QUOTE_FLAG]: 0.2,
  [SIDEBAR_FLAG]: 0,
});

/**
 * Combined confidence of a block: its base minus the weights of its flags,
 * clamped at `MIN_BLOCK_CONFIDENCE` and rounded. A repeated flag counts
 * once; an unknown flag weighs nothing.
 */
export function blockConfidence(base: number, flags: readonly string[]): number {
  let penalty = 0;
  for (const flag of new Set(flags)) penalty += CONFIDENCE_FLAG_WEIGHTS[flag] ?? 0;
  const value = Math.max(MIN_BLOCK_CONFIDENCE, base - penalty);
  const factor = 10 ** CONFIDENCE_DECIMALS;
  return Math.round(value * factor) / factor;
}
