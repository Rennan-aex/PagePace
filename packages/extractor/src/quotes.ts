import { classifyFontName } from "./fontstyle";
import type { PageMeasure } from "./headings";
import type { TextLine } from "./lines";
import type { JoinedParagraph } from "./pagejoin";

/**
 * Block quotes and epigraphs (E5-T04 — REQ-EXT-09, layer 4 "semântica").
 *
 * A paragraph is a **blockquote** when the whole block sits inside the
 * measure — every line starts to the right of the page's left edge by at
 * least `QUOTE_MIN_INDENT_EM` (the "recuo" of a quote, as opposed to the
 * first-line-only indent of a body paragraph). The optional second inset on
 * the right ("recuo duplo") is recognised but not required: many typesetters
 * indent only the left edge.
 *
 * An **epigraph** is the display quote that opens a chapter: short, usually
 * italic (`QUOTE_ITALIC_SHARE`, the same weight the heading gate uses to
 * keep epigraphs out of titles) or set smaller than the body, indented, and
 * often closed by an attribution line (`— Author`). When a block could be
 * either, the epigraph rules win.
 *
 * Corroborating signals — a smaller face (`QUOTE_MAX_SIZE_FACTOR`), a
 * leading that differs from the body's (`QUOTE_LEADING_TOLERANCE`) and the
 * attribution pattern — raise confidence but are not all required: the
 * layout of real books varies too much for a rigid conjunction. A doubtful
 * case becomes a flag plus the reduced `QUOTE_UNCERTAIN_CONFIDENCE`
 * (ARCHITECTURE decision 6).
 *
 * Front-matter guards (backlog 3A): a block that opens with a metadata label
 * (`Keywords:`, `E-mail:`, `Abstract`...) is never a quote; the indent rule
 * alone claims only a block of two or more lines (a lone indented line is an
 * affiliation or an e-mail); a one-line indented face (a subtitle, a
 * byline) is an epigraph only with attribution or sentence punctuation; and
 * a block whose every line opens with a numbered affiliation marker
 * (`1 The Oskar Klein Centre…`, `2 Center for…`) is the author list of a
 * cover — indented and smaller than the body like an epigraph, but never a
 * quote.
 *
 * Dialogue and the label's body (backlog 3A, second round): a block that
 * opens with a speech dash (`— Rom, rom, rom! — ronronou ele.`, the printed
 * quotation mark of spoken prose) is body text, not a quote — the same dash
 * that closes an attribution line is what opens a speaker's turn; and a
 * block sitting directly after a metadata label (`ABSTRACT`, then the
 * abstract itself) is the body of that entry, however indented the journal
 * sets it.
 *
 * Priority in `buildBook`: a footnote or a heading never becomes a quote —
 * the size gates of those passes are complementary (a note is smaller than
 * `FOOTNOTE_MAX_SIZE_FACTOR`, a heading is flush left and not
 * italic-dominant).
 *
 * Known limits: a quote that starts with a list marker (`1.`, `•`) is not
 * recognised yet (E5-T05 will reclassify those paragraphs), a quotation
 * mark alone (`"`, `“`) is not a signal (too many false positives in body
 * dialogue), a centred epigraph is only caught by the italic/size
 * rules — the indent rule assumes a left-aligned block, and the label's
 * body is taken from the paragraph immediately before it (a label split
 * from its body by another block is not followed).
 */

/** Minimum left inset (fraction of the font size) that marks a block quote. */
export const QUOTE_MIN_INDENT_EM = 1.8;
/** Italic share above which a short indented block reads as an epigraph. */
export const QUOTE_ITALIC_SHARE = 0.6;
/** A face below this fraction of the body size corroborates a quote. */
export const QUOTE_MAX_SIZE_FACTOR = 0.95;
/** Lines above which a block is never an epigraph (a long quotation). */
export const QUOTE_EPIGRAPH_MAX_LINES = 4;
/** Leading (fraction of the body's) that counts as a different spacing. */
export const QUOTE_LEADING_TOLERANCE = 0.12;
/** Flag of a quote accepted by the indent rule alone. */
export const UNCERTAIN_QUOTE_FLAG = "uncertain-quote";
/** Reduced confidence of a block carrying `UNCERTAIN_QUOTE_FLAG`. */
export const QUOTE_UNCERTAIN_CONFIDENCE = 0.7;

/** Lines the indent rule needs before it may claim a block on its own. */
export const QUOTE_MIN_INDENT_ONLY_LINES = 2;

/** Attribution line of an epigraph: `— Author`, `- Author`, `– Author`. */
export const QUOTE_ATTRIBUTION = /(?:^|\n)\s*[—–-]\s*\S/;

/** Sentence punctuation a one-line quote is closed with. */
export const QUOTE_SENTENCE_END = /[.!?…:;]["»”')\]]*\s*$/;

/**
 * Front-matter labels a one-line block may open with and never read as a
 * quote (backlog 3A): `Keywords:`, `Palavras-chave:`, `E-mail:`, the
 * section labels of an abstract, the receipt lines of a journal article.
 */
export const QUOTE_LABEL =
  /^(?:keywords?|palavras-chave|palavraschave|e-?mail|affiliation|afilia[çc][ãa]o|abstract|resumo|received|accepted|doi)\b/i;

/**
 * Speech dash that opens a speaker's turn (`— Rom, rom, rom!`, `- Yes.`).
 * The em/en dash is the printed quotation mark of dialogue, so a block that
 * opens with it is body prose: the same glyph that closes an epigraph's
 * attribution is what opens the speech (backlog 3A, second round).
 */
export const QUOTE_DIALOGUE_DASH = /^[—–]\s*\S/;

/** Line of a numbered affiliation list (`1 The Oskar Klein Centre…`). */
export const QUOTE_AFFILIATION_LINE = /^\d{1,2}\s+\S/;

/** One decision per input paragraph, in the same order. */
export interface QuoteDecision {
  quote: boolean;
  /** Only when `quote` is true. */
  kind?: "blockquote" | "epigraph";
  /** Only when `quote` is true: accepted by the indent rule alone. */
  uncertain?: boolean;
}

/** Everything the decision needs from the document, measured once. */
export interface QuoteContext {
  /** Body font size of the document (`documentStats().bodyFontSize`). */
  bodyFontSize: number;
  /** Typical line spacing of the document (`documentStats().lineHeight`). */
  lineHeight: number;
  /** Text area each paragraph is judged against, in paragraph order (E6-T04): the band it starts in — a column of a two-column page or the full-width strip — or its page's text area. */
  measures: readonly PageMeasure[];
}

const NOT_A_QUOTE: QuoteDecision = { quote: false };

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

interface QuoteFeatures {
  lines: readonly TextLine[];
  /** Largest font size of the block, in points. */
  fontSize: number;
  italicShare: number;
  text: string;
  /** Smallest left inset of the lines, in em (fraction of the font size). */
  minIndentEm: number;
  /** Widest line as a fraction of the measure. */
  widthShare: number;
  /** Mean leading of the block as a fraction of the body's leading. */
  leadingShare: number | null;
}

function baselineOf(line: TextLine): number {
  return line.bottom;
}

function featuresOf(
  paragraph: JoinedParagraph,
  index: number,
  context: QuoteContext,
): QuoteFeatures {
  const lines = paragraph.lines;
  const first = lines[0] as TextLine;
  const measure = context.measures[index] ?? { left: 0, right: 0, width: 0 };
  const fontSize = Math.max(...lines.map((line) => line.fontSize));
  const widthShare =
    measure.width > 0 ? Math.max(...lines.map((line) => line.width)) / measure.width : 1;
  let minIndentEm = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.fontSize <= 0) continue;
    minIndentEm = Math.min(minIndentEm, (line.x - measure.left) / line.fontSize);
  }
  if (!Number.isFinite(minIndentEm)) minIndentEm = 0;
  let leadingShare: number | null = null;
  if (lines.length >= 2 && context.lineHeight > 0 && first.fontSize > 0) {
    let total = 0;
    for (let index = 1; index < lines.length; index++) {
      total += baselineOf(lines[index] as TextLine) - baselineOf(lines[index - 1] as TextLine);
    }
    leadingShare = total / (lines.length - 1) / context.lineHeight;
  }
  return {
    lines,
    fontSize,
    italicShare: styleShare(lines, "italic"),
    text: lines.map((line) => line.items.map((item) => item.text).join("")).join("\n"),
    minIndentEm,
    widthShare,
    leadingShare,
  };
}

/** A block is indented when **every** line starts inside the measure. */
function isIndented(features: QuoteFeatures): boolean {
  return features.minIndentEm >= QUOTE_MIN_INDENT_EM;
}

/** The leading differs from the body's by more than the tolerance. */
function leadingDiffers(features: QuoteFeatures, context: QuoteContext): boolean {
  if (features.leadingShare === null || context.lineHeight <= 0) return false;
  return Math.abs(features.leadingShare - 1) >= QUOTE_LEADING_TOLERANCE;
}

/** A block opens like front-matter metadata, not like a quote (backlog 3A). */
function opensWithLabel(features: QuoteFeatures): boolean {
  const firstLine = features.text.split("\n", 1)[0] ?? "";
  return QUOTE_LABEL.test(firstLine.trimStart());
}

/** A block opens like spoken dialogue: the dash is a speech mark (backlog 3A). */
function opensWithDialogue(features: QuoteFeatures): boolean {
  const firstLine = features.text.split("\n", 1)[0] ?? "";
  return QUOTE_DIALOGUE_DASH.test(firstLine.trimStart());
}

/** Every line carries an affiliation marker: the block is a cover author list. */
function opensWithAffiliation(features: QuoteFeatures): boolean {
  const lines = features.text.split("\n");
  return lines.length > 0 && lines.every((line) => QUOTE_AFFILIATION_LINE.test(line.trimStart()));
}

/** Whether a block sits directly after a metadata label, so it is that entry's body. */
function followsLabel(measured: readonly QuoteFeatures[], index: number): boolean {
  const previous = measured[index - 1];
  if (previous === undefined) return false;
  const firstLine = previous.text.split("\n", 1)[0] ?? "";
  return QUOTE_LABEL.test(firstLine.trimStart());
}

/** A one-line display line reads as a quote only with attribution or punctuation. */
function hasQuoteShape(features: QuoteFeatures): boolean {
  return QUOTE_ATTRIBUTION.test(features.text) || QUOTE_SENTENCE_END.test(features.text.trimEnd());
}

function isEpigraph(features: QuoteFeatures, context: QuoteContext): boolean {
  if (opensWithLabel(features)) return false;
  if (features.lines.length > QUOTE_EPIGRAPH_MAX_LINES) return false;
  if (!isIndented(features)) return false;
  const smaller =
    context.bodyFontSize > 0 && features.fontSize < context.bodyFontSize * QUOTE_MAX_SIZE_FACTOR;
  const italic = features.italicShare >= QUOTE_ITALIC_SHARE;
  if (!italic && !smaller) return false;
  // A one-line indented face (a subtitle, a byline) is a display line, not a
  // quote, unless it carries attribution or sentence punctuation; a real
  // epigraph is two or more lines, or closed like a sentence (backlog 3A).
  if (features.lines.length === 1 && !hasQuoteShape(features)) return false;
  // Short, indented, italic or smaller: an epigraph. The attribution line
  // (`— Author`) and isolation corroborate but are not required.
  return true;
}

function isBlockquote(features: QuoteFeatures, context: QuoteContext): boolean {
  if (opensWithLabel(features)) return false;
  if (!isIndented(features)) return false;
  const smaller =
    context.bodyFontSize > 0 && features.fontSize < context.bodyFontSize * QUOTE_MAX_SIZE_FACTOR;
  const spaced = leadingDiffers(features, context);
  const corroborated = smaller || spaced || QUOTE_ATTRIBUTION.test(features.text);
  // A lone indented line (an affiliation, an e-mail, a byline) is front
  // matter, not a quote: the indent rule only claims a real block of two or
  // more lines, and a single line needs attribution or sentence punctuation
  // to read as a quotation (backlog 3A).
  if (features.lines.length < QUOTE_MIN_INDENT_ONLY_LINES && !hasQuoteShape(features)) return false;
  // Indent alone is enough for a block quote of two or more lines (the "recuo"
  // of E5-T04); the smaller face or a different leading only raise confidence.
  return corroborated || features.lines.length >= QUOTE_MIN_INDENT_ONLY_LINES;
}

/**
 * One decision per paragraph: which paragraphs are block quotes or
 * epigraphs. Deterministic — same paragraphs and context, same decisions.
 */
export function detectQuotes(
  paragraphs: readonly JoinedParagraph[],
  context: QuoteContext,
): QuoteDecision[] {
  const measured = paragraphs.map((paragraph, index) => featuresOf(paragraph, index, context));

  return measured.map((features, index) => {
    // Dialogue and the body of a metadata label are prose however the page
    // sets them (backlog 3A, second round): the speech dash opens a turn,
    // and a block after `Abstract:` is that entry's own text.
    if (opensWithDialogue(features) || followsLabel(measured, index)) return NOT_A_QUOTE;
    // The numbered affiliation list of a paper's cover is indented and set
    // smaller than the body like an epigraph, but every line carries its
    // marker (backlog 3A — n2-en-astrofisica).
    if (opensWithAffiliation(features)) return NOT_A_QUOTE;
    if (isEpigraph(features, context)) {
      return { quote: true, kind: "epigraph" as const, uncertain: false };
    }
    if (isBlockquote(features, context)) {
      const corroborated =
        (context.bodyFontSize > 0 &&
          features.fontSize < context.bodyFontSize * QUOTE_MAX_SIZE_FACTOR) ||
        leadingDiffers(features, context) ||
        QUOTE_ATTRIBUTION.test(features.text);
      return { quote: true, kind: "blockquote" as const, uncertain: !corroborated };
    }
    return NOT_A_QUOTE;
  });
}
