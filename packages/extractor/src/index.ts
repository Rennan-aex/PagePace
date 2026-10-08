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
export type { DocumentMargins, DocumentStats } from "./stats";
export {
  documentStats,
  LINE_HEIGHT_FALLBACK_FACTOR,
  LINE_HEIGHT_MAX_FACTOR,
  LINE_HEIGHT_MIN_FACTOR,
  StatsError,
} from "./stats";
export const PACKAGE_NAME = "@pagepace/extractor";
