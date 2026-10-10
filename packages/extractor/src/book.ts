import type { Block, Book, RawDocument } from "@pagepace/schema";
import { parseBook, SCHEMA_VERSION } from "@pagepace/schema";
import { HYPHEN_UNCERTAIN_CONFIDENCE, paragraphHyphenText, UNCERTAIN_HYPHEN_FLAG } from "./hyphen";
import { sha256Hex } from "./ingest/sha256";
import { groupDocumentParagraphs } from "./paragraphs";
import { stripRepeatedRegions } from "./repeated";
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
 * for embedded OCR layers (ADR-019). Runs carry no styles yet — that is E4.
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
 * Known limits: no cross-page join, no table of contents or metadata
 * detection, and the single column rule of the paragraph layer.
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
  const pages = groupDocumentParagraphs(stripped.document);
  const fromOcr = document.source.ocrTextLayer === true;
  const confidence = fromOcr ? OCR_TEXT_LAYER_CONFIDENCE : BOOK_BLOCK_CONFIDENCE;

  const blocks: Block[] = [];
  for (const [page, paragraphs] of pages.entries()) {
    let ordinal = 0;
    const pageLabel = stripped.pageLabels[page];
    for (const paragraph of paragraphs) {
      const hyphen = paragraphHyphenText(paragraph);
      const text = normalizeForReader(hyphen.text);
      if (text.trim() === "") continue;
      blocks.push({
        id: blockId(page, ordinal, text),
        kind: "paragraph",
        runs: [{ text }],
        origin: {
          pageFrom: page,
          pageTo: page,
          ...(pageLabel === null || pageLabel === undefined
            ? {}
            : { originalPageLabel: pageLabel }),
        },
        confidence: hyphen.uncertain
          ? Math.min(confidence, HYPHEN_UNCERTAIN_CONFIDENCE)
          : confidence,
        flags: hyphen.uncertain ? [UNCERTAIN_HYPHEN_FLAG] : [],
      });
      ordinal++;
    }
  }

  if (blocks.length === 0) {
    throw new BookError("documento sem texto: nenhum bloco para gerar o Book");
  }

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
      avgConfidence: confidence,
      warnings: fromOcr ? ["ocr-text-layer"] : [],
    },
  });
}
