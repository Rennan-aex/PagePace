import type { TextLine } from "./lines";
import type { JoinedParagraph } from "./pagejoin";
import { lineText } from "./spaces";

/**
 * Captions (E5-T05 — layer 4 "semântica").
 *
 * A paragraph is a **caption** when it opens like one — the printed label of
 * a figure or a table (`Fig. 3 - …`, `Figure 2: …`, `Table 1. …`, `Figura 4
 * — …`; `CAPTION_PREFIX`, the same words the heading gate refuses) — and the
 * layout agrees: the block is set **smaller than the body**
 * (`CAPTION_MAX_SIZE_FACTOR`, the mirror of the heading/footnote gates) or is
 * **short** (`CAPTION_MAX_LINES` lines). The separator after the label
 * number (`:`, `.`, `-`, en/em dash) is required: prose that merely starts
 * with a number ("Figure 2 shows…") is not a caption. A label accepted
 * without the layout's agreement still becomes a caption but carries
 * `flags: ["uncertain-caption"]` and the reduced
 * `CAPTION_UNCERTAIN_CONFIDENCE` (ARCHITECTURE decision 6).
 *
 * The figure itself belongs to E10 (`nonText`): until then proximity to the
 * image cannot be read, so the label and the type size are the whole
 * evidence. A caption outranks the quote and the list passes in
 * `buildBook` — a caption may sit indented or centred under its figure.
 *
 * Known limits: a caption without the printed label ("A lamp at dusk." set
 * small under a figure) stays a paragraph; a `Source:`/`Fonte:` line with no
 * number is not recognised (it carries no figure number); and a caption
 * broken across pages keeps only the first page's block (the E3-T04 join).
 */

/** A face below this fraction of the body size corroborates a caption. */
export const CAPTION_MAX_SIZE_FACTOR = 0.95;
/** Lines above which a label needs a smaller face to count as a caption. */
export const CAPTION_MAX_LINES = 3;
/** Flag of a caption whose layout does not agree with the label. */
export const UNCERTAIN_CAPTION_FLAG = "uncertain-caption";
/** Reduced confidence of a block carrying `UNCERTAIN_CAPTION_FLAG`. */
export const CAPTION_UNCERTAIN_CONFIDENCE = 0.7;

/**
 * A caption opens with a figure/table word, its number and a separator:
 * `Fig. 3 - …`, `Table 2: …`, `Figura 1. …`. The words mirror the ones the
 * heading gate refuses (`HEADING_CAPTION_MARKER`).
 */
export const CAPTION_PREFIX =
  /^(?:Fig(?:ure|\.)?|Figura|Table|Tabela|Quadro|Chart|Gr[aá]fico|Exhibit|Plate|Listing|Scheme)\.?\s*\d+\s*[:.\-–—]\s*\S/i;

/** One decision per input paragraph, in the same order. */
export interface CaptionDecision {
  caption: boolean;
  /** Only when `caption` is true: the label without the layout's agreement. */
  uncertain: boolean;
}

/** Everything the decision needs from the document, measured once. */
export interface CaptionContext {
  /** Body font size of the document (`documentStats().bodyFontSize`). */
  bodyFontSize: number;
}

const NOT_A_CAPTION: CaptionDecision = { caption: false, uncertain: false };

/**
 * One decision per paragraph: which paragraphs are captions. Deterministic —
 * same paragraphs and context, same decisions.
 */
export function detectCaptions(
  paragraphs: readonly JoinedParagraph[],
  context: CaptionContext,
): CaptionDecision[] {
  return paragraphs.map((paragraph) => {
    const lines = paragraph.lines as readonly TextLine[];
    const first = lines[0] as TextLine;
    if (!CAPTION_PREFIX.test(lineText(first.items))) return NOT_A_CAPTION;
    const fontSize = Math.max(...lines.map((line) => line.fontSize));
    const smaller =
      context.bodyFontSize > 0 && fontSize < context.bodyFontSize * CAPTION_MAX_SIZE_FACTOR;
    const short = lines.length <= CAPTION_MAX_LINES;
    return { caption: true, uncertain: !(smaller || short) };
  });
}
