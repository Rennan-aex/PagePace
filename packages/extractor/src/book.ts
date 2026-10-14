import type { Block, Book, RawDocument } from "@pagepace/schema";
import { parseBook, SCHEMA_VERSION } from "@pagepace/schema";
import { BROKEN_FONT_CONFIDENCE, BROKEN_FONT_MAPPING, brokenFontSignal } from "./brokenfont";
import { detectHeadings, pageMeasureOf } from "./headings";
import { HYPHEN_UNCERTAIN_CONFIDENCE, paragraphHyphenText, UNCERTAIN_HYPHEN_FLAG } from "./hyphen";
import { sha256Hex } from "./ingest/sha256";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import { stripRepeatedRegions } from "./repeated";
import { paragraphRuns } from "./runs";
import { documentStats } from "./stats";
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
 * Known limits: a table of contents or metadata is not detected, the single
 * column rule of the paragraph layer stands, a heading without space above it
 * needs a display signal of its own, and the eval's `hyphen_join_acc`
 * still scores only intra-page sites (it walks the per-page paragraphs).
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
  const fromOcr = document.source.ocrTextLayer === true;
  const confidence = fromOcr ? OCR_TEXT_LAYER_CONFIDENCE : BOOK_BLOCK_CONFIDENCE;

  const blocks: Block[] = [];
  const confidences: number[] = [];
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
    confidences.push(blockConfidence);
    const decision = headings[index];
    const heading = decision?.heading === true;
    blocks.push({
      id: blockId(paragraph.pageFrom, ordinal, text),
      kind: heading ? "heading" : "paragraph",
      ...(heading ? { level: decision.level } : {}),
      runs: paragraphRuns(paragraph.lines, { styles: !fromOcr }),
      origin: {
        pageFrom: paragraph.pageFrom,
        pageTo: paragraph.pageTo,
        ...(pageLabel === null || pageLabel === undefined ? {} : { originalPageLabel: pageLabel }),
      },
      confidence: blockConfidence,
      flags,
    });
  }

  if (blocks.length === 0) {
    throw new BookError("documento sem texto: nenhum bloco para gerar o Book");
  }

  const warnings: string[] = fromOcr ? ["ocr-text-layer"] : [];
  if (brokenBlocks > 0) warnings.push(BROKEN_FONT_MAPPING);

  return parseBook({
    schemaVersion: SCHEMA_VERSION,
    id: document.source.sha256,
    source: { fileName: document.source.fileName, pageCount: document.source.pageCount },
    metadata: { language: "unknown" },
    toc: [],
    blocks,
    extraction: {
      tool: EXTRACTOR_TOOL,
      version: EXTRACTOR_VERSION,
      avgConfidence: averageConfidence(confidences),
      warnings,
    },
  });
}
