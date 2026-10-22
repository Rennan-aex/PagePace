import type { PageMeasure } from "./headings";
import type { TextLine } from "./lines";
import type { JoinedParagraph } from "./pagejoin";
import { QUOTE_MIN_INDENT_EM } from "./quotes";
import { lineText } from "./spaces";

/**
 * Lists (E5-T05 — layer 4 "semântica").
 *
 * A paragraph is a **list item** when its first line opens with a marker — a
 * bullet (`•`, `-`, `*`) or a number/letter label (`1.`, `2)`, `(3)`, `(a)`)
 * followed by a space (`LIST_MARKER`, the same shapes the heading gate
 * refuses so a title like `1. Introduction` stays body-adjacent). The marker
 * is enough on its own: a bullet inside an indented quote is still a list
 * item, so a marked item outranks the quote pass (E5-T04) in `buildBook`.
 *
 * A dash of dialogue never opens an item (backlog 3A): `— Rom, rom, rom! —
 * ronronou ele.` (n1-pt-sofia) is spoken prose, and the em/en dash is the
 * speech mark the typesetter prints, not a bullet — the marker list keeps
 * the hyphen `-`, which is the printed bullet, and drops `–—`.
 *
 * A second, weaker rule reads **indent alone**: every line of the block sits
 * between `LIST_MIN_INDENT_EM` and the block-quote gate
 * (`QUOTE_MIN_INDENT_EM`) away from the page's left edge — the shallow recuo
 * of a hanging list, one step below the recuo of a block quote. A first-line
 * only indent never counts (the continuation lines sit flush left, so the
 * minimum indent is 0). Accepted by the indent alone the item carries
 * `flags: ["uncertain-list"]` and the reduced `LIST_UNCERTAIN_CONFIDENCE`
 * (ARCHITECTURE decision 6).
 *
 * Known limits: a marker on the second line (a wrapped item whose first line
 * has no marker) is not a list; lettered items with a period (`iv.`, `A.`)
 * are not markers (initials in prose would be false positives); a list that
 * crosses pages is judged by the page it starts on; and a numbered item set
 * smaller than the body inside the page foot can still read as a footnote
 * (E5-T01 owns that region first).
 */

/** Minimum left inset (fraction of the line's font size) of an indent-only list item. */
export const LIST_MIN_INDENT_EM = 0.8;
/** Flag of a list item accepted by the indent rule alone. */
export const UNCERTAIN_LIST_FLAG = "uncertain-list";
/** Reduced confidence of a block carrying `UNCERTAIN_LIST_FLAG`. */
export const LIST_UNCERTAIN_CONFIDENCE = 0.7;

/** Bullets and list numbers (`•`, `-`, `*`, `1.`, `2)`, `(3)`) that open a list item. */
export const LIST_MARKER = /^(?:[-•‣◦▪*·]|\(?\w{1,2}\)|\d{1,3}[.)])\s+/;

/** One decision per input paragraph, in the same order. */
export interface ListDecision {
  list: boolean;
  /** Only when `list` is true: the item opens with a marker or a number. */
  marked: boolean;
  /** Only when `list` is true: accepted by the indent rule alone. */
  uncertain: boolean;
}

/** Everything the decision needs from the document, measured once. */
export interface ListContext {
  /** Text area each paragraph is judged against, in paragraph order (E6-T04): the band it starts in — a column of a two-column page or the full-width strip — or its page's text area. */
  measures: readonly PageMeasure[];
}

const NOT_A_LIST: ListDecision = { list: false, marked: false, uncertain: false };

/** Smallest left inset of the block's lines, in em (fraction of each line's font size). */
function minIndentEmOf(lines: readonly TextLine[], measure: PageMeasure): number {
  let minIndentEm = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.fontSize <= 0) continue;
    minIndentEm = Math.min(minIndentEm, (line.x - measure.left) / line.fontSize);
  }
  return Number.isFinite(minIndentEm) ? minIndentEm : 0;
}

/**
 * One decision per paragraph: which paragraphs are list items. Deterministic
 * — same paragraphs and context, same decisions.
 */
export function detectLists(
  paragraphs: readonly JoinedParagraph[],
  context: ListContext,
): ListDecision[] {
  return paragraphs.map((paragraph, index) => {
    const first = paragraph.lines[0] as TextLine;
    if (LIST_MARKER.test(lineText(first.items))) {
      return { list: true, marked: true, uncertain: false };
    }
    const measure = context.measures[index] ?? { left: 0, right: 0, width: 0 };
    const minIndentEm = minIndentEmOf(paragraph.lines, measure);
    if (minIndentEm >= LIST_MIN_INDENT_EM && minIndentEm < QUOTE_MIN_INDENT_EM) {
      return { list: true, marked: false, uncertain: true };
    }
    return NOT_A_LIST;
  });
}
