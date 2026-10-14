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
import { BROKEN_FONT_CONFIDENCE, BROKEN_FONT_MAPPING } from "./brokenfont";
import { HYPHEN_UNCERTAIN_CONFIDENCE, UNCERTAIN_HYPHEN_FLAG } from "./hyphen";

const BODY = 11;
const HEADER = 9;
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
  item("Epsilon.", MARGIN, 130, BODY),
  item("Alone.", MARGIN, 155, BODY),
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
      ["Alpha Beta gamma delta Epsilon."],
      ["Alone."],
    ]);
    expect(book.blocks.map((block) => block.origin)).toEqual([
      { pageFrom: 0, pageTo: 0 },
      { pageFrom: 0, pageTo: 0 },
    ]);
    expect(book.blocks.every((block) => block.flags.length === 0)).toBe(true);
  });

  it("joins a paragraph that continues on the next page into one block (E3-T04)", () => {
    // The last line of page 0 ends without a sentence stop and the first
    // line of page 1 is flush left: the paragraph continues.
    const pages = [
      page([
        item("Alpha beta gamma.", MARGIN, 100, BODY),
        item("The paragraph that runs", MARGIN, 115, BODY),
      ]),
      page([item("out of room resumes here.", MARGIN, 100, BODY)], 1),
    ];
    const book = buildBook(doc(pages));
    expect(book.blocks).toHaveLength(2);
    expect(book.blocks[0]?.runs[0]?.text).toBe("Alpha beta gamma.");
    expect(book.blocks[1]?.runs[0]?.text).toBe("The paragraph that runs out of room resumes here.");
    expect(book.blocks[1]?.origin).toEqual({ pageFrom: 0, pageTo: 1 });
  });

  it("does not join across pages when the foot ends a sentence (E3-T04)", () => {
    const pages = [
      page([item("A sentence that ends.", MARGIN, 100, BODY)]),
      page([item("A new paragraph starts.", MARGIN, 100, BODY)], 1),
    ];
    const book = buildBook(doc(pages));
    expect(book.blocks).toHaveLength(2);
    expect(book.blocks[0]?.origin).toEqual({ pageFrom: 0, pageTo: 0 });
    expect(book.blocks[1]?.origin).toEqual({ pageFrom: 1, pageTo: 1 });
  });

  it("does not join when the next page starts indented (E3-T04)", () => {
    const pages = [
      page([item("The paragraph that runs", MARGIN, 100, BODY)]),
      page([item("out of room resumes here.", MARGIN + 20, 100, BODY)], 1),
    ];
    const book = buildBook(doc(pages));
    expect(book.blocks).toHaveLength(2);
    expect(book.blocks[0]?.origin).toEqual({ pageFrom: 0, pageTo: 0 });
    expect(book.blocks[1]?.origin).toEqual({ pageFrom: 1, pageTo: 1 });
  });

  it("does not join a paragraph with a heading on the next page (E3-T04)", () => {
    const title = 18;
    const pages = [
      page([item("The paragraph that runs", MARGIN, 100, BODY)]),
      page(
        [item("Chapter Two", MARGIN, 100, title), item("Its first body line.", MARGIN, 120, BODY)],
        1,
      ),
    ];
    const book = buildBook(doc(pages));
    expect(book.blocks).toHaveLength(3);
    expect(book.blocks[1]?.runs[0]?.text).toBe("Chapter Two");
    expect(book.blocks[1]?.origin).toEqual({ pageFrom: 1, pageTo: 1 });
  });

  it("glues a word broken by a hyphen at the page foot (E3-T04)", () => {
    const pages = [
      page([item("The longest pala-", MARGIN, 100, BODY)]),
      page([item("vra in the book continues.", MARGIN, 100, BODY)], 1),
    ];
    const book = buildBook(doc(pages));
    expect(book.blocks).toHaveLength(1);
    expect(book.blocks[0]?.runs[0]?.text).toBe("The longest palavra in the book continues.");
    expect(book.blocks[0]?.origin).toEqual({ pageFrom: 0, pageTo: 1 });
  });

  it("emits blocks in reading order: page by page, top to bottom, whatever the item order", () => {
    const first = page([...twoParagraphs.items].reverse(), 0);
    const second = page(
      [item("Later.", MARGIN, 150, BODY), item("Earlier.", MARGIN, 100, BODY)],
      1,
    );
    const book = buildBook(doc([first, second]));
    expect(book.blocks.map((block) => [block.origin.pageFrom, block.runs[0]?.text])).toEqual([
      [0, "Alpha Beta gamma delta Epsilon."],
      [0, "Alone."],
      [1, "Earlier."],
      [1, "Later."],
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

  it("keeps the printed page label of a removed foot as origin.originalPageLabel (E3-T02)", () => {
    const pages = [0, 1, 2].map((index) =>
      page(
        [
          item("MY BOOK", MARGIN, 72, HEADER),
          item(`Body line ${index + 1} of the page.`, MARGIN, 670, BODY),
          item(String(index + 1), MARGIN, 740, HEADER),
        ],
        index,
      ),
    );
    const book = buildBook(doc(pages));
    expect(book.blocks.map((block) => block.runs.map((run) => run.text))).toEqual([
      ["Body line 1 of the page."],
      ["Body line 2 of the page."],
      ["Body line 3 of the page."],
    ]);
    expect(book.blocks.map((block) => block.origin)).toEqual([
      { pageFrom: 0, pageTo: 0, originalPageLabel: "1" },
      { pageFrom: 1, pageTo: 1, originalPageLabel: "2" },
      { pageFrom: 2, pageTo: 2, originalPageLabel: "3" },
    ]);
  });

  it("folds ligatures, soft hyphens, NBSP and quotes in the run text (E3-T01)", () => {
    const ff = String.fromCharCode(0xfb00);
    const softHyphen = String.fromCharCode(0x00ad);
    const nbsp = String.fromCharCode(0x00a0);
    const lsquo = String.fromCharCode(0x2018);
    const rsquo = String.fromCharCode(0x2019);
    const noisy = page([
      item(`e${ff}ect${softHyphen}ed a${nbsp}b ${lsquo}hi${rsquo}`, MARGIN, 100, BODY),
    ]);
    const book = buildBook(doc([noisy]));
    expect(book.blocks[0]?.runs[0]?.text).toBe(`effected a b 'hi'`);
  });

  it("glues words broken by a line-end hyphen into the block text (E3-T03)", () => {
    const broken = page([
      item("A pala-", MARGIN, 100, BODY),
      item("vra que con-", MARGIN, 115, BODY),
      item("tinua aqui.", MARGIN, 130, BODY),
    ]);
    const book = buildBook(doc([broken]));
    expect(book.blocks).toHaveLength(1);
    expect(book.blocks[0]?.runs[0]?.text).toBe("A palavra que continua aqui.");
    expect(book.blocks[0]?.flags).toEqual([]);
    expect(book.blocks[0]?.confidence).toBe(BOOK_BLOCK_CONFIDENCE);
  });

  it("keeps legitimate hyphens in the block text (E3-T03)", () => {
    const kept = page([
      item("A guarda-", MARGIN, 100, BODY),
      item("chuva abria e ele disse-", MARGIN, 115, BODY),
      item("lhe a verdade sobre 1998-", MARGIN, 130, BODY),
      item("2004 em seguida.", MARGIN, 145, BODY),
    ]);
    const book = buildBook(doc([kept]));
    expect(book.blocks[0]?.runs[0]?.text).toBe(
      "A guarda-chuva abria e ele disse-lhe a verdade sobre 1998-2004 em seguida.",
    );
    expect(book.blocks[0]?.flags).toEqual([]);
  });

  it("flags an uncertain hyphen and lowers the block confidence (E3-T03)", () => {
    const uncertain = page([
      item("O Ex-", MARGIN, 100, BODY),
      item("Ministro saiu", MARGIN, 115, BODY),
      item("cedo hoje.", MARGIN, 130, BODY),
    ]);
    const book = buildBook(doc([uncertain]));
    expect(book.blocks).toHaveLength(1);
    expect(book.blocks[0]?.runs[0]?.text).toBe("O Ex-Ministro saiu cedo hoje.");
    expect(book.blocks[0]?.flags).toEqual([UNCERTAIN_HYPHEN_FLAG]);
    expect(book.blocks[0]?.confidence).toBe(HYPHEN_UNCERTAIN_CONFIDENCE);
    // An OCR document keeps the lower of the two confidences.
    const fromOcr = buildBook(doc([uncertain], { ocrTextLayer: true }));
    expect(fromOcr.blocks[0]?.flags).toEqual([UNCERTAIN_HYPHEN_FLAG]);
    expect(fromOcr.blocks[0]?.confidence).toBe(OCR_TEXT_LAYER_CONFIDENCE);
  });

  it("flags a block scrambled by a broken font mapping and warns the document (E3-T05)", () => {
    const pua = (codePoint: number): string => String.fromCodePoint(codePoint);
    const scrambled = `${pua(0xe001)}${pua(0xe002)}${pua(0xe003)}${pua(0xe004)} ABCD`;
    const pages = [
      page([item(scrambled, MARGIN, 100, BODY), item("A clean paragraph.", MARGIN, 140, BODY)]),
    ];
    const book = buildBook(doc(pages));
    expect(book.blocks).toHaveLength(2);
    // The text is kept — nothing is silently dropped — but it is marked.
    expect(book.blocks[0]?.runs[0]?.text).toBe(scrambled);
    expect(book.blocks[0]?.flags).toEqual([BROKEN_FONT_MAPPING]);
    expect(book.blocks[0]?.confidence).toBe(BROKEN_FONT_CONFIDENCE);
    expect(book.blocks[1]?.flags).toEqual([]);
    expect(book.blocks[1]?.confidence).toBe(BOOK_BLOCK_CONFIDENCE);
    expect(book.extraction.warnings).toEqual([BROKEN_FONT_MAPPING]);
    expect(book.extraction.avgConfidence).toBe(0.6);
  });

  it("keeps a stray private use glyph without flagging the block (E3-T05)", () => {
    const stray = page([
      item(
        `An ordinary paragraph with a ${String.fromCodePoint(0xe022)} glyph inside.`,
        MARGIN,
        100,
        BODY,
      ),
    ]);
    const book = buildBook(doc([stray]));
    expect(book.blocks[0]?.flags).toEqual([]);
    expect(book.blocks[0]?.confidence).toBe(BOOK_BLOCK_CONFIDENCE);
    expect(book.extraction.warnings).toEqual([]);
    expect(book.extraction.avgConfidence).toBe(BOOK_BLOCK_CONFIDENCE);
  });

  it("caps the confidence at the broken-font value for an OCR document (E3-T05)", () => {
    const pua = String.fromCodePoint(0xe011);
    const broken = page([item(`${pua}${pua}${pua}${pua} ABCD`, MARGIN, 100, BODY)]);
    const book = buildBook(doc([broken], { ocrTextLayer: true }));
    expect(book.extraction.warnings).toEqual(["ocr-text-layer", BROKEN_FONT_MAPPING]);
    expect(book.blocks[0]?.flags).toEqual([BROKEN_FONT_MAPPING]);
    expect(book.blocks[0]?.confidence).toBeLessThan(OCR_TEXT_LAYER_CONFIDENCE);
  });

  it("carries bold/italic in the runs, from the font name (E4-T01)", () => {
    const styled = page([
      item("Um aviso com ", MARGIN, 100, BODY),
      item("destacada", MARGIN + 78, 100, BODY, { fontName: "Helvetica-Bold" }),
      item(" e um termo ", MARGIN + 132, 100, BODY),
      item("emprestado", MARGIN + 204, 100, BODY, { fontName: "Helvetica-Oblique" }),
      item(".", MARGIN + 259, 100, BODY),
    ]);
    const book = buildBook(doc([styled]));
    expect(book.blocks).toHaveLength(1);
    expect(book.blocks[0]?.runs).toEqual([
      { text: "Um aviso com " },
      { text: "destacada", bold: true },
      { text: " e um termo " },
      { text: "emprestado", italic: true },
      { text: "." },
    ]);
    const text = book.blocks[0]?.runs.map((run) => run.text).join("") ?? "";
    expect(text).toBe("Um aviso com destacada e um termo emprestado.");
  });

  it("keeps the runs plain for an OCR text layer (E4-T01, ADR-019)", () => {
    const styled = page([
      item("Aviso ", MARGIN, 100, BODY),
      item("importante", MARGIN + 42, 100, BODY, { fontName: "Helvetica-Bold" }),
      item(".", MARGIN + 96, 100, BODY),
    ]);
    const book = buildBook(doc([styled], { ocrTextLayer: true }));
    expect(book.blocks[0]?.runs).toEqual([{ text: "Aviso importante." }]);
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
