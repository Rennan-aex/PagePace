import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { documentParagraphs, paragraphText } from "./paragraphs";
import {
  detectRepeatedRegions,
  PAGE_LABEL_DECORATION_MAX,
  REPEATED_BASELINE_TOLERANCE_FACTOR,
  REPEATED_FONT_MAX_FACTOR,
  REPEATED_MIN_PAGE_SHARE,
  REPEATED_MIN_PAGES,
  stripRepeatedRegions,
} from "./repeated";
import { itemsText } from "./spaces";

const BODY = 11;
const HEADER = 9;
const LEADING = 15;
const MARGIN = 72;
// The ingestion uses a top-left origin, so the smaller the baseline the higher
// the line sits: the head lives near the top of the page, the foot near the
// bottom of it.
const HEAD_BASELINE = 72;
const FOOT_BASELINE = 740;

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

function doc(pages: RawPage[]): RawDocument {
  return {
    schemaVersion: "1.1.0",
    source: {
      fileName: "repeated.pdf",
      sha256: "0".repeat(64),
      pageCount: pages.length,
      tagged: false,
    },
    pages,
    ingest: { adapter: "pdfjs", adapterVersion: "test" },
  };
}

/** The three body lines every fixture page carries, distinct per page, top first. */
function bodyLines(index: number): RawTextItem[] {
  return [0, 1, 2].map((n) =>
    item(`Body line ${index + 1}.${n + 1} of the page text.`, MARGIN, 670 + n * LEADING, BODY, {
      width: 400,
    }),
  );
}

interface PageOptions {
  /** Running head at the top edge; `null` leaves the page without one. */
  head?: string | null;
  /** Baseline of the head (defaults to `HEAD_BASELINE`). */
  headBaseline?: number;
  /** Foot at the bottom edge, usually the printed page number. */
  foot?: string | null;
  /** Replaces the first body line (a chapter title that opens the page). */
  firstLine?: RawTextItem;
}

/** A page with an optional head, three body lines and an optional foot. */
function fixturePage(index: number, options: PageOptions = {}): RawPage {
  const items: RawTextItem[] = [];
  if (options.head !== null && options.head !== undefined) {
    items.push(item(options.head, MARGIN, options.headBaseline ?? HEAD_BASELINE, HEADER));
  }
  const body = bodyLines(index);
  if (options.firstLine !== undefined) body[0] = options.firstLine;
  items.push(...body);
  if (options.foot !== null && options.foot !== undefined) {
    items.push(item(options.foot, MARGIN, FOOT_BASELINE, HEADER));
  }
  return page(items, index);
}

/** Three pages with a running head "MY BOOK" and a numbered foot each. */
function runningHeadBook(): RawDocument {
  return doc([
    fixturePage(0, { head: "MY BOOK", foot: "1" }),
    fixturePage(1, { head: "MY BOOK", foot: "2" }),
    fixturePage(2, { head: "MY BOOK", foot: "3" }),
  ]);
}

describe("stripRepeatedRegions", () => {
  it("removes the running head and the numbered foot of every page", () => {
    const stripped = stripRepeatedRegions(runningHeadBook());

    // Page by page: head, then foot. The three different numbers are one
    // region because only their digits differ.
    expect(stripped.removed.map((occurrence) => occurrence.text)).toEqual([
      "MY BOOK",
      "1",
      "MY BOOK",
      "2",
      "MY BOOK",
      "3",
    ]);
    expect(stripped.pageLabels).toEqual(["1", "2", "3"]);

    expect(stripped.regions.map((region) => region.band)).toEqual(["top", "bottom"]);
    for (const region of stripped.regions) {
      expect(region.occurrences.map((occurrence) => occurrence.page)).toEqual([0, 1, 2]);
    }
    expect(stripped.regions[1]?.occurrences.map((occurrence) => occurrence.pageLabel)).toEqual([
      "1",
      "2",
      "3",
    ]);

    const secondPage = stripped.document.pages[1] as RawPage;
    expect(secondPage.items.map((current) => current.text)).toEqual([
      "Body line 2.1 of the page text.",
      "Body line 2.2 of the page text.",
      "Body line 2.3 of the page text.",
    ]);
    expect(stripped.document.pages).toHaveLength(3);
    expect(stripped.document.source).toEqual(runningHeadBook().source);
  });

  it("leaves a book too short to prove a pattern alone", () => {
    const stripped = stripRepeatedRegions(
      doc([
        fixturePage(0, { head: "MY BOOK", foot: "1" }),
        fixturePage(1, { head: "MY BOOK", foot: "2" }),
      ]),
    );
    expect(stripped.removed).toEqual([]);
    expect(stripped.regions).toEqual([]);
    expect(stripped.pageLabels).toEqual([null, null]);
    expect(stripped.document.pages[0]?.items).toHaveLength(5);
  });

  it("keeps a chapter title that opens the page: it is bigger than the body", () => {
    const title = item("CHAPTER ONE", MARGIN, 670, 18);
    const stripped = stripRepeatedRegions(
      doc([
        fixturePage(0, { firstLine: title }),
        fixturePage(1, { firstLine: item("CHAPTER ONE", MARGIN, 670, 18) }),
        fixturePage(2, { firstLine: item("CHAPTER ONE", MARGIN, 670, 18) }),
      ]),
    );
    expect(stripped.removed).toEqual([]);
    expect(itemsText((stripped.document.pages[0] as RawPage).items)).toContain("CHAPTER ONE");
  });

  it("keeps a small title that appears on a single page", () => {
    const stripped = stripRepeatedRegions(
      doc([
        fixturePage(0),
        fixturePage(1, { firstLine: item("Introduction", MARGIN, 670, BODY) }),
        fixturePage(2),
      ]),
    );
    expect(stripped.removed).toEqual([]);
    expect(itemsText((stripped.document.pages[1] as RawPage).items)).toContain("Introduction");
  });

  it("does not join different chapter numbers: digits alone do not match", () => {
    const stripped = stripRepeatedRegions(
      doc([
        fixturePage(0, { firstLine: item("Chapter 1", MARGIN, 670, BODY) }),
        fixturePage(1, { firstLine: item("Chapter 2", MARGIN, 670, BODY) }),
        fixturePage(2, { firstLine: item("Chapter 3", MARGIN, 670, BODY) }),
      ]),
    );
    expect(stripped.removed).toEqual([]);
  });

  it("keeps a head that moves: the baselines must be stable", () => {
    // The third head sits 20pt above the others, outside the 0.5 leading
    // tolerance: the cluster breaks and nothing is a region any more.
    const stripped = stripRepeatedRegions(
      doc([
        fixturePage(0, { head: "MY BOOK" }),
        fixturePage(1, { head: "MY BOOK" }),
        fixturePage(2, { head: "MY BOOK", headBaseline: HEAD_BASELINE - 20 }),
      ]),
    );
    expect(stripped.removed).toEqual([]);
    expect(stripped.document.pages[2]?.items[0]?.text).toBe("MY BOOK");
  });

  it("counts a page of a single line only as a head, and never empties it", () => {
    const stripped = stripRepeatedRegions(
      doc([
        fixturePage(0, { head: "MY BOOK", foot: "1" }),
        fixturePage(1, { head: "MY BOOK", foot: "2" }),
        page([item("3", MARGIN, HEAD_BASELINE, HEADER)], 2),
      ]),
    );
    expect(stripped.removed).toEqual([]);
    expect(stripped.document.pages[2]?.items.map((current) => current.text)).toEqual(["3"]);
  });

  it("is a no-op on a document without text", () => {
    const stripped = stripRepeatedRegions(doc([page([]), page([])]));
    expect(stripped.removed).toEqual([]);
    expect(stripped.regions).toEqual([]);
    expect(stripped.pageLabels).toEqual([null, null]);
    expect(stripped.document.pages.map((current) => current.items)).toEqual([[], []]);
  });

  it("exposes named, relative thresholds", () => {
    expect(REPEATED_MIN_PAGES).toBeGreaterThanOrEqual(2);
    expect(REPEATED_MIN_PAGE_SHARE).toBeGreaterThan(0);
    expect(REPEATED_MIN_PAGE_SHARE).toBeLessThanOrEqual(1);
    expect(REPEATED_FONT_MAX_FACTOR).toBeGreaterThan(1);
    expect(REPEATED_BASELINE_TOLERANCE_FACTOR).toBeGreaterThan(0);
    expect(REPEATED_BASELINE_TOLERANCE_FACTOR).toBeLessThan(1);
    expect(PAGE_LABEL_DECORATION_MAX).toBeGreaterThanOrEqual(0);
  });
});

describe("detectRepeatedRegions", () => {
  it("reports the regions without touching the document", () => {
    const document = runningHeadBook();
    const regions = detectRepeatedRegions(document);
    expect(regions.map((region) => region.band)).toEqual(["top", "bottom"]);
    expect(document.pages[0]?.items).toHaveLength(5);
  });

  it("finds nothing on the already stripped document (strip runs once)", () => {
    // The public entry points strip exactly once and never hand the clean
    // document back to the detector: a second pass would have nothing left.
    expect(detectRepeatedRegions(stripRepeatedRegions(runningHeadBook()).document)).toEqual([]);
  });
});

describe("documentParagraphs after the strip", () => {
  it("drops the repeated regions before grouping: a head is never a paragraph", () => {
    const paragraphs = documentParagraphs(runningHeadBook());
    expect(paragraphs.map((pageParagraphs) => pageParagraphs.length)).toEqual([1, 1, 1]);
    expect(paragraphs.map((pageParagraphs) => pageParagraphs.map(paragraphText))).toEqual([
      [
        "Body line 1.1 of the page text. Body line 1.2 of the page text. Body line 1.3 of the page text.",
      ],
      [
        "Body line 2.1 of the page text. Body line 2.2 of the page text. Body line 2.3 of the page text.",
      ],
      [
        "Body line 3.1 of the page text. Body line 3.2 of the page text. Body line 3.3 of the page text.",
      ],
    ]);
  });
});
