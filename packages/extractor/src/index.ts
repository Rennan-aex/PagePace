export { composeAccentItems, stripOrnamentItems } from "./accents";
export { BBOX_DECIMALS, linePageMap, linesBBox, paragraphBBoxes } from "./bbox";
export {
  AVG_CONFIDENCE_DECIMALS,
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
export type { BrokenFontSignal } from "./brokenfont";
export {
  BROKEN_FONT_CONFIDENCE,
  BROKEN_FONT_MAPPING,
  BROKEN_FONT_MIN_INTERNAL_ACCENTS,
  BROKEN_FONT_MIN_SUSPECT_CHARS,
  BROKEN_FONT_MIN_SUSPECT_SHARE,
  brokenFontSignal,
  brokenFontText,
  internalAccentSwaps,
  isSuspectCodePoint,
  REPLACEMENT_CHARACTER,
} from "./brokenfont";
export type { CachedExtraction, ExtractionCacheKey, ExtractionCacheStore } from "./cache";
export {
  extractCached,
  extractionCacheKey,
  extractionCacheKeyFor,
  MemoryExtractionCache,
  readCachedBook,
  writeCachedBook,
} from "./cache";
export type { ColumnDetectionOptions, ColumnRange, PageColumns } from "./columns";
export {
  COLUMNS_BIN_WIDTH,
  COLUMNS_MAX,
  COLUMNS_MIN_COLUMN_LINES,
  COLUMNS_MIN_COLUMN_SHARE,
  COLUMNS_MIN_CROSSING_LINES,
  COLUMNS_MIN_GUTTER_FACTOR,
  COLUMNS_SPANNING_MAX_SHARE,
  detectColumns,
  detectDocumentColumns,
  detectPageColumns,
} from "./columns";
export type { EndnoteContext, EndnoteDecision } from "./endnotes";
export { detectEndnotes, ENDNOTE_SECTION_TITLES, normalizeSectionTitle } from "./endnotes";
export type {
  ExplainedHyphenSite,
  ExplainedLayer,
  ExplainedLine,
  ExplainedParagraph,
  PageExplanation,
} from "./explain";
export { ExplainPageError, explainPage } from "./explain";
export type { FigureContext, FigureDecision } from "./figures";
export {
  detectFigures,
  FIGURE_CAPTION_GAP_FACTOR,
  FIGURE_MAX_PAGE_SHARE,
  FIGURE_MERGE_GAP_FACTOR,
  FIGURE_MIN_PAGE_SHARE,
} from "./figures";
export type { FontStyle, FontStyleBasis } from "./fontstyle";
export { classifyFontName, fontNameTokens } from "./fontstyle";
export type { FootnoteContext, FootnoteDecision } from "./footnotes";
export {
  detectFootnotes,
  FOOTNOTE_BARE_MARKER,
  FOOTNOTE_FURNITURE_BASELINE_TOLERANCE,
  FOOTNOTE_FURNITURE_MIN_PAGES,
  FOOTNOTE_MARKER,
  FOOTNOTE_MAX_SIZE_FACTOR,
  FOOTNOTE_PROSE_MIN_LETTERS,
  FOOTNOTE_REGION_TOP_SHARE,
  FOOTNOTE_RULE_MIN_CHARS,
  FOOTNOTE_UNCERTAIN_CONFIDENCE,
  opensWithNoteMarker,
  UNCERTAIN_FOOTNOTE_FLAG,
} from "./footnotes";
export type { GreekSignal } from "./greek";
export { GREEK_LANG, GREEK_MIN_LETTERS, greekScriptSignal, tagGreekRuns } from "./greek";
export type { HeadingContext, HeadingDecision, PageMeasure } from "./headings";
export {
  detectHeadings,
  HEADING_BOLD_SHARE,
  HEADING_CAPTION_MARKER,
  HEADING_CENTER_TOLERANCE,
  HEADING_CENTER_WIDTH_SHARE,
  HEADING_INDENT_MAX_FACTOR,
  HEADING_ISOLATION_FACTOR,
  HEADING_ITALIC_MAX_SHARE,
  HEADING_LIST_MARKER,
  HEADING_MAX_LEVEL,
  HEADING_MAX_LINES,
  HEADING_MIN_SIZE_FACTOR,
  HEADING_NUMBERING_WORD,
  HEADING_SECTION_NUMBERING,
  HEADING_SHORT_MAX_LINES,
  HEADING_SHORT_WIDTH_SHARE,
  HEADING_SIZE_CLUSTER_FACTOR,
  HEADING_SIZE_FACTOR,
  headingLevels,
  pageMeasureOf,
} from "./headings";
export type { HyphenJoinDecision, HyphenJoinResult, HyphenSite } from "./hyphen";
export {
  HYPHEN_CLITICS_EN,
  HYPHEN_CLITICS_PT,
  HYPHEN_LEXICON_EN,
  HYPHEN_LEXICON_PT,
  HYPHEN_UNCERTAIN_CONFIDENCE,
  hyphenJoinDecision,
  hyphenSiteBetween,
  joinHyphenatedLines,
  joinHyphenatedText,
  paragraphHyphenText,
  UNCERTAIN_HYPHEN_FLAG,
} from "./hyphen";
export type { BoundaryVerdict, MemorySample, MemoryUsageProbe } from "./ingest/memory";
export { MB, MemoryGovernor, MemoryLimitError } from "./ingest/memory";
export type {
  OcrEngine,
  OcrImage,
  OcrIngestOptions,
  OcrLine,
  OcrPageInput,
  OcrWord,
} from "./ingest/ocr";
export {
  ingestOcr,
  OCR_FONT_NAME,
  OCR_MIN_WORD_POINTS,
  OCR_RENDER_SCALE,
  ocrPageToRawPage,
} from "./ingest/ocr";
export type {
  OcrFlowOptions,
  OcrFlowProgress,
  OcrFlowRenderedPage,
} from "./ingest/ocr-flow";
export { ingestOcrFlow } from "./ingest/ocr-flow";
export type { OcrRaster, OcrWordStyle, StyleWordInput } from "./ingest/ocr-style";
export {
  estimatePageWordStyles,
  OCR_BOLD_STROKE_RATIO,
  OCR_ITALIC_MAX_SKEW_DEG,
  OCR_ITALIC_MIN_SKEW_DEG,
  OCR_ITALIC_PEAK_RATIO,
  OCR_STYLE_MIN_CONFIDENCE,
  OCR_STYLE_MIN_CONTRAST,
  OCR_STYLE_MIN_ENGINE_CONFIDENCE,
  OCR_STYLE_MIN_INK,
  OCR_STYLE_MIN_MEASURED_WORDS,
  OCR_X_HEIGHT_RATIO,
  OCR_X_HEIGHT_ROW_SHARE,
} from "./ingest/ocr-style";
export type { TesseractOcrEngineOptions } from "./ingest/ocr-tesseract";
export {
  createTesseractOcrEngine,
  OCR_DEFAULT_LANGS,
  TESSERACT_JS_VERSION,
} from "./ingest/ocr-tesseract";
export type { PdfjsAssets, PdfjsIngestOptions } from "./ingest/pdfjs";
export {
  DEFAULT_CLEANUP_EVERY_PAGES,
  discardFontData,
  ingestPages,
  ingestPdfjs,
  isScannedPdf,
  PDFJS_DIST_VERSION,
  releasePdfjsCaches,
  stripSubsetPrefix,
} from "./ingest/pdfjs";
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
export type { MarginRefContext, MarginRefDecision } from "./marginrefs";
export {
  bodyMeasures,
  detectMarginRefs,
  isMarginRefShaped,
  isMarginRefText,
  MARGIN_REF_TEXT,
} from "./marginrefs";
export {
  AUTHOR_MAX_COUNT,
  buildMetadata,
  detectLanguage,
  foldForLanguage,
  LANGUAGE_MIN_HITS,
  LANGUAGE_MIN_SAMPLE_CHARS,
  LANGUAGE_MIXED_MAX_RATIO,
  LANGUAGE_MIXED_MIN_HITS,
  LANGUAGE_STOPWORDS_EN,
  LANGUAGE_STOPWORDS_PT,
  langHintOf,
  sanitizePdfTitle,
  splitPdfAuthors,
  TITLE_MAX_CHARS,
} from "./metadata";
export type { NoteCallBlock, NoteLinkDecision } from "./notelinks";
export {
  CALL_WITHOUT_NOTE_FLAG,
  callLabel,
  linkFootnoteCalls,
  NOTE_CALL_TEXT,
  NOTE_LINK_UNCERTAIN_CONFIDENCE,
  NOTE_WITHOUT_CALL_FLAG,
  noteMarkerLabel,
} from "./notelinks";
export type { JoinedParagraph } from "./pagejoin";
export { endsSentence, joinCrossPageParagraphs, PAGE_JOIN_TITLE_FONT_FACTOR } from "./pagejoin";
export {
  documentParagraphs,
  groupParagraphs,
  PARAGRAPH_EXTRA_SPACE_FACTOR,
  PARAGRAPH_INDENT_FACTOR,
  PARAGRAPH_JUSTIFIED_MIN_SHARE,
  PARAGRAPH_MEASURE_TOLERANCE,
  paragraphText,
} from "./paragraphs";
export type { BlocksEvent, BookEvent, ExtractStreamEvent, PageEvent } from "./pipeline";
export { extractStream } from "./pipeline";
export type { QuoteContext, QuoteDecision } from "./quotes";
export {
  detectQuotes,
  QUOTE_ATTRIBUTION,
  QUOTE_EPIGRAPH_MAX_LINES,
  QUOTE_ITALIC_SHARE,
  QUOTE_LEADING_TOLERANCE,
  QUOTE_MAX_SIZE_FACTOR,
  QUOTE_MIN_INDENT_EM,
  QUOTE_UNCERTAIN_CONFIDENCE,
  UNCERTAIN_QUOTE_FLAG,
} from "./quotes";
export type { ReferenceContext, ReferenceDecision } from "./references";
export {
  detectReferences,
  opensLikeReference,
  REFERENCE_BRACKET_LABEL,
  REFERENCE_OPENING,
  REFERENCE_SECTION_TITLES,
  REFERENCE_YEAR_OPENING,
} from "./references";
export type {
  RegionFrame,
  RegionFrameOptions,
  RenderCanvasContext,
  RenderPageOptions,
  RenderTarget,
  RenderTaskLike,
  Size,
} from "./render";
export {
  REGION_MIN_POINTS,
  REGION_PADDING_DEFAULT,
  RENDER_BACKGROUND_DEFAULT,
  RenderTargetError,
  regionFrame,
  renderPageRegion,
} from "./render";
export type {
  RepeatedBand,
  RepeatedOccurrence,
  RepeatedRegion,
  StrippedDocument,
} from "./repeated";
export {
  detectRepeatedRegions,
  FLOW_FOLIO_ISOLATION_FACTOR,
  FLOW_FOLIO_MAX_STEP,
  PAGE_LABEL_DECORATION_MAX,
  REPEATED_BASELINE_TOLERANCE_FACTOR,
  REPEATED_FONT_MAX_FACTOR,
  REPEATED_MIN_PAGE_SHARE,
  REPEATED_MIN_PAGES,
  stripRepeatedRegions,
} from "./repeated";
export type { ItemStyle } from "./runs";
export {
  headingRuns,
  itemRunStyle,
  paragraphRuns,
  SUPSUB_MAX_SIZE_RATIO,
  SUPSUB_RISE_FACTOR,
} from "./runs";
export type { SideBand, SideRegion, SideSplit, SideSplitOptions } from "./sidebars";
export {
  SIDEBAR_FLAG,
  SIDEBAR_MAX_LINE_GAP_FACTOR,
  SIDEBAR_MAX_WIDTH_SHARE,
  SIDEBAR_MIN_GAP_FACTOR,
  SIDEBAR_MIN_LINES,
  SIDEBAR_MIN_MAIN_SHARE,
  SIDEBAR_MIN_WIDTH_FACTOR,
  splitSideRegions,
} from "./sidebars";
export { itemsText, lineText, SPACE_GAP_FACTOR, spaceBetween } from "./spaces";
export type { DocumentMargins, DocumentStats } from "./stats";
export {
  documentStats,
  LINE_HEIGHT_FALLBACK_FACTOR,
  LINE_HEIGHT_MAX_FACTOR,
  LINE_HEIGHT_MIN_FACTOR,
  StatsError,
} from "./stats";
export type { TableDecision } from "./tables";
export {
  detectTables,
  splitParagraphsAtTables,
  TABLE_ABSORB_FONT_MAX,
  TABLE_ABSORB_FONT_MIN,
  TABLE_ABSORB_GAP_FACTOR,
  TABLE_ABSORB_WIDTH_SHARE,
  TABLE_DOT_LEADER_FACTOR,
  TABLE_GAP_FACTOR,
  TABLE_LINK_OVERLAP,
  TABLE_MIN_FONT_FACTOR,
  TABLE_MIN_GAPS,
  TABLE_MIN_LINES,
  TABLE_ROW_GAP_FACTOR,
  tableTsv,
} from "./tables";
export type { FlatOutlineItem, TocResult } from "./toc";
export {
  buildToc,
  flattenOutline,
  TOC_MIN_MATCH_CHARS,
  TOC_OUTLINE_UNMATCHED,
  titlesAnswer,
  tocTitleKey,
} from "./toc";
export { normalizeForReader, normalizeUnicode, SOFT_HYPHEN } from "./unicode";
export const PACKAGE_NAME = "@pagepace/extractor";
