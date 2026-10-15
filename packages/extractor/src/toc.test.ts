// E4-T03: the table of contents — PDF bookmarks cross-checked against the
// detected headings, the headings as the fallback, every entry pointing at a
// `blockId`, and the discrepancies as document warnings.
import type { RawDocument, RawOutlineItem, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildBook } from "./book";
import {
  buildToc,
  flattenOutline,
  TOC_MIN_MATCH_CHARS,
  TOC_OUTLINE_UNMATCHED,
  titlesAnswer,
  tocTitleKey,
} from "./toc";

const BODY = 11;
const TITLE_BIG = 18;
const TITLE_SMALL = 14;
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

function doc(pages: RawPage[], outline?: RawOutlineItem[]): RawDocument {
  return {
    schemaVersion: "1.2.0",
    source: {
      fileName: "book.pdf",
      sha256: "a".repeat(64),
      pageCount: pages.length,
      tagged: false,
    },
    pages,
    ingest: { adapter: "pdfjs", adapterVersion: "test" },
    ...(outline === undefined ? {} : { outline }),
  };
}

/** One chapter per page: a display title over two lines of body text. */
function chaptered(): RawPage[] {
  const chapter = (title: string, size: number, index: number): RawPage =>
    page(
      [
        item(title, MARGIN, 100, size),
        item(`Body line of ${title} goes here.`, MARGIN, 130, BODY),
        item("A second line of the same paragraph.", MARGIN, 145, BODY),
      ],
      index,
    );
  return [
    chapter("Chapter One", TITLE_BIG, 0),
    chapter("Chapter Two", TITLE_SMALL, 1),
    chapter("Chapter Three", TITLE_SMALL, 2),
  ];
}

const CHAPTERS: RawOutlineItem[] = [
  { title: "Chapter One", pageIndex: 0 },
  { title: "Chapter Two", pageIndex: 1, children: [{ title: "Chapter Three", pageIndex: 2 }] },
];

describe("buildBook — table of contents", () => {
  it("falls back to the detected headings when the PDF has no bookmarks (E4-T03)", () => {
    const book = buildBook(doc(chaptered()));
    expect(book.toc).toEqual([
      { title: "Chapter One", blockId: book.blocks[0]?.id, level: 1 },
      { title: "Chapter Two", blockId: book.blocks[2]?.id, level: 2 },
      { title: "Chapter Three", blockId: book.blocks[4]?.id, level: 2 },
    ]);
    expect(book.extraction.warnings).toEqual([]);
  });

  it("has no table at all when the document has neither bookmarks nor headings", () => {
    const book = buildBook(
      doc([page([item("Just a plain paragraph of text.", MARGIN, 100, BODY)])]),
    );
    expect(book.toc).toEqual([]);
    expect(book.extraction.warnings).toEqual([]);
  });

  it("takes the table from the bookmarks, entry by entry (E4-T03)", () => {
    const book = buildBook(doc(chaptered(), CHAPTERS));
    expect(book.toc).toEqual([
      { title: "Chapter One", blockId: book.blocks[0]?.id, level: 1 },
      { title: "Chapter Two", blockId: book.blocks[2]?.id, level: 1 },
      { title: "Chapter Three", blockId: book.blocks[4]?.id, level: 2 },
    ]);
    expect(new Set(book.toc.map((entry) => entry.blockId)).size).toBe(book.toc.length);
    expect(book.extraction.warnings).toEqual([]);
  });

  it("gives a heading the level of its bookmark, replacing the size cluster (ADR-055)", () => {
    const book = buildBook(doc(chaptered(), CHAPTERS));
    // "Chapter Two" shares its size with "Chapter Three" (level 2), but the
    // bookmark that reaches it is a top-level one.
    expect(book.blocks.map((block) => block.level)).toEqual([
      1,
      undefined,
      1,
      undefined,
      2,
      undefined,
    ]);
  });

  it("keeps the detected level of a heading no bookmark answers to", () => {
    const book = buildBook(doc(chaptered(), [{ title: "The Beginning", pageIndex: 1 }]));
    // The bookmark lands on the only heading of page 1 but disagrees with it:
    // the entry keeps the bookmark's title, the block keeps its own level.
    expect(book.toc).toEqual([{ title: "The Beginning", blockId: book.blocks[2]?.id, level: 1 }]);
    expect(book.blocks[2]?.level).toBe(2);
    expect(book.extraction.warnings).toEqual([TOC_OUTLINE_UNMATCHED]);
  });

  it("resolves a bookmark whose destination page has no text when its title answers", () => {
    const book = buildBook(doc(chaptered(), [{ title: "Chapter One", pageIndex: 9 }]));
    expect(book.toc).toEqual([{ title: "Chapter One", blockId: book.blocks[0]?.id, level: 1 }]);
    // Two headings are out of the bookmark list and that is not a discrepancy:
    // the outline is a subset of the headings by design (ADR-056).
    expect(book.extraction.warnings).toEqual([]);
  });

  it("drops a bookmark that answers to nothing and warns (E4-T03)", () => {
    const book = buildBook(doc(chaptered(), [{ title: "Nowhere", pageIndex: 9 }]));
    expect(book.toc).toEqual([]);
    expect(book.extraction.warnings).toEqual([TOC_OUTLINE_UNMATCHED]);
  });

  it("keeps a bookmark without a destination when its title answers to a heading", () => {
    const book = buildBook(doc(chaptered(), [{ title: "Chapter One", pageIndex: null }]));
    expect(book.toc).toEqual([{ title: "Chapter One", blockId: book.blocks[0]?.id, level: 1 }]);
    // The bookmark has no destination but its title answers to a heading, so
    // the entry is kept and no discrepancy is reported.
    expect(book.extraction.warnings).toEqual([]);
  });

  it("stays silent when the bookmark list only covers part of the headings (ADR-056)", () => {
    const book = buildBook(doc(chaptered(), [{ title: "Chapter One", pageIndex: 0 }]));
    expect(book.toc).toHaveLength(1);
    expect(book.extraction.warnings).toEqual([]);
  });

  it("caps the level of a deep bookmark at the maximum the schema accepts", () => {
    const pages = Array.from({ length: 7 }, (_, index) =>
      page(
        [
          item(`Chapter ${index + 1}`, MARGIN, 100, TITLE_BIG),
          item("Body of this chapter goes here.", MARGIN, 130, BODY),
          item("A second line of the same paragraph.", MARGIN, 145, BODY),
        ],
        index,
      ),
    );
    let outline: RawOutlineItem = { title: "Chapter 7", pageIndex: 6 };
    for (let index = 5; index >= 0; index--) {
      outline = { title: `Chapter ${index + 1}`, pageIndex: index, children: [outline] };
    }
    const book = buildBook(doc(pages, [outline]));
    expect(book.toc.map((entry) => entry.level)).toEqual([1, 2, 3, 4, 5, 6, 6]);
    expect(book.toc[6]?.blockId).toBe(book.blocks[12]?.id);
    expect(book.extraction.warnings).toEqual([]);
  });

  it("is deterministic: the same document and bookmarks give the same book", () => {
    const first = buildBook(doc(chaptered(), CHAPTERS));
    const second = buildBook(doc(chaptered(), CHAPTERS));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe("bookmark title matching", () => {
  /** Titles are compared as keys — that is what `buildToc` hands over. */
  const key = tocTitleKey;

  it("folds case, accents, dot leaders and trailing punctuation into one key", () => {
    expect(key("The AUTHOR’S  Tale")).toBe("the author's tale");
    expect(key("Introduction .... 17")).toBe("introduction");
    expect(key("Capítulo 3:")).toBe("capitulo 3");
    expect(key("Chapter 1")).toBe(key("CHAPTER 1"));
  });

  it("answers when one title is a prefix of the other at a word boundary", () => {
    expect(titlesAnswer(key("Chapter 1"), key("Chapter 1: The Beginning"))).toBe(true);
    expect(titlesAnswer(key("The War of the Worlds"), key("The War"))).toBe(true);
    expect(titlesAnswer(key("Chapter 1"), key("Chapter 12"))).toBe(false);
    expect(titlesAnswer(key("Part"), key("Particular"))).toBe(false);
  });

  it("answers across the leading numbering when only one side carries it", () => {
    expect(titlesAnswer(key("1. Introduction"), key("Introduction"))).toBe(true);
    expect(titlesAnswer(key("Capítulo 3 The Method"), key("3. The Method"))).toBe(true);
    expect(titlesAnswer(key("iv. The War"), key("IV The War"))).toBe(true);
  });

  it("never answers across two different numbers", () => {
    expect(titlesAnswer(key("1. Introduction"), key("2. Introduction"))).toBe(false);
    expect(titlesAnswer(key("Chapter 2 The Method"), key("3. The Method"))).toBe(false);
    expect(titlesAnswer(key("iv. The War"), key("v. The War"))).toBe(false);
    expect(TOC_MIN_MATCH_CHARS).toBe(4);
  });

  it("refuses empty keys and keys too short to answer as prefixes", () => {
    expect(titlesAnswer("", "")).toBe(false);
    expect(titlesAnswer(key("1 x"), key("1"))).toBe(false);
    expect(titlesAnswer(key("War"), key("War of the Worlds"))).toBe(false);
  });
});

describe("flattenOutline", () => {
  it("walks the tree in pre-order with the depth of each level", () => {
    expect(flattenOutline(CHAPTERS)).toEqual([
      { title: "Chapter One", pageIndex: 0, depth: 1 },
      { title: "Chapter Two", pageIndex: 1, depth: 1 },
      { title: "Chapter Three", pageIndex: 2, depth: 2 },
    ]);
    expect(flattenOutline([])).toEqual([]);
  });
});

describe("buildToc without blocks to point at", () => {
  it("returns an empty table for a document without headings", () => {
    const result = buildToc([]);
    expect(result).toEqual({ toc: [], outlineLevels: new Map(), warnings: [] });
  });
});
