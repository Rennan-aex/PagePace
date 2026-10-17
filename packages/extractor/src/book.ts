import type { Block, Book, RawDocument } from "@pagepace/schema";
import { parseBook, SCHEMA_VERSION } from "@pagepace/schema";
import { BROKEN_FONT_CONFIDENCE, BROKEN_FONT_MAPPING, brokenFontSignal } from "./brokenfont";
import { detectEndnotes } from "./endnotes";
import {
  detectFootnotes,
  FOOTNOTE_UNCERTAIN_CONFIDENCE,
  UNCERTAIN_FOOTNOTE_FLAG,
} from "./footnotes";
import { detectHeadings, pageMeasureOf } from "./headings";
import { HYPHEN_UNCERTAIN_CONFIDENCE, paragraphHyphenText, UNCERTAIN_HYPHEN_FLAG } from "./hyphen";
import { sha256Hex } from "./ingest/sha256";
import { buildMetadata } from "./metadata";
import {
  CALL_WITHOUT_NOTE_FLAG,
  linkFootnoteCalls,
  NOTE_LINK_UNCERTAIN_CONFIDENCE,
  NOTE_WITHOUT_CALL_FLAG,
} from "./notelinks";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import { stripRepeatedRegions } from "./repeated";
import { headingRuns, paragraphRuns } from "./runs";
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
 * Reading order (E2-T06): blocks come out **page by page and, inside a page,
 * top to bottom** — the trivial single-column order of REQ-EXT-02. Pages
 * follow the document order and a page's paragraphs follow their first line,
 * both already sorted by the layers below; the `reading_order` metric of
 * `@pagepace/eval` measures the claim against a golden, and this module only
 * has to keep the order stable. Columns and repeated regions belong to E6.
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
 * Known limits: a table of contents comes from the PDF bookmarks or from the
 * detected headings (`buildToc`, E4-T03) — the printed index of the book is
 * still read as text, the single column
 * rule of the paragraph layer stands, a heading without space above it needs
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
  const headings = detectHeadings(paragraphs, {
    bodyFontSize,
    lineHeight: stats?.lineHeight ?? 0,
    measures: pages.map((page) => pageMeasureOf(page.flat())),
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
    if (footnotes[index]?.uncertain === true) {
      flags.push(UNCERTAIN_FOOTNOTE_FLAG);
      blockConfidence = Math.min(blockConfidence, FOOTNOTE_UNCERTAIN_CONFIDENCE);
    }
    // E5-T03: a paragraph of the endnote section is a note like any other —
    // the section is what the layout could not say (body size, mid page).
    const endnote = endnotes[index]?.endnote === true;
    const footnote = footnotes[index]?.footnote === true || endnote;
    const decision = headings[index];
    // A note and a heading can not be the same paragraph (the size gates are
    // complementary), but the kind of the note wins if they ever disagree.
    const heading = !footnote && decision?.heading === true;
    const runs = paragraphRuns(paragraph.lines, { styles: !fromOcr });
    blocks.push({
      id: blockId(paragraph.pageFrom, ordinal, text),
      kind: footnote ? "footnote" : heading ? "heading" : "paragraph",
      ...(heading ? { level: decision.level } : {}),
      // E4-T05 (ADR-058): a heading never carries its title style as run
      // bold — `kind` + `level` already say it. Word-level bold below the
      // title-style share stays, as do italic/sup/sub.
      runs: heading ? headingRuns(runs) : runs,
      origin: {
        pageFrom: paragraph.pageFrom,
        pageTo: paragraph.pageTo,
        ...(pageLabel === null || pageLabel === undefined ? {} : { originalPageLabel: pageLabel }),
      },
      confidence: blockConfidence,
      flags,
    });
    endnoteBlocks.push(endnote);
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
