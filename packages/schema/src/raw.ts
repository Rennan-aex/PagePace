import { z } from "zod";
import type { BBox } from "./common";
import { bboxSchema, pageIndexSchema, schemaVersionSchema, sha256Schema } from "./common";

/** PDF bookmark (outline) item. `pageIndex` is null when the destination has no page. */
export interface RawOutlineItem {
  title: string;
  pageIndex: number | null;
  children?: RawOutlineItem[];
}

const rawOutlineItemSchema: z.ZodType<RawOutlineItem> = z.lazy(() =>
  z.strictObject({
    title: z.string().min(1),
    pageIndex: pageIndexSchema.nullable(),
    children: z.array(rawOutlineItemSchema).optional(),
  }),
);

/** One text run as delivered by the PDF text layer (before any word/paragraph logic). */
export interface RawTextItem {
  text: string;
  /** Bounding box in page coordinates, origin at the top-left corner, in points. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Embedded font name, subset prefix already removed by the producer (S1 §5). */
  fontName: string;
  fontSize: number;
  fontFlags?: { bold?: boolean; italic?: boolean; serif?: boolean; monospace?: boolean };
  hasEOL?: boolean;
  /** Glyph advance per character; used to infer spaces (E2-T03). */
  charWidths?: number[];
}

/** Region that is not text but matters for the model (figures, tables, equations). */
export interface RawNonTextRegion {
  bbox: BBox;
  kind: "image" | "vector" | "other";
}

/** Normalized paragraph clue coming from the PDF struct tree (`P` nodes). */
export interface TagParagraphHint {
  page: number;
  bbox: BBox;
}

/** Normalized figure clue coming from the PDF struct tree (`Figure` nodes). */
export interface TagFigureHint {
  page: number;
  bbox: BBox;
  alt?: string;
}

/**
 * Everything kept from the PDF struct tree — and nothing else.
 *
 * The raw tree is never persisted (PO, 2026-10-04): `Span`/repeated `alt`,
 * `Art`, role-less nodes and `Link` are dropped, only `P` confirmation and
 * `Figure` boxes survive. `reliable` is true only when the tree passed the
 * validation of S3 §4.3 (`Marked=true`, non-empty on >=90% of the pages with
 * text, no inverted hierarchy, `P`/`Sect` dominant).
 */
export interface TagHints {
  reliable: boolean;
  paragraphs: TagParagraphHint[];
  figures: TagFigureHint[];
}

export interface RawPage {
  /** 0-based page index. */
  index: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  items: RawTextItem[];
  nonText?: RawNonTextRegion[];
}

export interface RawDocument {
  schemaVersion: string;
  source: {
    fileName: string;
    sha256: string;
    /** Total pages of the PDF. `pages` may hold fewer entries when only a range was extracted. */
    pageCount: number;
    producer?: string;
    /**
     * `Title` from the PDF info dictionary — the producer's claim, not
     * validated truth; `buildBook` sanitizes it before `Book.metadata.title` (E4-T04).
     */
    title?: string;
    /** `Author` from the PDF info dictionary, kept as one raw string (E4-T04). */
    author?: string;
    /** Catalog `/Lang`, free-form (`pt-BR`, `en-US`); a hint for `Book.metadata.language` (E4-T04). */
    lang?: string;
    /** True when the PDF declares `MarkInfo.Marked = true` — not the same as "reliable" (see `tagHints.reliable`). */
    tagged: boolean;
    /**
     * True when most characters are drawn with the invisible text rendering
     * mode (`Tr 3`): the text layer of a scanned book (ADR-019). The reader
     * keeps working, but the `Book` must warn `ocr-text-layer`, drop
     * bold/italic and lower its confidence.
     */
    ocrTextLayer?: boolean;
  };
  outline?: RawOutlineItem[];
  tagHints?: TagHints;
  pages: RawPage[];
  ingest: { adapter: "pdfjs" | "ocr"; adapterVersion: string };
}

export const rawTextItemSchema: z.ZodType<RawTextItem> = z.strictObject({
  text: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(0),
  height: z.number().finite().min(0),
  fontName: z.string().min(1),
  fontSize: z.number().finite().positive(),
  fontFlags: z
    .strictObject({
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      serif: z.boolean().optional(),
      monospace: z.boolean().optional(),
    })
    .optional(),
  hasEOL: z.boolean().optional(),
  charWidths: z.array(z.number().finite().min(0)).optional(),
});

export const rawNonTextRegionSchema: z.ZodType<RawNonTextRegion> = z.strictObject({
  bbox: bboxSchema,
  kind: z.enum(["image", "vector", "other"]),
});

export const tagParagraphHintSchema: z.ZodType<TagParagraphHint> = z.strictObject({
  page: pageIndexSchema,
  bbox: bboxSchema,
});

export const tagFigureHintSchema: z.ZodType<TagFigureHint> = z.strictObject({
  page: pageIndexSchema,
  bbox: bboxSchema,
  alt: z.string().optional(),
});

export const tagHintsSchema: z.ZodType<TagHints> = z.strictObject({
  reliable: z.boolean(),
  paragraphs: z.array(tagParagraphHintSchema),
  figures: z.array(tagFigureHintSchema),
});

export const rawPageSchema: z.ZodType<RawPage> = z.strictObject({
  index: pageIndexSchema,
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  items: z.array(rawTextItemSchema),
  nonText: z.array(rawNonTextRegionSchema).optional(),
});

export const rawDocumentSchema: z.ZodType<RawDocument> = z.strictObject({
  schemaVersion: schemaVersionSchema,
  source: z.strictObject({
    fileName: z.string().min(1),
    sha256: sha256Schema,
    pageCount: z.number().int().min(1),
    producer: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    author: z.string().min(1).optional(),
    lang: z.string().min(1).optional(),
    tagged: z.boolean(),
    ocrTextLayer: z.boolean().optional(),
  }),
  outline: z.array(rawOutlineItemSchema).optional(),
  tagHints: tagHintsSchema.optional(),
  pages: z.array(rawPageSchema),
  ingest: z.strictObject({
    adapter: z.enum(["pdfjs", "ocr"]),
    adapterVersion: z.string().min(1),
  }),
});
