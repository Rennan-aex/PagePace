import type { RawTextItem } from "@pagepace/schema";
import { joinsLineBox, type LineBox } from "./lines";

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

/** Text of the items of one **page** (producer order): a line-end marker breaks
 * the line, every other boundary follows the gap rule. Empty marker items are
 * skipped — they carry no text, only the flag.
 *
 * A marker breaks only when the run after it would **not** join the line box
 * the run before it built (`joinsLineBox`, the very rule `groupLines` groups
 * by): a marker pdf.js dropped between two runs of the same visual line is an
 * artifact, and the pair goes through the gap rule instead — a word split in
 * half comes out whole, a justified gap still gets its space, and a
 * superscript never opens a phantom line. Pages only: the caller that already
 * has a visual line uses `lineText`, where a marker can never break anything.
 */
export function itemsText(items: readonly RawTextItem[]): string {
  return runsText(items, true);
}

/**
 * Text of the items of one **visual line** (`groupLines` already decided the
 * line): pdf.js line-end markers are artifacts here and never break — the
 * caller joins the lines itself, so any `\n` inside would end up in the middle
 * of the reader's block text.
 */
export function lineText(items: readonly RawTextItem[]): string {
  return runsText(items, false);
}

function runsText(items: readonly RawTextItem[], breaksAtLineEnd: boolean): string {
  let output = "";
  let previous: RawTextItem | null = null;
  let lineEnded = false;
  let box: LineBox | null = null;

  for (const item of items) {
    if (item.text === "") {
      if (item.hasEOL === true) lineEnded = true;
      continue;
    }
    if (previous !== null) {
      const sameLine = box !== null && joinsLineBox(item, box);
      if (breaksAtLineEnd && lineEnded && !sameLine) output += "\n";
      else if (spaceBetween(previous, item)) output += " ";
      if (!sameLine) box = null;
    }
    const baseline = item.y + item.height;
    box =
      box === null
        ? { anchor: baseline, top: item.y, bottom: baseline }
        : {
            anchor: box.anchor,
            top: Math.min(box.top, item.y),
            bottom: Math.max(box.bottom, baseline),
          };
    output += item.text;
    previous = item;
    lineEnded = item.hasEOL === true;
  }
  return output;
}
