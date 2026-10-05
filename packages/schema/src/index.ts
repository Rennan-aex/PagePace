import type { Anchor, Book } from "./book";
import { anchorSchema, bookSchema } from "./book";
import type { ParseResult } from "./errors";
import { parseWith, safeParseWith } from "./errors";
import type { Overlay } from "./overlay";
import { overlaySchema } from "./overlay";
import type { RawDocument } from "./raw";
import { rawDocumentSchema } from "./raw";

export type {
  Anchor,
  Block,
  BlockAnchor,
  BlockKind,
  BlockPlaceholder,
  Book,
  BookLanguage,
  Run,
  TocEntry,
} from "./book";
export {
  anchorSchema,
  BLOCK_KINDS,
  blockKindSchema,
  blockSchema,
  bookSchema,
  LANGUAGE_SCHEMA_VALUES,
  runSchema,
  tocEntrySchema,
} from "./book";
export type { BBox } from "./common";
export {
  bboxSchema,
  confidenceSchema,
  levelSchema,
  pageIndexSchema,
  schemaVersionSchema,
  sha256Schema,
} from "./common";
export type { ParseResult, SchemaIssue } from "./errors";
export { parseWith, SchemaValidationError, safeParseWith } from "./errors";
export type { CorrectionOp, CorrectionOpBase, CorrectionStyle, Overlay } from "./overlay";
export { correctionOpSchema, overlaySchema } from "./overlay";
export type {
  RawDocument,
  RawNonTextRegion,
  RawOutlineItem,
  RawPage,
  RawTextItem,
  TagFigureHint,
  TagHints,
  TagParagraphHint,
} from "./raw";
export {
  rawDocumentSchema,
  rawNonTextRegionSchema,
  rawPageSchema,
  rawTextItemSchema,
  tagFigureHintSchema,
  tagHintsSchema,
  tagParagraphHintSchema,
} from "./raw";
export type { KnownWarningCode } from "./version";
export { KNOWN_WARNING_CODES, PACKAGE_NAME, SCHEMA_VERSION } from "./version";

/** Validates a `RawDocument` (throws `SchemaValidationError`). */
export function parseRawDocument(input: unknown): RawDocument {
  return parseWith(rawDocumentSchema, input, "RawDocument");
}

export function safeParseRawDocument(input: unknown): ParseResult<RawDocument> {
  return safeParseWith(rawDocumentSchema, input);
}

/** Validates a `Book` (throws `SchemaValidationError`). */
export function parseBook(input: unknown): Book {
  return parseWith(bookSchema, input, "Book");
}

export function safeParseBook(input: unknown): ParseResult<Book> {
  return safeParseWith(bookSchema, input);
}

/** Validates an `Overlay` (throws `SchemaValidationError`). */
export function parseOverlay(input: unknown): Overlay {
  return parseWith(overlaySchema, input, "Overlay");
}

export function safeParseOverlay(input: unknown): ParseResult<Overlay> {
  return safeParseWith(overlaySchema, input);
}

/** Validates an `Anchor` (throws `SchemaValidationError`). */
export function parseAnchor(input: unknown): Anchor {
  return parseWith(anchorSchema, input, "Anchor");
}

export function safeParseAnchor(input: unknown): ParseResult<Anchor> {
  return safeParseWith(anchorSchema, input);
}
