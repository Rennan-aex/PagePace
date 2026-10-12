import type { TextLine } from "./lines";
import { PARAGRAPH_INDENT_FACTOR } from "./paragraphs";
import { lineText } from "./spaces";

/**
 * Cross-page paragraph join (E3-T04 — REQ-EXT-18).
 *
 * A paragraph that runs out of room at the foot of a page and resumes at the
 * head of the next one becomes a single block for the reader, with
 * `origin.pageFrom` and `origin.pageTo` pointing at both pages. The layout
 * gives two signals at the page boundary:
 *
 * 1. **No sentence stop** — the last line of the page does not end with
 *    `.`, `!`, `?` or `…` (trailing closing quotes/brackets are ignored
 *    before the test). A paragraph that ends mid-sentence almost always
 *    continues on the next page.
 * 2. **No first-line indent** — the first line of the next page starts at
 *    the page's left margin, not indented to the right (the same signal the
 *    paragraph layer uses inside a page, E2-T04). An indented first line
 *    means a new paragraph began there.
 *
 * A third guard keeps headings out of the join: a line whose font size
 * exceeds `PAGE_JOIN_TITLE_FONT_FACTOR` times the document body size is a
 * heading, and a heading never continues the previous page's paragraph.
 *
 * A word the typesetter broke with a hyphen at the page foot (`pala-` at
 * the end of page N, `vra` at the start of page N+1) joins automatically:
 * once the lines of both pages are in the same paragraph,
 * `paragraphHyphenText`/`joinHyphenatedLines` (E3-T03) see the site and
 * glue the word back.
 *
 * Known limits: one boundary is judged at a time (a paragraph can only
 * continue from the last page it occupies), a hyphen site across pages is
 * not scored by the eval's `hyphen_join_acc` (that metric walks the
 * per-page paragraphs), and a line ending with a digit after a period
 * (footnote reference) is not treated as a sentence stop.
 */

/** Font-size factor above which a line counts as a heading (blocks the join). */
export const PAGE_JOIN_TITLE_FONT_FACTOR = 1.2;

/** Sentence-final punctuation that ends a paragraph at a page foot. */
const SENTENCE_STOP: ReadonlySet<string> = new Set([".", "!", "?", "\u2026"]);

/** Closing quotes and brackets stripped before testing for a sentence stop. */
const TRAILING_CLOSERS: ReadonlySet<string> = new Set([
  '"',
  "'",
  ")",
  "]",
  "}",
  "\u2019",
  "\u201D",
  "\u00BB",
]);

export interface JoinedParagraph {
  /** Lines of the paragraph, in reading order (may span pages). */
  lines: TextLine[];
  /** 0-based index of the first page the paragraph touches. */
  pageFrom: number;
  /** 0-based index of the last page the paragraph touches. */
  pageTo: number;
}

/**
 * Whether the text of a line ends a sentence (and thus a paragraph) at the
 * page foot. Trailing closing quotes and brackets are skipped first so
 * `text."` and `text."` both count as a stop.
 */
export function endsSentence(text: string): boolean {
  const trimmed = text.trimEnd();
  if (trimmed === "") return false;
  let end = trimmed.length - 1;
  while (end >= 0 && TRAILING_CLOSERS.has(trimmed.charAt(end))) {
    end--;
  }
  if (end < 0) return false;
  return SENTENCE_STOP.has(trimmed.charAt(end));
}

function isTitleLine(line: TextLine, bodyFontSize: number): boolean {
  return line.fontSize > bodyFontSize * PAGE_JOIN_TITLE_FONT_FACTOR;
}

/** Leftmost edge of the lines of one page (the margin the indent signal uses). */
function leftMarginOf(lines: readonly TextLine[]): number {
  let left = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    left = Math.min(left, line.x);
  }
  return left;
}

function isIndented(line: TextLine, leftMargin: number): boolean {
  return line.x - leftMargin > PARAGRAPH_INDENT_FACTOR * line.fontSize;
}

/**
 * Joins the paragraphs of consecutive pages into a flat list: the last
 * paragraph of page N merges with the first paragraph of page N+1 when both
 * layout signals agree (no sentence stop at the foot, no indent at the head)
 * and neither boundary line is a heading. The input pages are not mutated.
 *
 * `pages` is the output of `groupDocumentParagraphs` (one entry per page,
 * in page order). `bodyFontSize` is the document's body size
 * (`documentStats().bodyFontSize`), the reference the heading guard compares
 * against.
 */
export function joinCrossPageParagraphs(
  pages: readonly (readonly TextLine[][])[],
  bodyFontSize: number,
): JoinedParagraph[] {
  const joined: JoinedParagraph[] = [];
  // The indent signal compares the first line of the next page against the
  // book's left margin (the leftmost edge of every line), not the page's
  // own margin: a page whose only line is indented would otherwise look
  // flush and the signal would be blind.
  const leftMargin = leftMarginOf(pages.flat(2));

  for (const [pageIndex, paragraphs] of pages.entries()) {
    for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
      const previous = joined[joined.length - 1];
      const isFirstOfPage = paragraphIndex === 0;

      if (previous !== undefined && isFirstOfPage && pageIndex > 0) {
        const lastLine = previous.lines.at(-1);
        const firstLine = paragraph[0];
        if (lastLine !== undefined && firstLine !== undefined) {
          const lastText = lineText(lastLine.items);
          if (
            !endsSentence(lastText) &&
            !isTitleLine(lastLine, bodyFontSize) &&
            !isTitleLine(firstLine, bodyFontSize) &&
            !isIndented(firstLine, leftMargin)
          ) {
            previous.lines.push(...paragraph);
            previous.pageTo = pageIndex;
            continue;
          }
        }
      }

      joined.push({
        lines: [...paragraph],
        pageFrom: pageIndex,
        pageTo: pageIndex,
      });
    }
  }

  return joined;
}
