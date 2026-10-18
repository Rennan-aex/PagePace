import type { PageMeasure } from "./headings";
import { pageMeasureOf } from "./headings";
import type { TextLine } from "./lines";
import type { JoinedParagraph } from "./pagejoin";
import { lineText } from "./spaces";

/**
 * Margin numbering — Bekker/Stephanus references (E5-T07 — REQ-EXT-19, layer
 * 4 "semântica").
 *
 * Classical editions number their texts in the margin: Bekker prints
 * `1094a`…`1094d` (page + column letter) and Stephanus `20a`…`57c`. The
 * numbers are not prose — the reader cites them, the body never flows
 * through them — so they become `kind: "margin_ref"` blocks, out of the
 * reading flow but kept in `blocks` at their y position with
 * `origin.bbox` pointing at where the number sits, so the app can place
 * the citation beside the text it marks.
 *
 * Two gates decide, both cheap and deterministic:
 *
 * 1. **Text shape** — the whole line is 1–4 digits plus one letter `a`–`e`
 *    (Bekker `a`–`d`, Stephanus `a`–`e`), an optional trailing period
 *    allowed (`1094a.`, the way a citation footnote prints it). The letter
 *    is mandatory: a bare number could be a folio, a line number of a
 *    critical edition or a year of a chronology, and those are other
 *    passes' problems (folios are `repeated.ts`'s; a lettered number never
 *    is — `repeated.ts` skips the shape so a Bekker sequence cannot be
 *    stripped as a flow folio before this pass sees it).
 * 2. **Position** — the line sits entirely outside the page's text area:
 *    its right edge at or left of the body's left edge, or its left edge
 *    at or right of the body's right edge. The body measure is measured
 *    **excluding the candidate lines themselves** (`bodyMeasures`), so a
 *    page full of margin numbers does not stretch its own measure.
 *
 * A one-line paragraph is required: a margin number never joins the body
 * (the paragraph layer already split it by indent/space, and a number that
 * shares a baseline with a body line joins that line in `groupLines` — a
 * known limit below).
 *
 * `margin_ref` outranks every other kind in `buildBook` (the number would
 * otherwise read as a short isolated heading, or as a SciELO bare-number
 * footnote at the page foot). No uncertain flag: text shape + position are
 * two independent signals. Deterministic: same paragraphs, same decisions.
 *
 * Known limits: a margin number sharing a baseline with a body line joins
 * that line in `groupLines` (E2-T02) and is never a paragraph, so it is
 * not detected here; line numbers of a critical edition (bare digits, one
 * per line) are out of scope by the letter gate; a two-column page is
 * judged against one measure (E6); and no real PDF of the corpus carries
 * Bekker/Stephanus numbering today (the acceptance is the synthetic
 * fixture — REQ-19's real-world pass waits for a corpus PDF).
 */

/** Whole-line shape of a margin reference: digits + letter (`1094a`, `327b.`). */
export const MARGIN_REF_TEXT = /^\d{1,4}[a-eA-E]\.?$/;

/** Whether a trimmed line text is a Bekker/Stephanus number (`1094a`). */
export function isMarginRefText(text: string): boolean {
  return MARGIN_REF_TEXT.test(text.trim());
}

/** Whether a paragraph is shaped like a margin number (one line, text gate). */
export function isMarginRefShaped(paragraph: JoinedParagraph): boolean {
  if (paragraph.lines.length !== 1) return false;
  const line = paragraph.lines[0] as TextLine;
  return isMarginRefText(lineText(line.items));
}

/**
 * Text area of each page, in points, measured **excluding the lines of the
 * margin-number candidates** — the two-pass measure a position gate needs.
 * A page whose every line is a candidate keeps a zero-width measure (the
 * gate then refuses to decide).
 */
export function bodyMeasures(
  pages: readonly (readonly TextLine[][])[],
  paragraphs: readonly JoinedParagraph[],
): PageMeasure[] {
  const candidateLines = new Set<TextLine>();
  for (const paragraph of paragraphs) {
    if (!isMarginRefShaped(paragraph)) continue;
    for (const line of paragraph.lines) candidateLines.add(line);
  }
  return pages.map((page) =>
    pageMeasureOf(page.flat().filter((line) => !candidateLines.has(line))),
  );
}

/** Whether the line sits entirely outside the page's text area. */
function outsideMeasure(line: TextLine, measure: PageMeasure): boolean {
  if (measure.width <= 0) return false;
  return line.x + line.width <= measure.left || line.x >= measure.right;
}

/** One decision per input paragraph, in the same order. */
export interface MarginRefDecision {
  marginRef: boolean;
}

/** Everything the decision needs from the document, measured once. */
export interface MarginRefContext {
  /** Text area of each page, from `bodyMeasures` (candidates excluded). */
  measures: readonly PageMeasure[];
}

const NOT_A_MARGIN_REF: MarginRefDecision = { marginRef: false };

/**
 * One decision per paragraph: which paragraphs are margin references. A
 * one-line paragraph whose text is a Bekker/Stephanus number and whose line
 * sits outside the body's text area is one. Deterministic: same paragraphs
 * and context, same decisions.
 */
export function detectMarginRefs(
  paragraphs: readonly JoinedParagraph[],
  context: MarginRefContext,
): MarginRefDecision[] {
  return paragraphs.map((paragraph) => {
    if (!isMarginRefShaped(paragraph)) return NOT_A_MARGIN_REF;
    const line = paragraph.lines[0] as TextLine;
    const measure = context.measures[paragraph.pageFrom];
    if (measure === undefined || !outsideMeasure(line, measure)) return NOT_A_MARGIN_REF;
    return { marginRef: true };
  });
}
