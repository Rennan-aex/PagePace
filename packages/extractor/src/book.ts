import type { Block, Book, RawDocument } from "@pagepace/schema";
import { blockSchema, bookSchema, parseWith, SCHEMA_VERSION } from "@pagepace/schema";
import { linePageMap, paragraphBBoxes } from "./bbox";
import { BROKEN_FONT_MAPPING, brokenFontText } from "./brokenfont";
import { type CaptionDecision, detectCaptions, UNCERTAIN_CAPTION_FLAG } from "./captions";
import { BOOK_BLOCK_CONFIDENCE, blockConfidence, OCR_TEXT_LAYER_CONFIDENCE } from "./confidence";
import { detectEndnotes, type EndnoteDecision } from "./endnotes";
import { detectFootnotes, type FootnoteDecision, UNCERTAIN_FOOTNOTE_FLAG } from "./footnotes";
import { tagGreekRuns } from "./greek";
import { detectHeadings, type HeadingDecision, type PageMeasure, pageMeasureOf } from "./headings";
import { paragraphHyphenText, UNCERTAIN_HYPHEN_FLAG } from "./hyphen";
import { sha256Hex } from "./ingest/sha256";
import type { TextLine } from "./lines";
import { detectLists, type ListDecision, UNCERTAIN_LIST_FLAG } from "./lists";
import { bodyMeasures, detectMarginRefs, type MarginRefDecision } from "./marginrefs";
import { buildMetadata } from "./metadata";
import { CALL_WITHOUT_NOTE_FLAG, linkFootnoteCalls, NOTE_WITHOUT_CALL_FLAG } from "./notelinks";
import type { JoinedParagraph } from "./pagejoin";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import { detectQuotes, type QuoteDecision, UNCERTAIN_QUOTE_FLAG } from "./quotes";
import { detectReferences, type ReferenceDecision } from "./references";
import { type StrippedDocument, stripRepeatedRegions } from "./repeated";
import { headingRuns, paragraphRuns } from "./runs";
import { SIDEBAR_FLAG } from "./sidebars";
import { type DocumentStats, documentStats } from "./stats";
import { buildToc } from "./toc";
import { normalizeForReader } from "./unicode";

export { BOOK_BLOCK_CONFIDENCE, OCR_TEXT_LAYER_CONFIDENCE } from "./confidence";

/**
 * Minimal `Book` builder (E2-T05 — layer 7, "saída").
 *
 * Every paragraph of every page becomes a `kind: "paragraph"` block whose
 * `origin` points at its page (paragraphs never cross a page — that join is
 * E3-T04). Ids follow decision 4 of the extractor architecture: origin page,
 * ordinal on the page and a hash of the start of the normalized text, so the
 * same extraction always produces the same ids and anchors can re-anchor
 * after re-processing.
 *
 * Confidence (E7-T01 — REQ-EXT-13): every doubt flag a block carries
 * lowers its confidence by the weight of `CONFIDENCE_FLAG_WEIGHTS`
 * (`confidence.ts`) — the weights add up, the result is clamped at the
 * minimum and rounded. The base is `BOOK_BLOCK_CONFIDENCE` for digital text
 * and `OCR_TEXT_LAYER_CONFIDENCE` plus the `ocr-text-layer` warning for
 * embedded OCR layers (ADR-019); `flags` are the reasons, `confidence` the
 * combined number, and the eval measures the pair with
 * `confidence_calibration`.
 *
 * Inline styles (E4-T01): runs carry bold/italic from the embedded font
 * name and sup/sub from size and baseline (`paragraphRuns`), with adjacent
 * runs of one style merged; an OCR text layer keeps plain runs (ADR-019).
 * The concatenated run text is the same text the join always produced.
 *
 * Reading order (E2-T06 + E6-T02): blocks come out **page by page and,
 * inside a page, in reading order** — for a single column that is the
 * trivial top-to-bottom order of REQ-EXT-02, and for a column page the
 * column-aware order of E6-T02 (`groupDocumentParagraphs` splits the items
 * by the columns `detectColumns` found, groups the lines inside each column
 * and reads the flow spanning band first, then each column left to right).
 * Pages follow the document order; the `reading_order` metric of
 * `@pagepace/eval` measures the claim against a golden. A full-width block
 * at the **foot** of a two-column page reads after both columns (the
 * footnote of E6-T04), and repeated regions belong to E3-T02.
 *
 * Unicode (E3-T01): every run text goes through `normalizeForReader` before
 * it reaches the `Book`, so ligatures, soft hyphens, non-breaking spaces,
 * typographic quotes and control characters are folded to one stable form.
 *
 * Repeated regions (E3-T02): running heads, feet and page numbers leave the
 * flow before the paragraphs are built (one `stripRepeatedRegions` pass). A
 * foot that carried the printed number of the page keeps it as
 * `origin.originalPageLabel` on every block of that page (REQ-EXT-06).
 *
 * Hyphenation (E3-T03): paragraph text glues words the typesetter broke with
 * a line-end hyphen (`pala-` + `vra` → `palavra`) while legitimate hyphens
 * keep theirs. A paragraph with at least one decision the rules could not
 * make confidently gets `flags: ["uncertain-hyphen"]`, whose doubt weight
 * lowers the block confidence (ARCHITECTURE decision 6, E7-T01).
 *
 * Cross-page join (E3-T04): a paragraph that runs out of room at the foot
 * of a page and resumes at the head of the next one becomes a single block
 * with `origin.pageFrom` and `origin.pageTo` pointing at both pages. The
 * signals (no sentence stop at the foot, no indent at the head, no heading
 * at the boundary) and the heading guard live in `joinCrossPageParagraphs`.
 * A word broken by a hyphen at the page foot joins automatically, because
 * the lines of both pages enter the same paragraph and `paragraphHyphenText`
 * sees the site.
 *
 * Broken font mapping (E3-T05): a block whose text is full of U+FFFD or
 * private use characters (a font without a usable `ToUnicode`) keeps its
 * text but carries `flags: ["broken-font-mapping"]` (the heaviest doubt
 * weight) and the document-level warning of the same name —
 * the reader is told instead of being handed silent garbage. The detection
 * and its thresholds live in `brokenFontText`, which also asks the
 * common-letter signature of ADR-084 ("à" inside words, the Calibre swap
 * that leaves no unmapped glyph). `extraction.avgConfidence` is the mean
 * of the block confidences, so one broken chapter moves it.
 *
 * Headings (E4-T02 — layer 4, "semântica"): the paragraph list is classified
 * before the blocks are built, and a paragraph the layout marks as display
 * type becomes `kind: "heading"` with a `level` from 1 to 6. Every signal
 * lives in `detectHeadings` (font size, bold, centering, numbering, short
 * isolated lines against the body size, the leading and the measure).
 *
 * Heading styles (E4-T05 — ADR-058): a heading's runs go through
 * `headingRuns`, so the bold that is the **title style** (a bold-dominant
 * face, share ≥ `HEADING_BOLD_SHARE`) is not written as `bold` — `kind` +
 * `level` already carry that meaning — while word-level bold in a
 * not-bold-dominant heading stays, and italic/sup/sub are never touched.
 *
 * Metadata (E4-T04): `metadata` is filled by `buildMetadata` — title and
 * authors from the sanitized PDF info claims (`source.title`/`source.author`),
 * language from the stopword lexicons over the block text combined with the
 * PDF's `/Lang` hint. A document with no usable signal keeps
 * `language: "unknown"` and no title/authors.
 *
 * Footnotes (E5-T01 — REQ-EXT-08): a paragraph the layout marks as a note
 * becomes `kind: "footnote"` instead of `paragraph` — the bottom half of the
 * page, a font smaller than the body and a marker (`1.`, `*`, or the bare
 * `1 A note…` of the SciELO style) or a printed rule above it
 * (`detectFootnotes`). The text, the runs and the origin do not change: only
 * the kind does, and a note accepted by the rule alone carries
 * `flags: ["uncertain-footnote"]`, whose doubt weight lowers the block
 * confidence (E7-T01). Notes restart their numbering by page and
 * by chapter, so the decisions are per page and never compare neighbours. A
 * note that ran out of room at the foot and continues on the next page is
 * one block (the E3-T04 join) and is judged by the page it starts on.
 *
 * Footnote calls (E5-T02 — REQ-EXT-08): after the blocks are built, every
 * note is linked to the call pointing at it (`linkFootnoteCalls`): the call
 * run carries `noteRef` (the note's id), the note carries `anchor`, and the
 * orphans — a note without a call, a call without a note — become the flags
 * `note-without-call` / `call-without-note`, whose doubt weights lower the
 * block confidence (E7-T01). An OCR text layer never gets the pass:
 * without `Run.sup` it could only invent flags (ADR-060).
 *
 * Endnotes (E5-T03 — REQ-EXT-08): a paragraph of a notes section becomes a
 * `footnote` block too, wherever the section stands (`detectEndnotes`: a
 * section title plus a run of marker-led paragraphs — the layout signals of
 * E5-T01 cannot see them, they are body-sized). The schema already carries
 * the concept, so nothing else changes (ADR-061). Their calls live on
 * earlier pages, so `linkFootnoteCalls` falls back to the endnote list by
 * label in reading order, and a page of endnotes never raises
 * `call-without-note`.
 *
 * Block quotes and epigraphs (E5-T04 — REQ-EXT-09): a paragraph whose every
 * line sits inside the measure becomes `blockquote`, or `epigraph` when it
 * is short, indented and italic-dominant or smaller than the body
 * (`detectQuotes`). A quote accepted by the indent rule alone carries
 * `flags: ["uncertain-quote"]`, whose doubt weight lowers the block
 * confidence (E7-T01).
 * A footnote or a heading is never a quote: the size gates are
 * complementary (a note is smaller than `FOOTNOTE_MAX_SIZE_FACTOR`, a
 * heading is flush left).
 *
 * Lists and captions (E5-T05 — layer 4): a paragraph that opens with a
 * bullet or a number (`1.`, `*`) is a `list_item`, and so is a block whose
 * every line sits in the shallow indent below the block-quote gate
 * (`detectLists`, `flags: ["uncertain-list"]` when the indent is the only
 * signal). A paragraph that opens like a printed figure/table label (`Fig.
 * 3 - …`, `Table 2: …`) is a `caption` (`detectCaptions`,
 * `flags: ["uncertain-caption"]` when the type size and the line count do
 * not agree). Kind priority inside the loop: margin_ref > reference >
 * footnote > heading > caption > marked list > quote > indent-only list >
 * paragraph — a marked item outranks a quote (a bullet inside an indented
 * quote is still a list item) while an indent-only item never claims a
 * quote's indent.
 *
 * References (E5-T06 — layer 4): the paragraphs of a titled bibliography
 * section become `reference` blocks (`detectReferences`: an exact lexicon
 * title plus entry-shaped paragraphs — bracketed label, year or upper-case
 * opening — until the next heading). The section title is the evidence, so
 * the kind outranks every other one, including the foot note of E5-T01: a
 * numbered entry set smaller in the page foot is still a reference. The
 * schema already carries the concept, so nothing else changes (ADR-064).
 *
 * Margin numbering (E5-T07 — REQ-EXT-19 — layer 4): a one-line paragraph
 * that carries a Bekker/Stephanus number (`1094a`, `327b`) outside the
 * body's text area becomes `kind: "margin_ref"` (`detectMarginRefs`, two
 * gates: text shape and position against a measure taken with the
 * candidates excluded). The block stays in `blocks` at its y position —
 * out of the reading flow by kind, not by removal — and its
 * `origin.bbox` records where the number sits so the reader app can place
 * it beside the text it marks. The kind outranks every other one: the
 * short isolated number would otherwise read as a heading, and the foot
 * of a Stephanus page would read as a footnote. `repeated.ts` never
 * strips the lettered shape, so a Bekker sequence cannot leave the flow
 * as a folio before this pass sees it (ADR-065).
 *
 * Block boxes (E7-T04 — REQ-EXT-12): since E7-T04 **every** block carries
 * `origin.bbox` — one box per page the block touches, the union of its
 * lines on that page (`paragraphBBoxes`, ADR-074). The margin_ref box is
 * unchanged by the generalisation (a one-line block unions to its own
 * line), and the boxes are what the reader app frames behind the "ver
 * original" button of the correction screen (`renderPageRegion`,
 * docs/app/VIEW-ORIGINAL.md).
 *
 * Greek snippets (E5-T08 — REQ-EXT-18): a run whose every letter is Greek
 * script and has at least `GREEK_MIN_LETTERS` letters carries
 * `lang: "grc"` (`tagGreekRuns`) — the obvious block of a foreign
 * quotation. Latin is never tagged: at the character level it is
 * indistinguishable from the document's own alphabet (ADR-066). The text
 * of every run is untouched, so the character-preservation acceptance of
 * the task (no Greek character lost) does not depend on this pass.
 *
 * Side regions (E6-T03): a paragraph whose every line belongs to a side
 * band (`splitSideRegions`; grouped last on its page by
 * `groupPageParagraphs`) leaves the reading flow by order **and** carries
 * `flags: ["sidebar"]` — the same "kept, never removed" contract as
 * `margin_ref` (E5-T07). The confidence is not reduced: the claim is
 * structural, not doubt. Side lines never enter any measure, so the
 * gates of E4/E5 judge the body they belong to.
 *
 * Column measures (E6-T04): every paragraph is judged against the band it
 * starts in (`paragraphMeasures`): the column of a two-column page, the
 * full-width strip of a spanning block, the page for single-column and
 * side-region paragraphs. A body paragraph of column 2 is flush left **of
 * its column** (it stops reading as a block quote), a heading there is
 * measured against its own column, and a spanning block still spans the
 * page.
 *
 * Known limits: a table of contents comes from the PDF bookmarks or from the
 * detected headings (`buildToc`, E4-T03) — the printed index of the book is
 * still read as text, a heading without space above it needs
 * a display signal of its own, and the eval's `hyphen_join_acc` still scores
 * only intra-page sites (it walks the per-page paragraphs).
 */

/** Value written to `extraction.tool`. */
export const EXTRACTOR_TOOL = "@pagepace/extractor";
/** Value written to `extraction.version` (keep in sync with the package). */
export const EXTRACTOR_VERSION = "0.0.0";
/** Characters of block text hashed into the block id. */
export const BLOCK_ID_HASH_CHARS = 32;
/** Hex characters of the hash kept in the block id. */
export const BLOCK_ID_HASH_LENGTH = 8;
/** Decimal places kept in `extraction.avgConfidence` (deterministic rounding). */
export const AVG_CONFIDENCE_DECIMALS = 2;

/** Raised when the document produces no block the schema would accept. */
export class BookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookError";
  }
}

const encoder = new TextEncoder();

function normalizeForHash(text: string): string {
  return normalizeForReader(text).replace(/\s+/g, " ").trim();
}

/** Mean of the block confidences, rounded so the same book always reports the same number. */
export function averageConfidence(confidences: readonly number[]): number {
  if (confidences.length === 0) return BOOK_BLOCK_CONFIDENCE;
  const total = confidences.reduce((sum, value) => sum + value, 0);
  const factor = 10 ** AVG_CONFIDENCE_DECIMALS;
  return Math.round((total / confidences.length) * factor) / factor;
}

/** Stable id: origin page, ordinal on the page, hash of the start of the text. */
export function blockId(page: number, ordinal: number, text: string): string {
  const excerpt = normalizeForHash(text).slice(0, BLOCK_ID_HASH_CHARS);
  const digest = sha256Hex(encoder.encode(excerpt));
  return `p${page}-b${ordinal}-${digest.slice(0, BLOCK_ID_HASH_LENGTH)}`;
}

/**
 * The measure every paragraph of the joined flow is judged against
 * (E6-T04): the band the paragraph starts in — the full-width strip or one
 * column of a two-column page (the `band` its first line carries) — so a
 * body paragraph of column 2 is flush left **of its column** while a
 * spanning block (title, abstract, footnote at the foot) still spans the
 * page. A side-region paragraph falls back to its page's measure, like
 * before. The lines of a paragraph joined across pages come from
 * `pageFrom`, so its measure is the one of the page it starts on;
 * `pageMeasureOf` keeps excluding margin references and side lines.
 */
export function paragraphMeasures(
  paragraphs: readonly JoinedParagraph[],
  pages: readonly (readonly (readonly TextLine[])[])[],
  marginRefLines: ReadonlySet<TextLine>,
): PageMeasure[] {
  const perBand = new Map<string, PageMeasure>();
  const perPage = new Map<number, PageMeasure>();
  return paragraphs.map((paragraph) => {
    const firstLine = paragraph.lines[0];
    const band = firstLine?.band;
    const pageLines = (pages[paragraph.pageFrom] ?? []).flat();
    if (firstLine?.side !== true && band !== undefined && band > 0) {
      const key = `${paragraph.pageFrom}/${band}`;
      let measure = perBand.get(key);
      if (measure === undefined) {
        measure = pageMeasureOf(
          pageLines.filter(
            (line) => line.band === band && !marginRefLines.has(line) && line.side !== true,
          ),
        );
        perBand.set(key, measure);
      }
      return measure;
    }
    let measure = perPage.get(paragraph.pageFrom);
    if (measure === undefined) {
      measure = pageMeasureOf(
        pageLines.filter((line) => !marginRefLines.has(line) && line.side !== true),
      );
      perPage.set(paragraph.pageFrom, measure);
    }
    return measure;
  });
}

/**
 * Everything the block builder and the finalization read out of the
 * document-wide passes (E8-T01, fatia 1). Built once by
 * {@link analyzeDocument}: the streaming pipeline analyzes after the full
 * read and then builds the blocks page by page over this same object, which
 * is what keeps the streamed result byte-identical to the batch one.
 */
export interface BookAnalysis {
  /** The document as given: metadata and outline feed the finalization. */
  document: RawDocument;
  /** Repeated regions stripped, with the page labels the foot left behind. */
  stripped: StrippedDocument;
  /** Document statistics; `null` when the document has no text at all. */
  stats: DocumentStats | null;
  /** Lines grouped per page in reading order (column-aware). */
  pages: TextLine[][][];
  /** Page number of every line — the `origin.bbox` pass (E7-T04). */
  linePages: Map<TextLine, number>;
  /** Paragraphs with the cross-page join applied, in reading order. */
  paragraphs: JoinedParagraph[];
  /** Per-paragraph decisions, all indexed like `paragraphs`. */
  marginRefs: MarginRefDecision[];
  marginRefLines: Set<TextLine>;
  measures: PageMeasure[];
  headings: HeadingDecision[];
  footnotes: FootnoteDecision[];
  endnotes: EndnoteDecision[];
  quotes: QuoteDecision[];
  lists: ListDecision[];
  captions: CaptionDecision[];
  references: ReferenceDecision[];
  /** `source.ocrTextLayer === true` on the original document. */
  fromOcr: boolean;
  /**
   * Some item carries `fontFlags.bold`/`italic` — the unique mark of style
   * estimated from the image (E9-T03): pdf.js never emits those flags.
   */
  styleFromImage: boolean;
  /** Base confidence before the doubt flags (E7-T01). */
  base: number;
}

/**
 * Stage 1 of the pipeline (E8-T01, fatia 1): every document-wide pass, in
 * the order `buildBook` always ran them — strip repeated regions, statistics,
 * grouping, the cross-page join, margin numbers, measures and the
 * per-paragraph decisions. Pure: the same document always yields the same
 * analysis, and nothing here touches the clock or any ambient state.
 */
export function analyzeDocument(document: RawDocument): BookAnalysis {
  const stripped = stripRepeatedRegions(document);
  const hasText = stripped.document.pages.some((page) => page.items.length > 0);
  const stats = hasText ? documentStats(stripped.document) : null;
  const bodyFontSize = stats?.bodyFontSize ?? 0;
  const pages = groupDocumentParagraphs(stripped.document);
  // E7-T04: every line knows its page, so each block can carry the union of
  // its lines as `origin.bbox`, one box per page (ADR-074).
  const linePages = linePageMap(pages);
  const paragraphs = joinCrossPageParagraphs(pages, bodyFontSize);
  // E5-T07: margin numbers first — the position gate needs the body measured
  // with the candidates excluded, and every other pass then measures the page
  // without the confirmed numbers (a printed number in the left margin would
  // otherwise pull the measure's left edge out and read the whole page as
  // indented — a wall of blockquotes).
  const marginRefs = detectMarginRefs(paragraphs, { measures: bodyMeasures(pages, paragraphs) });
  const marginRefLines = new Set(
    paragraphs
      .filter((_, index) => marginRefs[index]?.marginRef === true)
      .map((paragraph) => paragraph.lines[0])
      .filter((line): line is TextLine => line !== undefined),
  );
  const measures = paragraphMeasures(paragraphs, pages, marginRefLines);
  const headings = detectHeadings(paragraphs, {
    bodyFontSize,
    lineHeight: stats?.lineHeight ?? 0,
    measures,
  });
  // E5-T01: the notes are read off the pages the paragraphs came from — every
  // signal (region, size, marker, rule) is a fact of that page alone.
  const footnotes = detectFootnotes(
    paragraphs,
    pages.map((page) => page.flat()),
    { bodyFontSize },
  );
  // E5-T03: the endnote section is read off the same paragraph list — a
  // section title and the marker-led run that follows it. The notes keep the
  // `footnote` kind and are linked to their calls across pages by the
  // fallback of `linkFootnoteCalls` (ADR-061: no schema change).
  const endnotes = detectEndnotes(paragraphs, { headings });
  // E5-T04: quotes are read off the same paragraph list — the indent of
  // every line against the measure of its band (E6-T04), the face and the
  // leading.
  const quotes = detectQuotes(paragraphs, {
    bodyFontSize,
    lineHeight: stats?.lineHeight ?? 0,
    measures,
  });
  // E5-T05: lists and captions too — the marker the typesetter printed, the
  // shallow indent below the quote gate, and the figure/table label.
  const lists = detectLists(paragraphs, { measures });
  const captions = detectCaptions(paragraphs, { bodyFontSize });
  // E5-T06: the bibliography section — the exact title of the lexicon plus
  // the entry-shaped paragraphs that follow it, until the next heading.
  const references = detectReferences(paragraphs, { headings });
  const fromOcr = document.source.ocrTextLayer === true;
  // E9-T03: bold/italic flags on an item only come from the visual heuristic
  // over a scan (pdf.js never emits them — pdfjs.ts), so their presence is
  // the signal that re-enables run styles on an OCR document while the
  // confidence base and the warning stay (ADR-096 leaves this call to E9-T03).
  const styleFromImage = document.pages.some((page) =>
    page.items.some(
      (item) => item.fontFlags?.bold !== undefined || item.fontFlags?.italic !== undefined,
    ),
  );
  // E7-T01: every doubt flag is collected on the block and `blockConfidence`
  // (confidence.ts) combines them — the weights add up, the result is
  // clamped at the minimum and rounded.
  const base = fromOcr ? OCR_TEXT_LAYER_CONFIDENCE : BOOK_BLOCK_CONFIDENCE;

  return {
    document,
    stripped,
    stats,
    pages,
    linePages,
    paragraphs,
    marginRefs,
    marginRefLines,
    measures,
    headings,
    footnotes,
    endnotes,
    quotes,
    lists,
    captions,
    references,
    fromOcr,
    styleFromImage,
    base,
  };
}

/** One page's worth of blocks out of {@link buildBlockChunks} (E8-T01). */
export interface BlockChunk {
  /** `origin.pageFrom` of every block in the chunk (0-based page index). */
  pageIndex: number;
  blocks: Block[];
  /** Parallel to `blocks`: `true` when the block came from the endnote pass. */
  endnoteFlags: boolean[];
}

/**
 * Stage 2 (E8-T01, fatia 1): the block loop as a generator that yields one
 * chunk per page that produced blocks, in reading order. The running state
 * of the loop (the per-page ordinals and the endnote flags) lives inside the
 * generator, so concatenating the chunks gives exactly the block list the
 * batch loop always built — the document-wide finalization runs after them.
 */
export function* buildBlockChunks(analysis: BookAnalysis): Generator<BlockChunk> {
  const {
    stripped,
    linePages,
    paragraphs,
    marginRefs,
    headings,
    footnotes,
    endnotes,
    quotes,
    lists,
    captions,
    references,
    fromOcr,
    styleFromImage,
    base,
  } = analysis;
  const ordinals = new Map<number, number>();
  let chunk: BlockChunk | undefined;
  for (const [index, paragraph] of paragraphs.entries()) {
    if (chunk === undefined || chunk.pageIndex !== paragraph.pageFrom) {
      if (chunk !== undefined && chunk.blocks.length > 0) yield chunk;
      chunk = { pageIndex: paragraph.pageFrom, blocks: [], endnoteFlags: [] };
    }
    const hyphen = paragraphHyphenText(paragraph.lines);
    const text = normalizeForReader(hyphen.text);
    if (text.trim() === "") continue;
    const ordinal = ordinals.get(paragraph.pageFrom) ?? 0;
    ordinals.set(paragraph.pageFrom, ordinal + 1);
    const pageLabel = stripped.pageLabels[paragraph.pageFrom];
    const flags: string[] = [];
    if (hyphen.uncertain) {
      flags.push(UNCERTAIN_HYPHEN_FLAG);
    }
    if (brokenFontText(text)) {
      flags.push(BROKEN_FONT_MAPPING);
    }
    // E5-T07: a margin number outranks every kind — the short isolated
    // shape would read as a heading (E4-T02) and the foot of a Stephanus
    // page as a footnote (E5-T01).
    const marginRef = marginRefs[index]?.marginRef === true;
    // E6-T03: a side-region paragraph leaves the reading flow by order and
    // by flag — kept in `blocks` like `margin_ref` (E5-T07), never removed.
    // The confidence is not reduced: the claim is structural, not doubt.
    const side = paragraph.lines.length > 0 && paragraph.lines.every((line) => line.side === true);
    if (side && !marginRef) flags.push(SIDEBAR_FLAG);
    // E5-T06: the section title is the evidence, so a reference outranks
    // every other kind — including the note of the page foot (a numbered
    // entry set smaller reads as a footnote to E5-T01).
    const reference = !marginRef && references[index]?.reference === true;
    if (footnotes[index]?.uncertain === true && !reference && !marginRef) {
      flags.push(UNCERTAIN_FOOTNOTE_FLAG);
    }
    const endnote = endnotes[index]?.endnote === true;
    // E5-T03: a paragraph of the endnote section is a note like any other —
    // the section is what the layout could not say (body size, mid page).
    const footnote = !reference && !marginRef && (footnotes[index]?.footnote === true || endnote);
    const decision = headings[index];
    // A note and a heading can not be the same paragraph (the size gates are
    // complementary), but the kind of the note wins if they ever disagree.
    const heading = !footnote && !marginRef && decision?.heading === true;
    // E5-T04: a quote never wins over a note or a title — the gates are
    // complementary (indented vs flush left, mid page vs foot region).
    const quote = !footnote && !heading && !reference && !marginRef ? quotes[index] : undefined;
    const quoteKind = quote?.quote === true ? quote.kind : undefined;
    if (quote?.quote === true && quote.uncertain === true) {
      flags.push(UNCERTAIN_QUOTE_FLAG);
    }
    // E5-T05: the printed label of a figure or a table outranks quotes and
    // lists (a caption may sit indented under its figure); a marked item
    // outranks a quote (a bullet inside an indented quote is still an
    // item); an indent-only item never claims a quote's indent.
    const caption = !footnote && !heading && !reference && !marginRef ? captions[index] : undefined;
    const list = !footnote && !heading && !reference && !marginRef ? lists[index] : undefined;
    const isCaption = caption?.caption === true;
    const markedList = list?.marked === true;
    const indentList = !isCaption && !markedList && list?.list === true;
    if (isCaption && caption?.uncertain === true) {
      flags.push(UNCERTAIN_CAPTION_FLAG);
    }
    if (indentList && list?.uncertain === true) {
      flags.push(UNCERTAIN_LIST_FLAG);
    }
    // E9-T03: an OCR document keeps its runs plain unless the visual
    // heuristic estimated style (`styleFromImage`) — the warning and the
    // confidence base stay either way.
    const runs = paragraphRuns(paragraph.lines, { styles: !fromOcr || styleFromImage });
    chunk.blocks.push({
      id: blockId(paragraph.pageFrom, ordinal, text),
      kind: marginRef
        ? "margin_ref"
        : reference
          ? "reference"
          : footnote
            ? "footnote"
            : heading
              ? "heading"
              : isCaption
                ? "caption"
                : markedList
                  ? "list_item"
                  : (quoteKind ?? (indentList ? "list_item" : "paragraph")),
      ...(heading ? { level: decision.level } : {}),
      // E4-T05 (ADR-058): a heading never carries its title style as run
      // bold — `kind` + `level` already say it. Word-level bold below the
      // title-style share stays, as do italic/sup/sub.
      // E5-T08: a run whose every letter is Greek carries `lang: "grc"`
      // (ADR-066) — an annotation only, the text never changes.
      runs: tagGreekRuns(heading ? headingRuns(runs) : runs),
      origin: {
        pageFrom: paragraph.pageFrom,
        pageTo: paragraph.pageTo,
        // E7-T04: one box per page (top-left coordinates, ADR-074) — the
        // union of the block's lines on that page, the data "ver original"
        // frames. A margin_ref (E5-T07) unions to its own single line.
        bbox: paragraphBBoxes(paragraph, linePages),
        ...(pageLabel === null || pageLabel === undefined ? {} : { originalPageLabel: pageLabel }),
      },
      confidence: blockConfidence(base, flags),
      flags,
    });
    // E5-T03: the chunk says whether the block came from the endnote pass —
    // a block the reference kind won (E5-T06) is no longer a note.
    chunk.endnoteFlags.push(endnote && !reference);
  }
  if (chunk !== undefined && chunk.blocks.length > 0) yield chunk;
}

/**
 * Stage 3 (E8-T01, fatia 1): the document-wide finalization. Concatenates
 * the chunks (throwing `BookError` when no block survives, exactly as
 * `buildBook` always did), runs the passes that may still touch any block —
 * footnote calls (E5-T02) and toc levels (E4-T03) — and assembles the
 * validated `Book` with metadata (E4-T04) and warnings.
 */
export function finalizeBook(analysis: BookAnalysis, chunks: Iterable<BlockChunk>): Book {
  const { document, fromOcr, base } = analysis;
  const blocks: Block[] = [];
  // Parallel to `blocks`: `true` when the block came from the endnote pass.
  const endnoteBlocks: boolean[] = [];
  for (const chunk of chunks) {
    blocks.push(...chunk.blocks);
    endnoteBlocks.push(...chunk.endnoteFlags);
  }

  if (blocks.length === 0) {
    throw new BookError("documento sem texto: nenhum bloco para gerar o Book");
  }

  // E5-T02: link each note to its call — the call run gets `noteRef`, the
  // note gets `anchor`, and the orphans become flags with the reduced
  // confidence. An OCR layer never gets the pass: without `Run.sup` it could
  // only invent flags (ADR-060).
  if (!fromOcr) {
    const links = linkFootnoteCalls(
      blocks.map((block, blockIndex) => ({
        id: block.id,
        kind: block.kind,
        pageFrom: block.origin.pageFrom,
        pageTo: block.origin.pageTo,
        runs: block.runs,
        endnote: endnoteBlocks[blockIndex] === true,
      })),
    );
    for (const [index, decision] of links.entries()) {
      const block = blocks[index];
      if (block === undefined) continue;
      for (const [runIndex, noteId] of decision.noteRefs) {
        const run = block.runs[runIndex];
        if (run !== undefined) run.noteRef = noteId;
      }
      if (decision.anchor !== null) block.anchor = decision.anchor;
      if (decision.withoutCall) block.flags.push(NOTE_WITHOUT_CALL_FLAG);
      if (decision.orphanCall) block.flags.push(CALL_WITHOUT_NOTE_FLAG);
      if (decision.withoutCall || decision.orphanCall) {
        block.confidence = blockConfidence(base, block.flags);
      }
    }
  }

  // E4-T03: the table of contents, and the levels the bookmarks settle.
  const toc = buildToc(blocks, document.outline);
  for (const block of blocks) {
    const level = toc.outlineLevels.get(block.id);
    if (level !== undefined) block.level = level;
  }

  const warnings: string[] = fromOcr ? ["ocr-text-layer"] : [];
  // The batch loop counted broken blocks as it went; after the E8-T01 split
  // the same test reads the flag off the blocks (pushed under the very same
  // condition in `buildBlockChunks`, never removed afterwards).
  if (blocks.some((block) => block.flags.includes(BROKEN_FONT_MAPPING))) {
    warnings.push(BROKEN_FONT_MAPPING);
  }
  warnings.push(...toc.warnings);

  // E8-T03 (fatia 3): validate the book envelope without its blocks and each
  // block on its own — the same pattern the read window applies per page.
  // Parsing the assembled book in one piece doubled it for a moment, which
  // pushed the peak of a long book past its memory budget.
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (block !== undefined) blocks[index] = parseWith(blockSchema, block, "Block");
  }
  const envelope = parseWith(
    bookSchema,
    {
      schemaVersion: SCHEMA_VERSION,
      id: document.source.sha256,
      source: { fileName: document.source.fileName, pageCount: document.source.pageCount },
      metadata: buildMetadata(blocks, document.source),
      toc: toc.toc,
      // The array must hold at least one element (schema `min(1)`); the real
      // validated blocks attach right after the envelope is validated.
      blocks: blocks.slice(0, 1),
      extraction: {
        tool: EXTRACTOR_TOOL,
        version: EXTRACTOR_VERSION,
        avgConfidence: averageConfidence(blocks.map((block) => block.confidence)),
        warnings,
      },
    },
    "Book",
  );
  envelope.blocks = blocks;
  return envelope;
}

/**
 * Builds the `Book` for a `RawDocument` and validates it against the schema
 * (throws `SchemaValidationError` if the assembled book is invalid, and
 * `BookError` when there is no text at all).
 *
 * Since E8-T01 (fatia 1) this is the composition of the three stages —
 * `analyzeDocument` → `buildBlockChunks` → `finalizeBook` — exactly the
 * pipeline `extractStream` runs event by event (fatia 2, ADR-088).
 */
export function buildBook(document: RawDocument): Book {
  const analysis = analyzeDocument(document);
  return finalizeBook(analysis, buildBlockChunks(analysis));
}
