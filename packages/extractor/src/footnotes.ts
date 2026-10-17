import type { TextLine } from "./lines";
import type { JoinedParagraph } from "./pagejoin";
import { lineText } from "./spaces";

/**
 * Footnotes (E5-T01 — REQ-EXT-08, layer 4 "semântica").
 *
 * A paragraph is a note when three layout signals agree: it **starts in the
 * bottom half** of the page's own text block
 * (`FOOTNOTE_REGION_TOP_SHARE` of the height its lines span), it is set
 * **smaller than the body** (`FOOTNOTE_MAX_SIZE_FACTOR` — the mirror of the
 * heading gate, so the two can never claim the same paragraph) and its first
 * line opens with a **marker**. Two marker shapes are accepted: the
 * punctuated or symbolic one (`FOOTNOTE_MARKER`: `1.`, `1)`, `(1)`, `[4]`,
 * `*`, `††`…) and the bare number of the SciELO style
 * (`FOOTNOTE_BARE_MARKER`: `1 Sustainable development…`). A bare number is
 * only half a marker on its own, so it counts when **prose follows it**
 * (`FOOTNOTE_PROSE_MIN_LETTERS`, which keeps `10 2 10 2 CDM15` as data), when
 * the line is **not a printed label in capitals** (`2 INTRODUCTION` — the
 * chapter name typeset in the page foot), and when the line is **not page
 * furniture** (`FOOTNOTE_FURNITURE_MIN_PAGES`: a digits-hidden line
 * repeating, at about one baseline, on many pages is a running foot — E3-T02
 * does not remove the ones whose words change with the chapter). A **text
 * rule** above the note (`----`, `____`, the separator the typesetter prints) is the fourth signal: a note separated by a rule is
 * accepted **without** a marker, but that is only probable — the block then
 * carries `flags: ["uncertain-footnote"]` and the reduced
 * `FOOTNOTE_UNCERTAIN_CONFIDENCE` (ARCHITECTURE decision 6).
 *
 * Every signal is measured against the page the note stands on, never against
 * the document, so **numbering that restarts by page or by chapter is no
 * evidence at all** — a note is judged where it is (both restarts are covered
 * by tests). A bare page number (`4`) has no prose after it and so is not a
 * marker, and the repeated-region pass (E3-T02) removes most of it first.
 *
 * Known limits: the marker must be numeric or symbolic (lettered `a)` and
 * roman `iv.` notes are not recognized yet), a note whose first line has no
 * marker and no rule above it stays a paragraph, a rule drawn as a vector
 * (the usual PDF) is invisible to the text layer so only printed rules count,
 * a note continuing on the next page (an E3-T04 join) is judged by the page
 * it starts on — its continuation has to keep the note font, or the size
 * gate reads the join as body text —, the region is the page's real text
 * height — a note taking more than
 * half of the page can start above the line — and a numbered list item or a
 * reference fragment set smaller than the body can still read as a note
 * (E5-T05 and E5-T06 reclassify those paragraphs, and E5-T02 flags a note
 * whose call is missing).
 */

/** Share of the page's text height a note has to start below to count as a foot note. */
export const FOOTNOTE_REGION_TOP_SHARE = 0.5;
/** A note is set below this fraction of the body font size (the heading gate, mirrored). */
export const FOOTNOTE_MAX_SIZE_FACTOR = 0.95;
/** Characters a printed rule (`----`, `____`) needs to count as a separator. */
export const FOOTNOTE_RULE_MIN_CHARS = 4;
/** Flag of a note accepted by the rule alone (no marker). */
export const UNCERTAIN_FOOTNOTE_FLAG = "uncertain-footnote";
/** Reduced confidence of a block carrying `UNCERTAIN_FOOTNOTE_FLAG`. */
export const FOOTNOTE_UNCERTAIN_CONFIDENCE = 0.7;

/** Marker that opens a note: `1.`, `1)`, `(1)`, `[1]`, `*`, `††`… followed by space or line end. */
export const FOOTNOTE_MARKER = /^(?:\(\d{1,3}\)|\[\d{1,3}\]|\d{1,3}[.)]|[*†‡§¶]{1,3})(?=\s|$)/;
/** Half a marker: a bare number before a space (`1 Sustainable development…`), the SciELO style. */
export const FOOTNOTE_BARE_MARKER = /^\d{1,3}(?=\s)/;
/** Letters a word after the bare marker needs before the line counts as prose. */
export const FOOTNOTE_PROSE_MIN_LETTERS = 4;
/** Pages a digits-hidden line repeats on, at about one baseline, before it counts as furniture. */
export const FOOTNOTE_FURNITURE_MIN_PAGES = 3;
/** Slack, in points, between the baselines of a line repeating as page furniture. */
export const FOOTNOTE_FURNITURE_BASELINE_TOLERANCE = 3;

/** Line made only of rule characters — the separator printed above the notes. */
const FOOTNOTE_RULE_TEXT = new RegExp(`^[\\s*_~.\\-\\u2013\\u2014]{${FOOTNOTE_RULE_MIN_CHARS},}$`);

/** One decision per input paragraph, in the same order. */
export interface FootnoteDecision {
  footnote: boolean;
  /** Only meaningful when `footnote` is true: accepted by the rule, without a marker. */
  uncertain: boolean;
}

/** Everything the decision needs from the document, measured once. */
export interface FootnoteContext {
  /** Body font size of the document (`documentStats().bodyFontSize`). */
  bodyFontSize: number;
}

/** Vertical text block of one page plus where each of its lines sits. */
interface PageLayout {
  /** Top edge of the topmost line of the page, in points. */
  top: number;
  /** Bottom edge of the bottommost line of the page, in points. */
  bottom: number;
  /** Lines of the page, top to bottom. */
  lines: readonly TextLine[];
  positionOf: ReadonlyMap<TextLine, number>;
}

const NOT_A_FOOTNOTE: FootnoteDecision = { footnote: false, uncertain: false };

function isRule(line: TextLine): boolean {
  return FOOTNOTE_RULE_TEXT.test(lineText(line.items));
}

/** The line's text with its digits hidden: `6 Filosofia Unisinos…| e27117` and `10 …` are one footer. */
function maskedText(line: TextLine): string {
  return lineText(line.items).replace(/\d+/g, "#").trim();
}

/** Words the rest of a bare-marker line needs before it reads as prose instead of data. */
const FOOTNOTE_PROSE = new RegExp(`\\p{L}{${FOOTNOTE_PROSE_MIN_LETTERS},}`, "u");
/** Cased letters: a line in capitals alone is a printed label, not a note. */
const UPPERCASE_LETTER = /\p{Lu}/u;
const LOWERCASE_LETTER = /\p{Ll}/u;

/**
 * A bare number opening a line of capitals (`2 INTRODUCTION`,
 * `74 ABOUT THE CONTRIBUTORS`) is a label the typesetter printed in the page
 * foot, not a note's own text. A script without case is unaffected.
 */
function isPrintedLabel(text: string): boolean {
  return UPPERCASE_LETTER.test(text) && !LOWERCASE_LETTER.test(text);
}

/**
 * Page furniture: lines whose digits-hidden text repeats on
 * `FOOTNOTE_FURNITURE_MIN_PAGES` pages at (about) one baseline. E3-T02 already
 * removes the footers whose words never change; a footer that names the
 * chapter (`8 SUBSTANCE DUALISM IN DESCARTES`) survives it because the digits
 * differ, and a bare number would read it as a note.
 */
function furnitureOf(pages: readonly (readonly TextLine[])[]): ReadonlySet<string> {
  const byText = new Map<string, { page: number; top: number }[]>();
  pages.forEach((lines, page) => {
    for (const line of lines) {
      const text = maskedText(line);
      if (text === "") continue;
      const occurrences = byText.get(text) ?? [];
      if (!occurrences.some((entry) => entry.page === page && entry.top === line.top)) {
        occurrences.push({ page, top: line.top });
      }
      byText.set(text, occurrences);
    }
  });
  const furniture = new Set<string>();
  for (const [text, occurrences] of byText) {
    const pagesSeen = new Set(occurrences.map((entry) => entry.page));
    if (pagesSeen.size < FOOTNOTE_FURNITURE_MIN_PAGES) continue;
    const tops = occurrences.map((entry) => entry.top).sort((left, right) => left - right);
    const slack = FOOTNOTE_FURNITURE_MIN_PAGES - 1;
    for (let index = slack; index < tops.length; index += 1) {
      const recent = tops[index] ?? 0;
      const oldest = tops[index - slack] ?? 0;
      if (recent - oldest <= FOOTNOTE_FURNITURE_BASELINE_TOLERANCE) {
        furniture.add(text);
        break;
      }
    }
  }
  return furniture;
}

function layoutOf(lines: readonly TextLine[]): PageLayout | null {
  if (lines.length === 0) return null;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  const positionOf = new Map<TextLine, number>();
  lines.forEach((line, position) => {
    positionOf.set(line, position);
    top = Math.min(top, line.top);
    bottom = Math.max(bottom, line.bottom);
  });
  return { top, bottom, lines, positionOf };
}

/** Whether the line printed right above `line` on the page is a rule. */
function ruleAbove(layout: PageLayout, line: TextLine): boolean {
  const position = layout.positionOf.get(line);
  if (position === undefined || position === 0) return false;
  const previous = layout.lines[position - 1];
  return previous !== undefined && isRule(previous);
}

function footnoteOf(
  paragraph: JoinedParagraph,
  bodyFontSize: number,
  layouts: readonly (PageLayout | null)[],
  furniture: ReadonlySet<string>,
): FootnoteDecision {
  if (bodyFontSize <= 0) return NOT_A_FOOTNOTE;
  // Every signal below is measured against the page the paragraph STARTS on,
  // so a note that ran out of room at the foot and continues on the next
  // page (an E3-T04 join, E5-T02) is judged here as well. Body text crossing
  // the boundary is still kept out: its continuation is body-sized and the
  // size gate rejects the join.
  const layout = layouts[paragraph.pageFrom] ?? null;
  if (layout === null) return NOT_A_FOOTNOTE;

  const lines = paragraph.lines;
  const first = lines[0];
  if (first === undefined) return NOT_A_FOOTNOTE;

  // Region: the note starts in the bottom half of the page's own text block.
  const regionTop = layout.top + FOOTNOTE_REGION_TOP_SHARE * (layout.bottom - layout.top);
  if (first.top < regionTop) return NOT_A_FOOTNOTE;

  // Type: smaller than the body — the heading gate (`>= 0.95 · body`) mirrored.
  const fontSize = Math.max(...lines.map((line) => line.fontSize));
  if (!(fontSize < bodyFontSize * FOOTNOTE_MAX_SIZE_FACTOR)) return NOT_A_FOOTNOTE;

  // The rule may open the paragraph (it grouped with the note) or sit in the
  // line right above it (it grouped with the body, or stands alone).
  const opensWithRule = isRule(first);
  const markerLine = opensWithRule ? lines[1] : first;
  if (markerLine === undefined) return NOT_A_FOOTNOTE;
  const separator = opensWithRule || ruleAbove(layout, first);
  const text = lineText(markerLine.items).trim();
  if (FOOTNOTE_MARKER.test(text)) return { footnote: true, uncertain: false };
  // A bare number is half a marker: it needs prose after it, and the line has
  // to be the note's own — not a printed label in capitals, and not a running
  // foot the strip pass left behind.
  if (
    FOOTNOTE_BARE_MARKER.test(text) &&
    FOOTNOTE_PROSE.test(text.replace(FOOTNOTE_BARE_MARKER, "")) &&
    !isPrintedLabel(text) &&
    !furniture.has(maskedText(markerLine))
  ) {
    return { footnote: true, uncertain: false };
  }
  if (!separator) return NOT_A_FOOTNOTE;
  return { footnote: true, uncertain: true };
}

/**
 * One decision per paragraph: which paragraphs are footnotes, and whether the
 * evidence for each one is only the separator rule. `pages` holds the lines of
 * every page (top to bottom, the output of `groupDocumentParagraphs` flattened
 * per page) — the region, the rule above a note and the page furniture are
 * page facts, so the decisions never depend on the numbering of the rest of
 * the document. Deterministic: same input, same decisions.
 */
export function detectFootnotes(
  paragraphs: readonly JoinedParagraph[],
  pages: readonly (readonly TextLine[])[],
  context: FootnoteContext,
): FootnoteDecision[] {
  const layouts = pages.map(layoutOf);
  const furniture = furnitureOf(pages);
  return paragraphs.map((paragraph) =>
    footnoteOf(paragraph, context.bodyFontSize, layouts, furniture),
  );
}
