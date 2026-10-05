import { z } from "zod";
import type { BBox } from "./common";
import {
  bboxSchema,
  confidenceSchema,
  levelSchema,
  pageIndexSchema,
  schemaVersionSchema,
  sha256Schema,
} from "./common";

export const BLOCK_KINDS = [
  "heading",
  "paragraph",
  "blockquote",
  "epigraph",
  "list_item",
  "footnote",
  "reference",
  "caption",
  "figure",
  "table",
  "equation",
  "code",
  "margin_ref",
] as const;

export type BlockKind = (typeof BLOCK_KINDS)[number];

export const blockKindSchema = z.enum(BLOCK_KINDS);

export const LANGUAGE_SCHEMA_VALUES = ["pt", "en", "mixed", "unknown"] as const;

export type BookLanguage = (typeof LANGUAGE_SCHEMA_VALUES)[number];

/** Text with inline styles. Words are not part of the model — see `@pagepace/segmenter`. */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  sup?: boolean;
  sub?: boolean;
  smallCaps?: boolean;
  /** Id of the `footnote` block this call points to. */
  noteRef?: string;
  /** BCP-47-ish tag for foreign snippets, e.g. "grc", "la". */
  lang?: string;
}

export interface BlockAnchor {
  blockId: string;
  runIndex: number;
  offset: number;
  label: string;
}

export interface BlockPlaceholder {
  description?: string;
  pageImageRef?: string;
}

export interface Block {
  /** Stable id (ARCHITECTURE.md, decision 4). */
  id: string;
  kind: BlockKind;
  /** Required for `kind: "heading"` (1..6). */
  level?: number;
  runs: Run[];
  origin: {
    /** 0-based, inclusive. */
    pageFrom: number;
    /** 0-based, inclusive; never lower than `pageFrom`. */
    pageTo: number;
    bbox?: BBox[];
    originalPageLabel?: string;
  };
  confidence: number;
  flags: string[];
  anchor?: BlockAnchor;
  placeholder?: BlockPlaceholder;
}

export interface TocEntry {
  title: string;
  blockId: string;
  level: number;
}

export interface Book {
  schemaVersion: string;
  /** Same sha-256 as the source PDF. */
  id: string;
  source: { fileName: string; pageCount: number };
  metadata: { title?: string; authors?: string[]; language: BookLanguage };
  toc: TocEntry[];
  blocks: Block[];
  extraction: {
    tool: string;
    version: string;
    avgConfidence: number;
    /** See `KNOWN_WARNING_CODES`; `"ocr-text-layer"` = ADR-019. */
    warnings: string[];
  };
}

/** Position in the text of a block (`text = runs[].text` concatenated). */
export interface Anchor {
  blockId: string;
  start: number;
  end: number;
  /** Text between start..end, used to re-anchor after re-extraction. */
  quote: string;
  prefix: string;
  suffix: string;
}

export const runSchema: z.ZodType<Run> = z.strictObject({
  text: z.string().min(1),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  sup: z.boolean().optional(),
  sub: z.boolean().optional(),
  smallCaps: z.boolean().optional(),
  noteRef: z.string().min(1).optional(),
  lang: z.string().min(2).optional(),
});

export const anchorSchema: z.ZodType<Anchor> = z
  .strictObject({
    blockId: z.string().min(1),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    quote: z.string(),
    prefix: z.string(),
    suffix: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.end < value.start) {
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "`end` must be greater than or equal to `start`",
      });
    }
  });

const blockAnchorSchema: z.ZodType<BlockAnchor> = z.strictObject({
  blockId: z.string().min(1),
  runIndex: z.number().int().min(0),
  offset: z.number().int().min(0),
  label: z.string().min(1),
});

const blockPlaceholderSchema: z.ZodType<BlockPlaceholder> = z
  .strictObject({
    description: z.string().min(1).optional(),
    pageImageRef: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.description === undefined && value.pageImageRef === undefined) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: "a placeholder needs `description` and/or `pageImageRef`",
      });
    }
  });

export const blockSchema: z.ZodType<Block> = z
  .strictObject({
    id: z.string().min(1),
    kind: blockKindSchema,
    level: levelSchema.optional(),
    runs: z.array(runSchema),
    origin: z
      .strictObject({
        pageFrom: pageIndexSchema,
        pageTo: pageIndexSchema,
        bbox: z.array(bboxSchema).optional(),
        originalPageLabel: z.string().min(1).optional(),
      })
      .superRefine((value, ctx) => {
        if (value.pageTo < value.pageFrom) {
          ctx.addIssue({
            code: "custom",
            path: ["pageTo"],
            message: "`pageTo` must be greater than or equal to `pageFrom`",
          });
        }
      }),
    confidence: confidenceSchema,
    flags: z.array(z.string()),
    anchor: blockAnchorSchema.optional(),
    placeholder: blockPlaceholderSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "heading" && value.level === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["level"],
        message: "`level` (1..6) is required for heading blocks",
      });
    }
  });

export const tocEntrySchema: z.ZodType<TocEntry> = z.strictObject({
  title: z.string().min(1),
  blockId: z.string().min(1),
  level: levelSchema,
});

export const bookSchema: z.ZodType<Book> = z.strictObject({
  schemaVersion: schemaVersionSchema,
  id: sha256Schema,
  source: z.strictObject({
    fileName: z.string().min(1),
    pageCount: z.number().int().min(1),
  }),
  metadata: z.strictObject({
    title: z.string().min(1).optional(),
    authors: z.array(z.string().min(1)).optional(),
    language: z.enum(LANGUAGE_SCHEMA_VALUES),
  }),
  toc: z.array(tocEntrySchema),
  blocks: z.array(blockSchema).min(1),
  extraction: z.strictObject({
    tool: z.string().min(1),
    version: z.string().min(1),
    avgConfidence: confidenceSchema,
    warnings: z.array(z.string().min(1)),
  }),
});
