// Raw text of a `RawDocument`, concatenated for the `text_cer` metric
// (E1-T06). This is deliberately the *dumbest* possible reading of the PDF
// text layer: no word reconstruction, no reading order — those arrive with
// E2/E3 and are measured by their own metrics (docs/extractor/EVALUATION.md).
//
// The gaps between items became the real space inference of E2-T03: the rule
// itself lives in the extractor core (`itemsText`/`spaceBetween`,
// `SPACE_GAP_FACTOR`), so the metric measures the same spaces the extraction
// will ship in the `Book`.
//
// Repeated regions (E3-T02) follow the same principle: the running heads,
// feet and page numbers leave the text here, through the extractor's own
// `stripRepeatedRegions`, so `text_cer` measures the flow the reader gets.
//
// Hyphenation (E3-T03) too: a word the typesetter broke with a line-end
// hyphen is glued back through the extractor's own `joinHyphenatedText`, so
// `text_cer` never counts a typesetting hyphen as a character error.
import { itemsText, joinHyphenatedText, stripRepeatedRegions } from "@pagepace/extractor";
import type { RawDocument, RawPage } from "@pagepace/schema";

/** Concatenates the items of one page (line ends become `\n`, gaps become spaces). */
export function pageText(page: RawPage): string {
  return itemsText(page.items);
}

/**
 * Text of the whole document (or of the given pages, 1-based — the unit used
 * by `coverage.pages` in a golden). Pages are joined with `\n`. Repeated
 * regions are stripped first (once) and line-end hyphens are joined inside
 * each page, exactly as the `Book` builder does.
 */
export function documentText(document: RawDocument, pages?: readonly number[] | null): string {
  const clean = stripRepeatedRegions(document).document;
  const wanted = pages ? new Set(pages) : null;
  const parts: string[] = [];
  for (const page of clean.pages) {
    if (wanted && !wanted.has(page.index + 1)) continue;
    parts.push(joinHyphenatedText(pageText(page)));
  }
  return parts.join("\n");
}
