import { classifyFontName } from "./fontstyle";
import { paragraphHyphenText } from "./hyphen";
import type { TextLine } from "./lines";
import { endsSentence, type JoinedParagraph } from "./pagejoin";

/**
 * Headings and their levels (E4-T02 — REQ-EXT-04, layer 4 "semântica").
 *
 * A paragraph is a heading when it passes the **gate** and carries at least
 * one **display signal**. The gate keeps body text out: at most
 * `HEADING_MAX_LINES` lines, never smaller than the body, flush left (a
 * centered block is exempt, because its left edge sits inside the measure),
 * not italic-dominant (an epigraph), not a caption (`Fig. 3`). The signals
 * are the ones the typesetter uses to make a title look like one: a larger
 * font (`HEADING_SIZE_FACTOR`), a bold face (`HEADING_BOLD_SHARE`),
 * centering, chapter numbering (`1.2`, `Capítulo 3`) or a short line
 * isolated by extra space on both sides that does not end a sentence (a
 * one-line paragraph is body text). A line that opens like a list item
 * (`1.`, `•`) needs the size or the weight alone.
 *
 * Everything is relative to the body font size, the typical leading and the
 * measure of the page, so one set of numbers works at any type size.
 *
 * Levels come from the **font-size clusters** of the headings of the book:
 * the largest cluster is level 1 and each smaller cluster goes one level
 * deeper (cap `HEADING_MAX_LEVEL`). When every heading shares one size there
 * is no size evidence at all, so the level falls back to the reading order
 * (the first heading is level 1). Bookmarks (`raw.outline`) would settle the
 * hierarchy and belong to E4-T03.
 *
 * Known limits: a heading with no space above it on a justified page needs a
 * display signal of its own (the short-line signal needs isolation), a
 * heading sitting at the foot of a page can be swallowed by the cross-page
 * join (E3-T04 guards on size only), a one-column measure is assumed (E6),
 * a chapter titled `1. Introduction` in the body font is read as a list
 * item, and a book whose headings are all the same size gets levels by order
 * of appearance.
 */

/** Lines above which a block is body text, never a heading. */
export const HEADING_MAX_LINES = 3;
/** A heading is never set below this fraction of the body font size. */
export const HEADING_MIN_SIZE_FACTOR = 0.95;
/** Font size (fraction of the body) that on its own marks a heading. */
export const HEADING_SIZE_FACTOR = 1.2;
/** First-line indent (fraction of the font size) that rules a paragraph out. */
export const HEADING_INDENT_MAX_FACTOR = 0.5;
/** Italic share above which a block reads as an epigraph, not a heading. */
export const HEADING_ITALIC_MAX_SHARE = 0.6;
/** Bold share (fraction of the characters) that on its own marks a heading. */
export const HEADING_BOLD_SHARE = 0.6;
/** Distance from the measure centre (fraction of the measure) that is centered. */
export const HEADING_CENTER_TOLERANCE = 0.03;
/** Width (fraction of the measure) a centered heading may occupy. */
export const HEADING_CENTER_WIDTH_SHARE = 0.9;
/** Lines of the "short isolated line" signal. */
export const HEADING_SHORT_MAX_LINES = 2;
/** Width (fraction of the measure) of the "short isolated line" signal. */
export const HEADING_SHORT_WIDTH_SHARE = 0.7;
/** Extra space (fraction of the typical leading) that counts as isolation. */
export const HEADING_ISOLATION_FACTOR = 1.5;
/** Sizes closer than this fraction of the larger one share one level. */
export const HEADING_SIZE_CLUSTER_FACTOR = 0.05;
/** Deepest heading level the schema accepts (`@pagepace/schema`). */
export const HEADING_MAX_LEVEL = 6;

/** Caption markers (`Fig. 3`, `Table 2`...) a heading never starts with. */
export const HEADING_CAPTION_MARKER =
  /^(?:Fig(?:ure|\.)?|Figura|Table|Tabela|Quadro|Chart|Gr[aá]fico|Exhibit|Plate|Source|Fonte|Listing|Scheme)\.?\s*\d/i;

/** Chapter/section words that open a numbered heading (`Capítulo 3`). */
export const HEADING_NUMBERING_WORD =
  /^(?:Cap[ií]tulo|Chapter|Parte|Part|Se[çc][ãa]o|Section|Anexo|Appendix)\s+(?:[IVXLClvxl]+|\d+)/i;

/** Section numbers of a heading (`1.2 Title`, `1.2.3`); a bare `1.` is not one. */
export const HEADING_SECTION_NUMBERING = /^\d+(?:\.\d+)+\s*\S/;

/** Bullets and list numbers (`•`, `-`, `1.`, `1)`, `(a)`) a heading never starts with. */
export const HEADING_LIST_MARKER = /^(?:[-–—•▪◦*]|\(?\w{1,2}\)|\d{1,3}[.)])\s+/;

/** Text area of a page, in points (0-based page index). */
export interface PageMeasure {
  left: number;
  right: number;
  /** Width of the text area (`right - left`), 0 when the page has no line. */
  width: number;
}

/** Everything the decision needs from the document, measured once. */
export interface HeadingContext {
  /** Body font size of the document (`documentStats().bodyFontSize`). */
  bodyFontSize: number;
  /** Typical line spacing of the document (`documentStats().lineHeight`). */
  lineHeight: number;
  /** Text area each paragraph is judged against, in paragraph order (E6-T04): the band it starts in — a column of a two-column page or the full-width strip — or its page's text area. */
  measures: readonly PageMeasure[];
}

/** One decision per input paragraph, in the same order. */
export interface HeadingDecision {
  heading: boolean;
  /** Only when `heading` is true (1..6, required by the schema). */
  level?: number;
}

/** Text area of one page: the leftmost and rightmost edges of its lines. */
export function pageMeasureOf(lines: readonly TextLine[]): PageMeasure {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    left = Math.min(left, line.x);
    right = Math.max(right, line.x + line.width);
  }
  const width = right - left;
  return { left, right, width: Number.isFinite(width) && width > 0 ? width : 0 };
}

/** Share of the non-space characters of the lines carrying a font style. */
function styleShare(lines: readonly TextLine[], style: "bold" | "italic"): number {
  let styled = 0;
  let total = 0;
  for (const line of lines) {
    for (const item of line.items) {
      const chars = item.text.replace(/\s+/g, "").length;
      if (chars === 0) continue;
      total += chars;
      const font = classifyFontName(item.fontName);
      const flagged =
        style === "bold"
          ? font.bold === true || item.fontFlags?.bold === true
          : font.italic === true || item.fontFlags?.italic === true;
      if (flagged) styled += chars;
    }
  }
  return total === 0 ? 0 : styled / total;
}

interface HeadingFeatures {
  lines: readonly TextLine[];
  /** Largest font size of the block, in points. */
  fontSize: number;
  boldShare: number;
  italicShare: number;
  /** Whole paragraph text (hyphen join already applied). */
  text: string;
  /** First-line indent in em, measured against the page's left edge. */
  indentEm: number;
  /** Widest line as a fraction of the measure. */
  widthShare: number;
  /** Furthest line centre from the measure centre, as a fraction of the measure. */
  offCenter: number;
  /** Baseline distance to the previous block, in leadings; `null` = no neighbour. */
  gapAbove: number | null;
  gapBelow: number | null;
}

function baselineOf(line: TextLine): number {
  return line.bottom;
}

function featuresOf(
  paragraph: JoinedParagraph,
  index: number,
  context: HeadingContext,
): HeadingFeatures {
  const lines = paragraph.lines;
  const first = lines[0] as TextLine;
  const measure = context.measures[index] ?? { left: 0, right: 0, width: 0 };
  const fontSize = Math.max(...lines.map((line) => line.fontSize));
  const widthShare =
    measure.width > 0 ? Math.max(...lines.map((line) => line.width)) / measure.width : 1;
  const offCenter =
    measure.width > 0
      ? Math.max(
          ...lines.map(
            (line) =>
              Math.abs(line.x + line.width / 2 - (measure.left + measure.right) / 2) /
              measure.width,
          ),
        )
      : 1;
  return {
    lines,
    fontSize,
    boldShare: styleShare(lines, "bold"),
    italicShare: styleShare(lines, "italic"),
    text: paragraphHyphenText(lines).text,
    indentEm: measure.width > 0 ? (first.x - measure.left) / first.fontSize : 0,
    widthShare,
    offCenter,
    gapAbove: null,
    gapBelow: null,
  };
}

/** Baseline-to-baseline distance between two blocks, in leadings. */
function gapInLeadings(from: TextLine, to: TextLine, lineHeight: number): number | null {
  if (lineHeight <= 0) return null;
  const distance = baselineOf(to) - baselineOf(from);
  return distance / lineHeight;
}

function isNumbered(text: string): boolean {
  return HEADING_SECTION_NUMBERING.test(text) || HEADING_NUMBERING_WORD.test(text);
}

/** A block is centered when every line sits on the measure's centre. */
function isCentered(features: HeadingFeatures): boolean {
  return (
    features.widthShare <= HEADING_CENTER_WIDTH_SHARE &&
    features.offCenter <= HEADING_CENTER_TOLERANCE
  );
}

/**
 * Short line with extra space above and below (page edges count as space).
 * A line that finishes a sentence (`endsSentence`, the rule the cross-page
 * join already uses) is a one-line paragraph of body text, never a title.
 */
function isShortIsolated(features: HeadingFeatures): boolean {
  if (endsSentence(features.text)) return false;
  const isolated =
    (features.gapAbove === null || features.gapAbove >= HEADING_ISOLATION_FACTOR) &&
    (features.gapBelow === null || features.gapBelow >= HEADING_ISOLATION_FACTOR);
  return (
    features.lines.length <= HEADING_SHORT_MAX_LINES &&
    features.widthShare <= HEADING_SHORT_WIDTH_SHARE &&
    isolated
  );
}

function isHeading(features: HeadingFeatures, context: HeadingContext): boolean {
  const body = context.bodyFontSize;
  if (body <= 0) return false;
  if (features.lines.length > HEADING_MAX_LINES) return false;
  if (features.fontSize < body * HEADING_MIN_SIZE_FACTOR) return false;
  const centered = isCentered(features);
  // A centered block sits in the middle of the measure, so its left edge
  // looks deeply indented: only a flush-left block answers the indent rule.
  if (!centered && features.indentEm > HEADING_INDENT_MAX_FACTOR) return false;
  if (features.italicShare > HEADING_ITALIC_MAX_SHARE) return false;
  if (HEADING_CAPTION_MARKER.test(features.text)) return false;
  // A line that opens like a list item (`1.`, `•`) only becomes a heading
  // when the type itself says so — size or weight, never "short and alone"
  // and never "centered" (E5-T05: a bullet block can sit on the measure's
  // centre by accident — the Helvetica widths of a synthetic item did — and
  // must stay a list item).
  const listed = HEADING_LIST_MARKER.test(features.text);
  return (
    features.fontSize >= body * HEADING_SIZE_FACTOR ||
    features.boldShare >= HEADING_BOLD_SHARE ||
    (!listed && centered) ||
    (!listed && isNumbered(features.text)) ||
    (!listed && isShortIsolated(features))
  );
}

/** Font-size clusters, descending: the largest size is level 1. */
function sizeLevels(sizes: readonly number[]): Map<number, number> {
  const levels = new Map<number, number>();
  let cluster = -1;
  let representative = Number.POSITIVE_INFINITY;
  for (const size of [...new Set(sizes)].sort((a, b) => b - a)) {
    if (cluster < 0 || size < representative * (1 - HEADING_SIZE_CLUSTER_FACTOR)) {
      cluster += 1;
      representative = size;
    }
    levels.set(size, Math.min(cluster + 1, HEADING_MAX_LEVEL));
  }
  return levels;
}

/**
 * Level of every heading: by font-size cluster, or — when all headings share
 * one size, so the sizes say nothing — by order of appearance.
 */
export function headingLevels(sizes: readonly number[]): number[] {
  const levels = sizeLevels(sizes);
  if (levels.size === 1 && sizes.length > 1) {
    return sizes.map((_, index) => Math.min(index + 1, HEADING_MAX_LEVEL));
  }
  return sizes.map((size) => levels.get(size) ?? 1);
}

/**
 * One decision per paragraph: which paragraphs are headings and at which
 * level. Deterministic — same paragraphs and context, same decisions.
 */
export function detectHeadings(
  paragraphs: readonly JoinedParagraph[],
  context: HeadingContext,
): HeadingDecision[] {
  const measured = paragraphs.map((paragraph, index) => {
    const feature = featuresOf(paragraph, index, context);
    const previous = paragraphs[index - 1];
    const next = paragraphs[index + 1];
    const first = paragraph.lines[0] as TextLine;
    const last = paragraph.lines[paragraph.lines.length - 1] as TextLine;
    // A neighbour on another page leaves no spacing evidence (page edges are
    // not measurable), so the gap stays `null` and counts as isolated.
    if (previous !== undefined && previous.pageTo === paragraph.pageFrom) {
      feature.gapAbove = gapInLeadings(
        previous.lines[previous.lines.length - 1] as TextLine,
        first,
        context.lineHeight,
      );
    }
    if (next !== undefined && next.pageFrom === paragraph.pageFrom) {
      feature.gapBelow = gapInLeadings(last, next.lines[0] as TextLine, context.lineHeight);
    }
    return feature;
  });

  const candidates = measured
    .map((feature, index) => ({ feature, index }))
    .filter(({ feature }) => isHeading(feature, context));

  const levels = headingLevels(candidates.map(({ feature }) => feature.fontSize));
  const decisions: HeadingDecision[] = paragraphs.map(() => ({ heading: false }));
  candidates.forEach(({ index }, position) => {
    decisions[index] = { heading: true, level: levels[position] };
  });
  return decisions;
}
