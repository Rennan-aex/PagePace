export { composeAccentItems } from "./accents";
export {
  BLOCK_ID_HASH_CHARS,
  BLOCK_ID_HASH_LENGTH,
  BOOK_BLOCK_CONFIDENCE,
  BookError,
  blockId,
  buildBook,
  EXTRACTOR_TOOL,
  EXTRACTOR_VERSION,
  OCR_TEXT_LAYER_CONFIDENCE,
} from "./book";
export type { PdfjsAssets, PdfjsIngestOptions } from "./ingest/pdfjs";
export { ingestPdfjs, PDFJS_DIST_VERSION, stripSubsetPrefix } from "./ingest/pdfjs";
export { sha256Hex } from "./ingest/sha256";
export type { PageTagInput, TagHintsInput, TagStats } from "./ingest/tag-hints";
export { buildTagHints, evaluateTagStats } from "./ingest/tag-hints";
export type { OperatorListLike, RenderModeChars } from "./ingest/text-layer";
export {
  countRenderModeChars,
  isOcrTextLayer,
  OCR_TEXT_LAYER_MAJORITY,
  SCANNED_PDF_MESSAGE,
  ScannedPdfError,
} from "./ingest/text-layer";
export type { TextLine } from "./lines";
export {
  documentLines,
  groupLines,
  LINE_BASELINE_TOLERANCE_FACTOR,
  LINE_OVERLAP_MIN_FACTOR,
} from "./lines";
export {
  documentParagraphs,
  groupParagraphs,
  PARAGRAPH_EXTRA_SPACE_FACTOR,
  PARAGRAPH_INDENT_FACTOR,
  PARAGRAPH_JUSTIFIED_MIN_SHARE,
  PARAGRAPH_MEASURE_TOLERANCE,
  paragraphText,
} from "./paragraphs";
export type {
  RepeatedBand,
  RepeatedOccurrence,
  RepeatedRegion,
  StrippedDocument,
} from "./repeated";
export {
  detectRepeatedRegions,
  PAGE_LABEL_DECORATION_MAX,
  REPEATED_BASELINE_TOLERANCE_FACTOR,
  REPEATED_FONT_MAX_FACTOR,
  REPEATED_MIN_PAGE_SHARE,
  REPEATED_MIN_PAGES,
  stripRepeatedRegions,
} from "./repeated";
export { itemsText, SPACE_GAP_FACTOR, spaceBetween } from "./spaces";
export type { DocumentMargins, DocumentStats } from "./stats";
export {
  documentStats,
  LINE_HEIGHT_FALLBACK_FACTOR,
  LINE_HEIGHT_MAX_FACTOR,
  LINE_HEIGHT_MIN_FACTOR,
  StatsError,
} from "./stats";
export { normalizeForReader, normalizeUnicode, SOFT_HYPHEN } from "./unicode";
export const PACKAGE_NAME = "@pagepace/extractor";
