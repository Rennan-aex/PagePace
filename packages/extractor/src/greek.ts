import type { Run } from "@pagepace/schema";

/**
 * Greek script tagging on runs (E5-T08 — layer 5, "estilos inline").
 *
 * A run whose every letter is Greek script and has at least
 * `GREEK_MIN_LETTERS` letters carries `lang: "grc"` — the obvious block of
 * a foreign quotation (`tagGreekRuns`). Letters are counted by Unicode
 * script (`\p{Script=Greek}`, Greek Extended included); digits, punctuation
 * and spaces never vote, so "Σωκράτης." is as tagged as "Σωκράτης". Latin is
 * never tagged: at the character level it is indistinguishable from the
 * document's own alphabet (ADR-066). The text of every run is untouched —
 * tagging is an annotation, never a rewrite.
 *
 * Calibration (corpus probe, 2026-10-18): real Greek quotations arrive as
 * pure runs with ≥ 3 letters (10 runs in `n3-pt-filosofia2`); physics books
 * carry lone Greek letters as math symbols (ρ, π, λ — below the floor) and
 * one mixed run diluted by the document alphabet. Known limits: a Greek
 * quotation typeset in the same run as the surrounding prose stays untagged
 * (not obvious by construction); the U+3D0/U+3D4 symbol-mapping artifacts
 * of `n1-pt-sofia` are Greek script but never a pure ≥ 3-letter run.
 */

/** BCP-47-ish tag written to `Run.lang` for an obvious Greek snippet. */
export const GREEK_LANG = "grc";
/** Minimum letters in a run before an all-Greek run counts as a block. */
export const GREEK_MIN_LETTERS = 3;

const LETTER = /\p{L}/u;
const GREEK_LETTER = /\p{Script=Greek}/u;

/** Script signal of one run: how many of its letters are Greek. */
export interface GreekSignal {
  letters: number;
  greekLetters: number;
  /** The run is an obvious block of Greek: all letters Greek, floor reached. */
  greek: boolean;
}

/**
 * Counts the letters of `text` and how many are Greek script. Whitespace,
 * punctuation and digits count toward neither total.
 */
export function greekScriptSignal(text: string): GreekSignal {
  let letters = 0;
  let greekLetters = 0;
  for (const character of text) {
    if (!LETTER.test(character)) continue;
    letters += 1;
    if (GREEK_LETTER.test(character)) greekLetters += 1;
  }
  return {
    letters,
    greekLetters,
    greek: greekLetters >= GREEK_MIN_LETTERS && greekLetters === letters,
  };
}

/**
 * The same runs with `lang: "grc"` on every obvious Greek block. Latin,
 * mixed and short runs come out untouched; the input is never mutated and
 * the text of every run is the text it received.
 */
export function tagGreekRuns(runs: readonly Run[]): Run[] {
  return runs.map((run) =>
    greekScriptSignal(run.text).greek ? { ...run, lang: GREEK_LANG } : run,
  );
}
