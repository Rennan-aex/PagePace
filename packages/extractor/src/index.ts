export type { PdfjsAssets, PdfjsIngestOptions } from "./ingest/pdfjs";
export { ingestPdfjs, PDFJS_DIST_VERSION, stripSubsetPrefix } from "./ingest/pdfjs";
export { sha256Hex } from "./ingest/sha256";
export type { PageTagInput, TagHintsInput, TagStats } from "./ingest/tag-hints";
export { buildTagHints, evaluateTagStats } from "./ingest/tag-hints";
export const PACKAGE_NAME = "@pagepace/extractor";
