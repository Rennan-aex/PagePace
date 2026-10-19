import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { detectColumns, type PageColumns } from "./columns";
import { paragraphHyphenText } from "./hyphen";
import { groupItemLines, type TextLine } from "./lines";
import { stripRepeatedRegions } from "./repeated";
import { splitSideRegions } from "./sidebars";
import { documentStats } from "./stats";

/**
 * Lines → paragraphs (E2-T04).
 *
 * Repeated regions (E3-T02) leave the flow first: `documentParagraphs` strips
 * the running heads, feet and page numbers before grouping, so a header never
 * becomes a paragraph of its own. The signals below therefore only see body
 * lines.
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
 * Columns (E6-T02): a page whose items project onto more than one column
 * (`detectColumns`, E6-T01) is read column by column — items split by the
 * detected columns, lines grouped inside each column (same-baseline items of
 * different columns never share a line) and the flow read spanning band first,
 * then each column left to right. A single-column page keeps the trivial
 * top-to-bottom order of E2.
 *
 * Side regions (E6-T03): a band of prose beside the body — a sidebar box in
 * the outer margin — is claimed by `splitSideRegions` before the lines are
 * built, so its items never glue to the body lines sharing the baseline.
 * The main flow is read first and the side paragraphs last; their lines
 * carry `side: true` and `buildBook` marks the blocks with
 * `flags: ["sidebar"]`.
 *
 * Known limits: paragraphs never cross a page (the layout decides where the
 * text resumes), a full-width block at the **foot** of a two-column page
 * still reads before both columns (a true XY-cut would place it after them —
 * refinement for E6-T04), a band with a column's share of the items is left
 * to the column detector even when narrow, and a heading with no space above
 * it on a justified page is only caught by signal 2.
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
 * The paragraphs of one group of items, column-aware (E6-T02): spanning
 * items first, then each detected column left to right. One detected column
 * is the trivial single-column flow of E2.
 */
function columnFlowParagraphs(
  items: readonly RawTextItem[],
  columns: PageColumns,
  lineHeight: number,
): TextLine[][] {
  // Spanning items (the title/abstract that crosses the gutter) form their
  // own band; every other item goes to the column that holds its centre. A
  // non-spanning item always finds a column: the detector only keeps a
  // gutter the spanning flags already cover.
  const spanning: RawTextItem[] = [];
  const perColumn: RawTextItem[][] = columns.columns.map(() => []);
  items.forEach((entry, index) => {
    if (columns.spanningItems[index] === true) {
      spanning.push(entry);
      return;
    }
    const center = entry.x + entry.width / 2;
    const slot = columns.columns.findIndex(
      (column) => center >= column.x && center < column.x + column.width,
    );
    perColumn[slot === -1 ? 0 : slot]?.push(entry);
  });
  const ordered = groupParagraphs(groupItemLines(spanning), lineHeight);
  for (const group of perColumn) {
    ordered.push(...groupParagraphs(groupItemLines(group), lineHeight));
  }
  return ordered;
}

/**
 * The paragraphs of one page in reading order (E6-T02 + E6-T03): the side
 * regions are claimed first (`splitSideRegions` — same-baseline items of
 * different bands must never share a line), then the remaining items split
 * by the detected columns (`detectColumns`), lines grouped inside each
 * column, and the flow read spanning band first, then each column left to
 * right. A page with neither side regions nor columns keeps the trivial
 * order of E2. Side paragraphs come after the main flow, with `side: true`
 * on every line.
 */
export function groupPageParagraphs(
  page: RawPage,
  options: { bodyFontSize: number; lineHeight: number },
): TextLine[][] {
  const split = splitSideRegions(page.items, options);
  const columns = detectColumns(split.main, {
    bodyFontSize: options.bodyFontSize,
    nonText: page.nonText ?? [],
  });
  const ordered =
    columns.count > 1
      ? columnFlowParagraphs(split.main, columns, options.lineHeight)
      : groupParagraphs(groupItemLines(split.main), options.lineHeight);
  for (const region of split.regions) {
    const lines: TextLine[] = groupItemLines(region.items).map((line) => ({ ...line, side: true }));
    ordered.push(...groupParagraphs(lines, options.lineHeight));
  }
  return ordered;
}

/**
 * Groups every page of a **clean** document (no repeated regions), in page
 * order and, inside a page, in reading order (column-aware — E6-T02). The
 * typical line spacing and the body size come from the document statistics
 * (the median of the whole book), so a page whose own gaps are unusual still
 * breaks at the book's rhythm. `documentParagraphs` and `buildBook` reach
 * this through `stripRepeatedRegions`; never call it with a raw document.
 */
export function groupDocumentParagraphs(document: RawDocument): TextLine[][][] {
  const hasText = document.pages.some((page) => page.items.length > 0);
  if (!hasText) return document.pages.map(() => []);
  const stats = documentStats(document);
  return document.pages.map((page) =>
    groupPageParagraphs(page, { bodyFontSize: stats.bodyFontSize, lineHeight: stats.lineHeight }),
  );
}

/**
 * Groups every page of a raw document, in page order: repeated regions are
 * stripped once here, and the remaining lines become paragraphs (a paragraph
 * never crosses a page).
 */
export function documentParagraphs(document: RawDocument): TextLine[][][] {
  return groupDocumentParagraphs(stripRepeatedRegions(document).document);
}

/**
 * Text of a paragraph as the reader gets it: each line through the space
 * rule, then the hyphenation join of E3-T03 (a line ending in `-` glues to
 * the next one, dropping or keeping the hyphen per `hyphenJoinDecision`).
 * Callers that need the sites or the doubt flag use `paragraphHyphenText`
 * directly (one implementation behind both).
 */
export function paragraphText(paragraph: readonly TextLine[]): string {
  return paragraphHyphenText(paragraph).text;
}
