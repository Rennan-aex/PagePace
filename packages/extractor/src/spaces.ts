import type { RawTextItem } from "@pagepace/schema";

/**
 * Space inference (E2-T03 — layer 2, "espaços inferidos por lacuna de
 * posição"): words the producer separated only by position get their space
 * back from the horizontal gap between adjacent items, as a fraction of the
 * larger font size of the pair.
 *
 * A gap above `SPACE_GAP_FACTOR` is a word boundary; a gap at or below it is
 * kerning (a word the producer split) or punctuation glued to the word. The
 * factor sits inside the measured valley between the two clusters: the worst
 * word-internal split read in N1 is 0.087 em and the smallest word gap that
 * has no space glyph in the corpus is 0.164 em (the measurement and its
 * numbers live in ADR-040). Text that already carries a space at the boundary
 * is never given a second one.
 *
 * Known limits: items are read in the order the producer wrote them, so
 * two-column pages interleave until E6, and equation fragments (N2+) are
 * spaced by rules that have nothing to do with words.
 */

/** Horizontal gap (fraction of the larger font size) above which two items are separate words. */
export const SPACE_GAP_FACTOR = 0.12;

const endsWithSpace = (text: string): boolean => /\s$/.test(text);
const startsWithSpace = (text: string): boolean => /^\s/.test(text);

/** Whether a space must be inserted between two adjacent items of the same line. */
export function spaceBetween(previous: RawTextItem, next: RawTextItem): boolean {
  if (endsWithSpace(previous.text) || startsWithSpace(next.text)) return false;
  const gap = next.x - (previous.x + previous.width);
  return gap > SPACE_GAP_FACTOR * Math.max(previous.fontSize, next.fontSize);
}

/**
 * Text of an ordered run of items (a page, in producer order): pdf.js line-end
 * markers (`hasEOL`) break the line, every other boundary follows the gap rule.
 * Empty marker items are skipped — they carry no text, only the flag.
 */
export function itemsText(items: readonly RawTextItem[]): string {
  let output = "";
  let previous: RawTextItem | null = null;
  let lineEnded = false;

  for (const item of items) {
    if (item.text === "") {
      if (item.hasEOL === true) lineEnded = true;
      continue;
    }
    if (previous !== null) {
      if (lineEnded) output += "\n";
      else if (spaceBetween(previous, item)) output += " ";
    }
    output += item.text;
    previous = item;
    lineEnded = item.hasEOL === true;
  }
  return output;
}
