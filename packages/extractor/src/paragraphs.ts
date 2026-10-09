import type { RawDocument } from "@pagepace/schema";
import { documentLines, type TextLine } from "./lines";
import { itemsText } from "./spaces";
import { documentStats } from "./stats";

/**
 * Lines → paragraphs (E2-T04).
 *
 * A paragraph is a run of consecutive lines; a new one starts when one of
 * three signals fires, in this order:
 *
 * 1. **First-line indent** — the next line starts more than
 *    `PARAGRAPH_INDENT_FACTOR` em to the right of the previous one (the
 *    continuation lines of a paragraph come back to the margin, so only the
 *    first line of the next paragraph moves right).
 * 2. **Extra vertical space** — the baseline-to-baseline distance exceeds
 *    `PARAGRAPH_EXTRA_SPACE_FACTOR` times the typical line spacing of the
 *    document. Both sides are line-to-line distances and agree for the body
 *    font the median is taken from; a bigger heading only widens the gap, so
 *    headings are caught here.
 * 3. **Short last line** — only where the page is justified
 *    (`PARAGRAPH_JUSTIFIED_MIN_SHARE` of the lines end at the measure): a
 *    justified page ends a paragraph with a line that stops short of the
 *    measure, and the next line starts flush left and runs to the measure
 *    again. In ragged text every line may end anywhere, so the signal says
 *    nothing and is not used.
 *
 * Signals are ORed; each one alone is enough. Measurements behind the
 * numbers (indent of 1,2–3 em and paragraph gaps of 25pt against a 15pt
 * leading in the corpus) live in ADR-041.
 *
 * Known limits: paragraphs never cross a page (the layout decides where the
 * text resumes), a column is taken as the whole page (E6), and a heading with
 * no space above it on a justified page is only caught by signal 2.
 */

/** First-line indent (as a fraction of the next line's font size) that starts a paragraph. */
export const PARAGRAPH_INDENT_FACTOR = 0.5;
/** Extra space (as a fraction of the typical line spacing) that starts a paragraph. */
export const PARAGRAPH_EXTRA_SPACE_FACTOR = 1.5;
/** Share of lines ending at the measure that makes a page count as justified. */
export const PARAGRAPH_JUSTIFIED_MIN_SHARE = 0.5;
/** Distance from the measure (as a fraction of the text width) below which a line is short. */
export const PARAGRAPH_MEASURE_TOLERANCE = 0.02;

interface PageMeasure {
  /** Left edge of the leftmost line of the page. */
  left: number;
  /** Right edge of the rightmost line of the page. */
  right: number;
  /** Width of the text area (`right - left`). */
  width: number;
  /** Whether most lines run to the measure (justified text). */
  justified: boolean;
}

function measureOf(lines: readonly TextLine[]): PageMeasure {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    left = Math.min(left, line.x);
    right = Math.max(right, line.x + line.width);
  }
  const width = right - left;
  if (lines.length === 0 || !(width > 0)) {
    return { left, right, width: 0, justified: false };
  }
  const tolerance = PARAGRAPH_MEASURE_TOLERANCE * width;
  let atMeasure = 0;
  for (const line of lines) {
    if (line.x + line.width >= right - tolerance) atMeasure++;
  }
  return {
    left,
    right,
    width,
    justified: atMeasure / lines.length >= PARAGRAPH_JUSTIFIED_MIN_SHARE,
  };
}

function startsParagraph(
  previous: TextLine,
  next: TextLine,
  measure: PageMeasure,
  typicalLeading: number,
): boolean {
  if (next.x - previous.x > PARAGRAPH_INDENT_FACTOR * next.fontSize) return true;
  if (next.bottom - previous.bottom > PARAGRAPH_EXTRA_SPACE_FACTOR * typicalLeading) return true;
  if (!measure.justified) return false;
  const tolerance = PARAGRAPH_MEASURE_TOLERANCE * measure.width;
  const previousIsShort = previous.x + previous.width < measure.right - tolerance;
  const nextIsFlush = next.x <= measure.left + PARAGRAPH_INDENT_FACTOR * next.fontSize;
  const nextIsFull = next.x + next.width >= measure.right - tolerance;
  return previousIsShort && nextIsFlush && nextIsFull;
}

/** Groups the lines of one page into paragraphs, top to bottom. */
export function groupParagraphs(lines: readonly TextLine[], typicalLeading: number): TextLine[][] {
  const ordered = [...lines].sort((a, b) => a.top - b.top || a.bottom - b.bottom || a.x - b.x);
  const measure = measureOf(ordered);
  const paragraphs: TextLine[][] = [];
  let current: TextLine[] = [];
  for (const line of ordered) {
    const previous = current[current.length - 1];
    if (previous !== undefined && startsParagraph(previous, line, measure, typicalLeading)) {
      paragraphs.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) paragraphs.push(current);
  return paragraphs;
}

/**
 * Groups every page of a document, in page order. The typical line spacing
 * comes from the document statistics (the median of the whole book), so a
 * page whose own gaps are unusual still breaks at the book's rhythm.
 */
export function documentParagraphs(document: RawDocument): TextLine[][][] {
  const pages = documentLines(document);
  const hasText = document.pages.some((page) => page.items.length > 0);
  if (!hasText) return pages.map(() => []);
  const typicalLeading = documentStats(document).lineHeight;
  return pages.map((lines) => groupParagraphs(lines, typicalLeading));
}

/** Text of a paragraph: each line through the space rule, lines joined by a space. */
export function paragraphText(paragraph: readonly TextLine[]): string {
  return paragraph.map((line) => itemsText(line.items)).join(" ");
}
