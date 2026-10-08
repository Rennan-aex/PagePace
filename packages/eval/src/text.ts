// Raw text of a `RawDocument`, concatenated for the `text_cer` metric
// (E1-T06). This is deliberately the *dumbest* possible reading of the PDF
// text layer: no word reconstruction, no dehyphenation, no reading order —
// those arrive with E2/E3 and are measured by their own metrics
// (docs/extractor/EVALUATION.md).
//
// The gaps between items became the real space inference of E2-T03: the rule
// itself lives in the extractor core (`itemsText`/`spaceBetween`,
// `SPACE_GAP_FACTOR`), so the metric measures the same spaces the extraction
// will ship in the `Book`.
import { itemsText } from "@pagepace/extractor";
import type { RawDocument, RawPage } from "@pagepace/schema";

/** Concatenates the items of one page (line ends become `\n`, gaps become spaces). */
export function pageText(page: RawPage): string {
  return itemsText(page.items);
}

/**
 * Text of the whole document (or of the given pages, 1-based — the unit used
 * by `coverage.pages` in a golden). Pages are joined with `\n`.
 */
export function documentText(document: RawDocument, pages?: readonly number[] | null): string {
  const wanted = pages ? new Set(pages) : null;
  const parts: string[] = [];
  for (const page of document.pages) {
    if (wanted && !wanted.has(page.index + 1)) continue;
    parts.push(pageText(page));
  }
  return parts.join("\n");
}
