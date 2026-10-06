// Raw text of a `RawDocument`, concatenated for the `text_cer` metric
// (E1-T06). This is deliberately the *dumbest* possible reading of the PDF
// text layer: no word reconstruction, no dehyphenation, no reading order —
// those arrive with E2/E3 and are measured by their own metrics
// (docs/extractor/EVALUATION.md).
import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";

/**
 * Horizontal gap (in em of the previous run) above which two runs are treated
 * as separate words. Provisional (ADR-035), to be replaced by the real space
 * inference of E2-T03.
 *
 * Measured on `n1-en-rebus` (2026-10-06): pdf.js delivers word spacing as an
 * explicit `" "` item or inside the run text, and neighbouring runs of the
 * same word sit at gap 0.00 — so the threshold only decides rare cases.
 */
export const SPACE_GAP_EM = 0.15;

function separatorBetween(previous: RawTextItem, next: RawTextItem): string {
  const gap = next.x - (previous.x + previous.width);
  return gap > SPACE_GAP_EM * previous.fontSize ? " " : "";
}

/**
 * Concatenates the items of one page.
 *
 * Line breaks reported by pdf.js (`hasEOL`, also carried by the empty marker
 * items it emits between lines) become `\n`; everything else follows the gap
 * rule above. `normalizeText` collapses both to a single space, so a wrong
 * line break costs nothing while a wrong gap costs one character.
 */
export function pageText(page: RawPage): string {
  let output = "";
  let previous: RawTextItem | null = null;
  let lineEnded = false;

  for (const item of page.items) {
    if (item.text === "") {
      // Marker item: it carries no text, only the end-of-line flag.
      if (item.hasEOL === true) lineEnded = true;
      continue;
    }
    if (previous !== null) {
      output += lineEnded ? "\n" : separatorBetween(previous, item);
    }
    output += item.text;
    previous = item;
    if (item.hasEOL === true) lineEnded = true;
    else lineEnded = false;
  }
  return output;
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
