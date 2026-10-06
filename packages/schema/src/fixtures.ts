import type { Anchor, Block, Book } from "./book";
import type { Overlay } from "./overlay";
import type { RawDocument } from "./raw";

/** Any 64-hex string works for the fixtures; the shape is what matters. */
export const FIXTURE_SHA256 = "0123456789abcdef".repeat(4);

export const validRawDocument: RawDocument = {
  schemaVersion: "1.1.0",
  source: {
    fileName: "n1-en-rebus-philosophy-mind.pdf",
    sha256: FIXTURE_SHA256,
    pageCount: 2,
    producer: "Prince 12.5",
    tagged: true,
  },
  outline: [
    {
      title: "Introduction",
      pageIndex: 0,
      children: [{ title: "1.1 What is a mind?", pageIndex: 1 }],
    },
  ],
  tagHints: {
    reliable: true,
    paragraphs: [{ page: 0, bbox: { x: 72, y: 120, width: 451, height: 340 } }],
    figures: [
      {
        page: 1,
        bbox: { x: 72, y: 400, width: 200, height: 150 },
        alt: "Diagram of a neuron",
      },
    ],
  },
  pages: [
    {
      index: 0,
      width: 612,
      height: 792,
      rotation: 0,
      items: [
        {
          text: "What is a mind?",
          x: 72,
          y: 96,
          width: 180,
          height: 14,
          fontName: "CharisSIL-Bold",
          fontSize: 14,
          fontFlags: { bold: true, serif: true },
          hasEOL: true,
        },
        {
          text: "A mind is not the same as a brain.",
          x: 72,
          y: 120,
          width: 451,
          height: 12,
          fontName: "CharisSIL-Regular",
          fontSize: 12,
          charWidths: [5, 6.5, 6.5, 6.5, 3, 6.5, 6.5, 6.5, 3],
        },
      ],
      nonText: [{ bbox: { x: 72, y: 400, width: 200, height: 150 }, kind: "image" }],
    },
    {
      index: 1,
      width: 612,
      height: 792,
      rotation: 90,
      items: [
        {
          text: "Chapter 1",
          x: 72,
          y: 96,
          width: 120,
          height: 20,
          fontName: "CharisSIL-Bold",
          fontSize: 20,
          hasEOL: true,
        },
      ],
    },
  ],
  ingest: { adapter: "pdfjs", adapterVersion: "6.4.299" },
};

/** ADR-019: most characters come from an invisible OCR layer (`Tr 3`). */
export const validRawDocumentOcrTextLayer: RawDocument = {
  ...validRawDocument,
  source: { ...validRawDocument.source, fileName: "n1-en-lostworld.pdf", ocrTextLayer: true },
};

export const validAnchor: Anchor = {
  blockId: "b-para-1",
  start: 0,
  end: 11,
  quote: "Minds are ",
  prefix: "",
  suffix: "not the same as a brain.",
};

export const headingBlock: Block = {
  id: "b-heading-1",
  kind: "heading",
  level: 1,
  runs: [{ text: "Introduction" }],
  origin: { pageFrom: 0, pageTo: 0, bbox: [{ x: 72, y: 90, width: 300, height: 24 }] },
  confidence: 0.98,
  flags: [],
};

export const paragraphBlock: Block = {
  id: "b-para-1",
  kind: "paragraph",
  runs: [
    { text: "Minds are " },
    { text: "not", bold: true, noteRef: "b-footnote-1" },
    { text: " the same as a brain.", italic: false },
  ],
  origin: { pageFrom: 0, pageTo: 1, originalPageLabel: "12" },
  confidence: 0.9,
  flags: ["uncertain-paragraph-join"],
};

export const footnoteBlock: Block = {
  id: "b-footnote-1",
  kind: "footnote",
  runs: [{ text: "See Smith (2020)." }],
  origin: { pageFrom: 0, pageTo: 0 },
  confidence: 0.7,
  flags: [],
  anchor: { blockId: "b-para-1", runIndex: 1, offset: 0, label: "1" },
};

export const figureBlock: Block = {
  id: "b-figure-1",
  kind: "figure",
  runs: [],
  origin: { pageFrom: 1, pageTo: 1, bbox: [{ x: 72, y: 400, width: 200, height: 150 }] },
  confidence: 1,
  flags: [],
  placeholder: { description: "Diagram of a neuron", pageImageRef: "fig-1.png" },
};

export const validBook: Book = {
  schemaVersion: "1.1.0",
  id: FIXTURE_SHA256,
  source: { fileName: "n1-en-rebus-philosophy-mind.pdf", pageCount: 99 },
  metadata: {
    title: "Philosophy of Mind",
    authors: ["Smith"],
    language: "en",
  },
  toc: [
    { title: "Introduction", blockId: "b-heading-1", level: 1 },
    { title: "1.1 What is a mind?", blockId: "b-heading-2", level: 2 },
  ],
  blocks: [headingBlock, paragraphBlock, footnoteBlock, figureBlock],
  extraction: {
    tool: "pagepace-extractor",
    version: "1.0.0",
    avgConfidence: 0.86,
    warnings: [],
  },
};

/** ADR-019: the text came from an invisible OCR layer — the Book exists, with a warning. */
export const validBookOcrTextLayer: Book = {
  ...validBook,
  id: "fedcba9876543210".repeat(4),
  extraction: {
    ...validBook.extraction,
    avgConfidence: 0.4,
    warnings: ["ocr-text-layer"],
  },
};

export const validOverlay: Overlay = {
  schemaVersion: "1.1.0",
  bookId: FIXTURE_SHA256,
  ops: [
    { id: "op-1", createdAt: "2026-10-05T12:00:00Z", target: validAnchor, op: "merge_with_next" },
    {
      id: "op-2",
      createdAt: "2026-10-05T12:01:00+00:00",
      target: validAnchor,
      op: "split_at",
      offset: 12,
    },
    {
      id: "op-3",
      createdAt: "2026-10-05T12:02:00-03:00",
      target: validAnchor,
      op: "set_kind",
      kind: "heading",
      level: 2,
    },
    { id: "op-4", createdAt: "2026-10-05T12:03:00Z", target: validAnchor, op: "delete_block" },
    {
      id: "op-5",
      createdAt: "2026-10-05T12:04:00Z",
      target: validAnchor,
      op: "edit_text",
      replacement: "Minds are definitely not brains.",
    },
    {
      id: "op-6",
      createdAt: "2026-10-05T12:05:00Z",
      target: validAnchor,
      op: "set_style",
      start: 0,
      end: 5,
      style: { bold: true, italic: true },
    },
  ],
};

export type InvalidTarget = "RawDocument" | "Book" | "Overlay" | "Anchor";

export interface InvalidFixture {
  name: string;
  target: InvalidTarget;
  data: unknown;
  reason: string;
}

export const invalidFixtures: InvalidFixture[] = [
  {
    name: "raw-document-with-struct-tree",
    target: "RawDocument",
    reason: "the raw tag tree must never reach RawDocument (PO, 2026-10-04)",
    data: {
      ...validRawDocument,
      structTree: {
        type: "Document",
        kids: [{ type: "P", kids: [{ type: "Span", value: "hi" }] }],
      },
    },
  },
  {
    name: "raw-document-with-raw-tag-hints",
    target: "RawDocument",
    reason: "tag hints carry only normalized paragraph/figure boxes, never nodes",
    data: {
      ...validRawDocument,
      tagHints: {
        reliable: true,
        paragraphs: [{ page: 0, node: { type: "P", kids: [] } }],
        figures: [],
      },
    },
  },
  {
    name: "raw-document-unknown-key",
    target: "RawDocument",
    reason: "strict objects reject unknown keys instead of silently dropping them",
    data: { ...validRawDocument, debug: true },
  },
  {
    name: "raw-document-wrong-version",
    target: "RawDocument",
    reason: "schemaVersion must match SCHEMA_VERSION",
    data: { ...validRawDocument, schemaVersion: "0.1.0" },
  },
  {
    name: "raw-document-without-pages",
    target: "RawDocument",
    reason: "pages is required",
    data: { ...validRawDocument, pages: undefined },
  },
  {
    name: "raw-document-bad-rotation",
    target: "RawDocument",
    reason: "rotation is 0 | 90 | 180 | 270",
    data: {
      ...validRawDocument,
      pages: [{ ...validRawDocument.pages[0], rotation: 45 }],
    },
  },
  {
    name: "raw-document-bad-sha256",
    target: "RawDocument",
    reason: "sha256 must be 64 hex chars",
    data: { ...validRawDocument, source: { ...validRawDocument.source, sha256: "abc123" } },
  },
  {
    name: "raw-document-zero-page-count",
    target: "RawDocument",
    reason: "pageCount is at least 1",
    data: { ...validRawDocument, source: { ...validRawDocument.source, pageCount: 0 } },
  },
  {
    name: "raw-document-ocr-text-layer-not-a-boolean",
    target: "RawDocument",
    reason: "ocrTextLayer is a boolean flag (ADR-019)",
    data: { ...validRawDocument, source: { ...validRawDocument.source, ocrTextLayer: "yes" } },
  },
  {
    name: "book-with-struct-tree",
    target: "Book",
    reason: "the raw tag tree must never reach Book either",
    data: { ...validBook, structTree: { type: "Document" } },
  },
  {
    name: "book-heading-without-level",
    target: "Book",
    reason: "headings need level 1..6",
    data: {
      ...validBook,
      blocks: [{ ...headingBlock, level: undefined }],
    },
  },
  {
    name: "book-unknown-block-kind",
    target: "Book",
    reason: "block kinds are a closed list",
    data: { ...validBook, blocks: [{ ...headingBlock, kind: "chapter" }] },
  },
  {
    name: "book-confidence-out-of-range",
    target: "Book",
    reason: "confidence is between 0 and 1",
    data: { ...validBook, extraction: { ...validBook.extraction, avgConfidence: 1.5 } },
  },
  {
    name: "book-without-blocks",
    target: "Book",
    reason: "a Book with no blocks is garbage in, garbage out",
    data: { ...validBook, blocks: [] },
  },
  {
    name: "book-empty-run-text",
    target: "Book",
    reason: "runs never carry empty text",
    data: { ...validBook, blocks: [{ ...paragraphBlock, runs: [{ text: "" }] }] },
  },
  {
    name: "book-page-to-before-page-from",
    target: "Book",
    reason: "origin.pageTo >= origin.pageFrom",
    data: {
      ...validBook,
      blocks: [{ ...paragraphBlock, origin: { ...paragraphBlock.origin, pageFrom: 3, pageTo: 1 } }],
    },
  },
  {
    name: "overlay-bad-timestamp",
    target: "Overlay",
    reason: "createdAt must be ISO-8601 with timezone",
    data: {
      ...validOverlay,
      ops: [{ ...validOverlay.ops[0], createdAt: "yesterday" }],
    },
  },
  {
    name: "overlay-negative-split",
    target: "Overlay",
    reason: "split offsets are non-negative integers",
    data: {
      ...validOverlay,
      ops: [{ ...validOverlay.ops[1], offset: -1 }],
    },
  },
  {
    name: "overlay-set-kind-heading-without-level",
    target: "Overlay",
    reason: "set_kind heading needs level 1..6",
    data: {
      ...validOverlay,
      ops: [
        {
          id: "op-x",
          createdAt: "2026-10-05T12:00:00Z",
          target: validAnchor,
          op: "set_kind",
          kind: "heading",
        },
      ],
    },
  },
  {
    name: "overlay-empty-style",
    target: "Overlay",
    reason: "set_style must flip at least one flag",
    data: {
      ...validOverlay,
      ops: [
        {
          id: "op-x",
          createdAt: "2026-10-05T12:00:00Z",
          target: validAnchor,
          op: "set_style",
          start: 0,
          end: 5,
          style: {},
        },
      ],
    },
  },
  {
    name: "anchor-end-before-start",
    target: "Anchor",
    reason: "end >= start",
    data: { ...validAnchor, start: 10, end: 2 },
  },
  {
    name: "anchor-missing-quote",
    target: "Anchor",
    reason: "quote/prefix/suffix are required for re-anchoring",
    data: { ...validAnchor, quote: undefined },
  },
];
