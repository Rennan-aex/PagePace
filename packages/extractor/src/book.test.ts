import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { parseBook } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import {
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

const BODY = 11;
const MARGIN = 72;

/** One item sitting on `baseline`, the way the ingestion delivers it. */
function item(
  text: string,
  x: number,
  baseline: number,
  size: number,
  extra: Partial<RawTextItem> = {},
): RawTextItem {
  return {
    text,
    x,
    y: baseline - size,
    width: text.length * size * 0.5,
    height: size,
    fontName: "Helvetica",
    fontSize: size,
    ...extra,
  };
}

function page(items: RawTextItem[], index = 0): RawPage {
  return { index, width: 612, height: 792, rotation: 0, items };
}

function doc(pages: RawPage[], extra: Partial<RawDocument["source"]> = {}): RawDocument {
  return {
    schemaVersion: "1.1.0",
    source: {
      fileName: "book.pdf",
      sha256: "a".repeat(64),
      pageCount: pages.length,
      tagged: false,
      ...extra,
    },
    pages,
    ingest: { adapter: "pdfjs", adapterVersion: "test" },
  };
}

/** Two paragraphs on one page: three ragged lines, then an extra gap, then one line. */
const twoParagraphs = page([
  item("Alpha", MARGIN, 100, BODY),
  item("Beta gamma delta", MARGIN, 115, BODY),
  item("Epsilon", MARGIN, 130, BODY),
  item("Alone", MARGIN, 155, BODY),
]);

describe("buildBook", () => {
  it("produces a Book that validates against the schema", () => {
    const book = buildBook(doc([twoParagraphs]));
    expect(() => parseBook(book)).not.toThrow();
    expect(book.schemaVersion).toBe("1.1.0");
    expect(book.id).toBe("a".repeat(64));
    expect(book.source).toEqual({ fileName: "book.pdf", pageCount: 1 });
    expect(book.metadata).toEqual({ language: "unknown" });
    expect(book.toc).toEqual([]);
    expect(book.extraction.tool).toBe(EXTRACTOR_TOOL);
    expect(book.extraction.version).toBe(EXTRACTOR_VERSION);
  });

  it("turns each page paragraph into a paragraph block with the page as origin", () => {
    const book = buildBook(doc([twoParagraphs]));
    expect(book.blocks).toHaveLength(2);
    expect(book.blocks.every((block) => block.kind === "paragraph")).toBe(true);
    expect(book.blocks.map((block) => block.runs.map((run) => run.text))).toEqual([
      ["Alpha Beta gamma delta Epsilon"],
      ["Alone"],
    ]);
    expect(book.blocks.map((block) => block.origin)).toEqual([
      { pageFrom: 0, pageTo: 0 },
      { pageFrom: 0, pageTo: 0 },
    ]);
    expect(book.blocks.every((block) => block.flags.length === 0)).toBe(true);
  });

  it("keeps every block on its own page (paragraphs never cross pages)", () => {
    const pages = [twoParagraphs, page([item("Next page", MARGIN, 100, BODY)], 1)];
    const book = buildBook(doc(pages));
    expect(book.blocks.map((block) => block.origin.pageFrom)).toEqual([0, 0, 1]);
    expect(book.blocks.every((block) => block.origin.pageTo === block.origin.pageFrom)).toBe(true);
  });

  it("emits blocks in reading order: page by page, top to bottom, whatever the item order", () => {
    const first = page([...twoParagraphs.items].reverse(), 0);
    const second = page([item("Later", MARGIN, 150, BODY), item("Earlier", MARGIN, 100, BODY)], 1);
    const book = buildBook(doc([first, second]));
    expect(book.blocks.map((block) => [block.origin.pageFrom, block.runs[0]?.text])).toEqual([
      [0, "Alpha Beta gamma delta Epsilon"],
      [0, "Alone"],
      [1, "Earlier"],
      [1, "Later"],
    ]);
  });

  it("gives digital documents the provisional constant confidence", () => {
    const book = buildBook(doc([twoParagraphs]));
    expect(book.blocks.every((block) => block.confidence === BOOK_BLOCK_CONFIDENCE)).toBe(true);
    expect(book.extraction.avgConfidence).toBe(BOOK_BLOCK_CONFIDENCE);
    expect(book.extraction.warnings).toEqual([]);
  });

  it("lowers confidence and warns for an embedded OCR text layer", () => {
    const book = buildBook(doc([twoParagraphs], { ocrTextLayer: true }));
    expect(book.extraction.warnings).toEqual(["ocr-text-layer"]);
    expect(book.extraction.avgConfidence).toBe(OCR_TEXT_LAYER_CONFIDENCE);
    expect(OCR_TEXT_LAYER_CONFIDENCE).toBeLessThan(BOOK_BLOCK_CONFIDENCE);
    expect(book.blocks.every((block) => block.confidence === OCR_TEXT_LAYER_CONFIDENCE)).toBe(true);
  });

  it("throws BookError when the document produces no block", () => {
    expect(() => buildBook(doc([page([])]))).toThrow(BookError);
  });
});

describe("block ids", () => {
  it("are stable: two runs over the same document give the same ids", () => {
    const first = buildBook(doc([twoParagraphs]));
    const second = buildBook(doc([twoParagraphs]));
    expect(second.blocks.map((block) => block.id)).toEqual(first.blocks.map((block) => block.id));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("do not depend on the order the items arrive in", () => {
    const shuffled = page([...twoParagraphs.items].reverse());
    const direct = buildBook(doc([twoParagraphs])).blocks.map((block) => block.id);
    const other = buildBook(doc([shuffled])).blocks.map((block) => block.id);
    expect(other).toEqual(direct);
  });

  it("follow the page-ordinal-hash format and are unique", () => {
    const book = buildBook(doc([twoParagraphs, page([item("Next", MARGIN, 100, BODY)], 1)]));
    const pattern = /^p\d+-b\d+-[0-9a-f]+$/;
    for (const block of book.blocks) expect(block.id).toMatch(pattern);
    const ids = book.blocks.map((block) => block.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toMatch(/^p0-b0-/);
    expect(ids[1]).toMatch(/^p0-b1-/);
    expect(ids[2]).toMatch(/^p1-b0-/);
  });

  it("hash the normalized start of the text, with the named constants", () => {
    expect(BLOCK_ID_HASH_CHARS).toBe(32);
    expect(BLOCK_ID_HASH_LENGTH).toBe(8);
    const text = "The light came slowly over the hills.";
    const plain = blockId(2, 4, text);
    const noisier = blockId(2, 4, `  The   light\n came slowly over the hills. `);
    expect(plain).toBe(noisier);
    expect(plain).toBe(blockId(2, 4, text));
    expect(plain).not.toBe(blockId(3, 4, text));
    expect(plain).not.toBe(blockId(2, 5, text));
    expect(plain).not.toBe(blockId(2, 4, "The light came fast."));
  });
});
