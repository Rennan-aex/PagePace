import type { Block, Book, RawDocument } from "@pagepace/schema";
import { parseBook, SCHEMA_VERSION } from "@pagepace/schema";
import { BROKEN_FONT_CONFIDENCE, BROKEN_FONT_MAPPING, brokenFontSignal } from "./brokenfont";
import { CAPTION_UNCERTAIN_CONFIDENCE, detectCaptions, UNCERTAIN_CAPTION_FLAG } from "./captions";
import { detectEndnotes } from "./endnotes";
import {
  detectFootnotes,
  FOOTNOTE_UNCERTAIN_CONFIDENCE,
  UNCERTAIN_FOOTNOTE_FLAG,
} from "./footnotes";
import { tagGreekRuns } from "./greek";
import { detectHeadings, type PageMeasure, pageMeasureOf } from "./headings";
import { HYPHEN_UNCERTAIN_CONFIDENCE, paragraphHyphenText, UNCERTAIN_HYPHEN_FLAG } from "./hyphen";
import { sha256Hex } from "./ingest/sha256";
import type { TextLine } from "./lines";
import { detectLists, LIST_UNCERTAIN_CONFIDENCE, UNCERTAIN_LIST_FLAG } from "./lists";
import { bodyMeasures, detectMarginRefs } from "./marginrefs";
import { buildMetadata } from "./metadata";
import {
  CALL_WITHOUT_NOTE_FLAG,
  linkFootnoteCalls,
  NOTE_LINK_UNCERTAIN_CONFIDENCE,
  NOTE_WITHOUT_CALL_FLAG,
} from "./notelinks";
import type { JoinedParagraph } from "./pagejoin";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import { detectQuotes, QUOTE_UNCERTAIN_CONFIDENCE, UNCERTAIN_QUOTE_FLAG } from "./quotes";
import { detectReferences } from "./references";
import { stripRepeatedRegions } from "./repeated";
import { headingRuns, paragraphRuns } from "./runs";
import { SIDEBAR_FLAG } from "./sidebars";
import { documentStats } from "./stats";
import { buildToc } from "./toc";
import { normalizeForReader } from "./unicode";

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
 * Confidence is a provisional constant (the model of REQ-EXT-13 is E7): one
 * value for digital text, a reduced one plus the `ocr-text-layer` warning
 * for embedded OCR layers (ADR-019).
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
 * make confidently gets `flags: ["uncertain-hyphen"]` and the reduced
 * `HYPHEN_UNCERTAIN_CONFIDENCE` (ARCHITECTURE decision 6).
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
 * text but carries `flags: ["broken-font-mapping"]`, the reduced
 * `BROKEN_FONT_CONFIDENCE` and the document-level warning of the same name —
 * the reader is told instead of being handed silent garbage. The detection
 * and its thresholds live in `brokenFontSignal`. `extraction.avgConfidence`
 * is the mean of the block confidences, so one broken chapter moves it.
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
 * `flags: ["uncertain-footnote"]` with the reduced
 * `FOOTNOTE_UNCERTAIN_CONFIDENCE`. Notes restart their numbering by page and
 * by chapter, so the decisions are per page and never compare neighbours. A
 * note that ran out of room at the foot and continues on the next page is
 * one block (the E3-T04 join) and is judged by the page it starts on.
 *
 * Footnote calls (E5-T02 — REQ-EXT-08): after the blocks are built, every
 * note is linked to the call pointing at it (`linkFootnoteCalls`): the call
 * run carries `noteRef` (the note's id), the note carries `anchor`, and the
 * orphans — a note without a call, a call without a note — become the flags
 * `note-without-call` / `call-without-note` with the reduced
 * `NOTE_LINK_UNCERTAIN_CONFIDENCE`. An OCR text layer never gets the pass:
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
 * `flags: ["uncertain-quote"]` and the reduced `QUOTE_UNCERTAIN_CONFIDENCE`.
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
/** Provisional confidence of every block of a digital document. */
export const BOOK_BLOCK_CONFIDENCE = 0.9;
/** Reduced confidence for documents whose text comes from an embedded OCR layer. */
export const OCR_TEXT_LAYER_CONFIDENCE = 0.5;
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
function paragraphMeasures(
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
 * Builds the `Book` for a `RawDocument` and validates it against the schema
 * (throws `SchemaValidationError` if the assembled book is invalid, and
 * `BookError` when there is no text at all).
 */
export function buildBook(document: RawDocument): Book {
  const stripped = stripRepeatedRegions(document);
  const hasText = stripped.document.pages.some((page) => page.items.length > 0);
  const stats = hasText ? documentStats(stripped.document) : null;
  const bodyFontSize = stats?.bodyFontSize ?? 0;
  const pages = groupDocumentParagraphs(stripped.document);
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
  const confidence = fromOcr ? OCR_TEXT_LAYER_CONFIDENCE : BOOK_BLOCK_CONFIDENCE;

  const blocks: Block[] = [];
  // E5-T03: `endnoteBlocks[i]` says whether block `i` came from the endnote pass.
  const endnoteBlocks: boolean[] = [];
  let brokenBlocks = 0;
  const ordinals = new Map<number, number>();
  for (const [index, paragraph] of paragraphs.entries()) {
    const hyphen = paragraphHyphenText(paragraph.lines);
    const text = normalizeForReader(hyphen.text);
    if (text.trim() === "") continue;
    const ordinal = ordinals.get(paragraph.pageFrom) ?? 0;
    ordinals.set(paragraph.pageFrom, ordinal + 1);
    const pageLabel = stripped.pageLabels[paragraph.pageFrom];
    const flags: string[] = [];
    let blockConfidence = confidence;
    if (hyphen.uncertain) {
      flags.push(UNCERTAIN_HYPHEN_FLAG);
      blockConfidence = Math.min(blockConfidence, HYPHEN_UNCERTAIN_CONFIDENCE);
    }
    if (brokenFontSignal(text).broken) {
      flags.push(BROKEN_FONT_MAPPING);
      blockConfidence = Math.min(blockConfidence, BROKEN_FONT_CONFIDENCE);
      brokenBlocks += 1;
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
      blockConfidence = Math.min(blockConfidence, FOOTNOTE_UNCERTAIN_CONFIDENCE);
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
      blockConfidence = Math.min(blockConfidence, QUOTE_UNCERTAIN_CONFIDENCE);
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
      blockConfidence = Math.min(blockConfidence, CAPTION_UNCERTAIN_CONFIDENCE);
    }
    if (indentList && list?.uncertain === true) {
      flags.push(UNCERTAIN_LIST_FLAG);
      blockConfidence = Math.min(blockConfidence, LIST_UNCERTAIN_CONFIDENCE);
    }
    const runs = paragraphRuns(paragraph.lines, { styles: !fromOcr });
    // E5-T07: the box of the margin number itself (top-left page
    // coordinates), the "posição relativa ao texto" of REQ-EXT-19.
    const marginLine = marginRef ? (paragraph.lines[0] as TextLine) : undefined;
    blocks.push({
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
        ...(pageLabel === null || pageLabel === undefined ? {} : { originalPageLabel: pageLabel }),
        ...(marginLine === undefined
          ? {}
          : {
              bbox: [
                {
                  x: marginLine.x,
                  y: marginLine.top,
                  width: marginLine.width,
                  height: marginLine.bottom - marginLine.top,
                },
              ],
            }),
      },
      confidence: blockConfidence,
      flags,
    });
    // E5-T03: `endnoteBlocks[i]` says whether block `i` came from the endnote
    // pass — a block the reference kind won (E5-T06) is no longer a note.
    endnoteBlocks.push(endnote && !reference);
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
      if (decision.withoutCall) {
        block.flags.push(NOTE_WITHOUT_CALL_FLAG);
        block.confidence = Math.min(block.confidence, NOTE_LINK_UNCERTAIN_CONFIDENCE);
      }
      if (decision.orphanCall) {
        block.flags.push(CALL_WITHOUT_NOTE_FLAG);
        block.confidence = Math.min(block.confidence, NOTE_LINK_UNCERTAIN_CONFIDENCE);
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
  if (brokenBlocks > 0) warnings.push(BROKEN_FONT_MAPPING);
  warnings.push(...toc.warnings);

  return parseBook({
    schemaVersion: SCHEMA_VERSION,
    id: document.source.sha256,
    source: { fileName: document.source.fileName, pageCount: document.source.pageCount },
    metadata: buildMetadata(blocks, document.source),
    toc: toc.toc,
    blocks,
    extraction: {
      tool: EXTRACTOR_TOOL,
      version: EXTRACTOR_VERSION,
      avgConfidence: averageConfidence(blocks.map((block) => block.confidence)),
      warnings,
    },
  });
}
