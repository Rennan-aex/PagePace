// E6-T03: side regions and sidebars (layer 3, "layout"). A band of prose
// sitting in the outer margin — a sidebar box, an editorial note — is not a
// reading column: today `groupItemLines` glues its items to the body lines
// that share the baseline and the text comes out interleaved. The splitter
// claims the band before the lines are built; `groupPageParagraphs` reads
// the main flow first and the side paragraphs last, and `buildBook` marks
// those blocks with `flags: ["sidebar"]`.
//
// Every fixture is synthetic items — no corpus, no PDF — one case per gate
// of `splitSideRegions` (corridor, width, line count, contiguity, main
// share) plus the end-to-end order/flag behaviour of `buildBook`.
import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildBook } from "./book";
import { groupPageParagraphs } from "./paragraphs";
import {
  SIDEBAR_FLAG,
  SIDEBAR_MAX_WIDTH_SHARE,
  SIDEBAR_MIN_GAP_FACTOR,
  SIDEBAR_MIN_LINES,
  SIDEBAR_MIN_MAIN_SHARE,
  SIDEBAR_MIN_WIDTH_FACTOR,
  splitSideRegions,
} from "./sidebars";

const BODY = 11;
const LEADING = 15;
const PAGE_WIDTH = 612;
/** Sidebar band at the left margin, body text pushed right (23pt corridor). */
const SIDE_X = 72;
const MAIN_X = 180;
const MAIN_W = 332;

/** One item sitting on `baseline`, the way the ingestion delivers it. */
function item(
  text: string,
  x: number,
  baseline: number,
  size = BODY,
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

/** `count` prose lines of the main body, starting at `baseline`. */
function mainItems(count: number, baseline = 700, x = MAIN_X, width = MAIN_W): RawTextItem[] {
  return Array.from({ length: count }, (_, index) =>
    item(
      `Body prose line number ${index + 1} carrying the argument forward.`,
      x,
      baseline + index * LEADING,
      BODY,
      { width },
    ),
  );
}

/** `count` short lines of the side band, starting at `baseline`. */
function sideItems(count: number, baseline = 700): RawTextItem[] {
  return Array.from({ length: count }, (_, index) =>
    item(`Side note line ${index + 1}.`, SIDE_X, baseline + index * LEADING),
  );
}

function page(items: RawTextItem[], index = 0): RawPage {
  return { index, width: PAGE_WIDTH, height: 792, rotation: 0, items };
}

function doc(pages: RawPage[]): RawDocument {
  return {
    schemaVersion: "1.2.0",
    source: {
      fileName: "sidebars.pdf",
      sha256: "c".repeat(64),
      pageCount: pages.length,
      tagged: false,
    },
    pages,
    ingest: { adapter: "pdfjs", adapterVersion: "test" },
  };
}

function split(items: RawTextItem[]) {
  return splitSideRegions(items, { bodyFontSize: BODY, lineHeight: LEADING });
}

describe("splitSideRegions: gates", () => {
  it("claims a narrow contiguous band beside the body as a left region (E6-T03)", () => {
    const result = split([...sideItems(3), ...mainItems(10)]);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]?.side).toBe("left");
    expect(result.regions[0]?.items).toHaveLength(3);
    expect(result.main).toHaveLength(10);
    expect(result.main.every((entry) => entry.x === MAIN_X)).toBe(true);
  });

  it("claims a band on the right too and keeps the regions left to right", () => {
    const right = Array.from({ length: 3 }, (_, index) =>
      item(`A side note line ${index + 1}.`, 540, 700 + index * LEADING),
    );
    const result = split([...mainItems(10), ...sideItems(3), ...right]);
    expect(result.regions.map((region) => region.side)).toEqual(["left", "right"]);
    expect(result.regions[0]?.items).toHaveLength(3);
    expect(result.regions[1]?.items).toHaveLength(3);
    expect(result.main).toHaveLength(10);
  });

  it("keeps a band narrower than the minimum width (margin numbers)", () => {
    // ~2.5 body fonts wide — a Bekker/Stephanus number column, E5-T07's turf.
    const numbers = Array.from({ length: 5 }, (_, index) =>
      item(`1094${"abcd"[index % 4]}`, SIDE_X, 700 + index * LEADING),
    );
    const result = split([...numbers, ...mainItems(8)]);
    expect(result.regions).toEqual([]);
    expect(result.main).toHaveLength(13);
  });

  it("keeps a band wider than the maximum share (a real second column)", () => {
    // 190 of 440 content points (~43%): an unbalanced column, above the share
    // gate — E6-T04's problem, not a sidebar.
    const column = Array.from({ length: 6 }, (_, index) =>
      item("The other column carries this much prose.", 72, 700 + index * LEADING, BODY, {
        width: 190,
      }),
    );
    const result = split([...column, ...mainItems(8, 700, 286, 226)]);
    expect(result.regions).toEqual([]);
    expect(result.main).toHaveLength(14);
  });

  it(`keeps a band with fewer than ${SIDEBAR_MIN_LINES} lines`, () => {
    const result = split([...sideItems(SIDEBAR_MIN_LINES - 1), ...mainItems(10)]);
    expect(result.regions).toEqual([]);
    expect(result.main).toHaveLength(12);
  });

  it("keeps a band that holds a column's share of the items", () => {
    // Narrow enough for the width gate but 4/16 of the items: that is a
    // column (`COLUMNS_MIN_COLUMN_SHARE`), and columns belong to E6-T01.
    const result = split([...sideItems(4), ...mainItems(12)]);
    expect(result.regions).toEqual([]);
    expect(result.main).toHaveLength(16);
  });

  it("keeps a band whose lines are not contiguous (scattered margin notes)", () => {
    // Wide enough for the width gate but one line every four body lines: the
    // vertical gaps dwarf the leading, so the run is not a text block.
    const scattered = Array.from({ length: 4 }, (_, index) =>
      item(`Side note line ${index + 1}.`, SIDE_X, 700 + index * 4 * LEADING),
    );
    const result = split([...scattered, ...mainItems(16)]);
    expect(result.regions).toEqual([]);
    expect(result.main).toHaveLength(20);
  });

  it("keeps everything when the corridor is narrower than the minimum gap", () => {
    const near = sideItems(5).map((entry) => ({
      ...entry,
      x: MAIN_X - SIDEBAR_MIN_GAP_FACTOR * BODY + 1 - entry.width,
    }));
    const result = split([...near, ...mainItems(8)]);
    expect(result.regions).toEqual([]);
    expect(result.main).toHaveLength(13);
  });

  it("keeps everything when no band holds the minimum main share", () => {
    // Three comparable bands: the busiest holds 5/15 of the items, below the
    // main-share gate — the page is a three-band layout, not a sidebar page.
    const middle = Array.from({ length: 5 }, (_, index) =>
      item("Middle band prose on one line.", 220, 700 + index * LEADING, BODY, { width: 150 }),
    );
    const right = Array.from({ length: 5 }, (_, index) =>
      item("Right band prose on one line.", 400, 700 + index * LEADING, BODY, { width: 130 }),
    );
    const result = split([...sideItems(5), ...middle, ...right]);
    expect(result.regions).toEqual([]);
    expect(result.main).toHaveLength(15);
  });

  it("returns every item unchanged for an empty page or no body size", () => {
    expect(split([])).toEqual({ main: [], regions: [] });
    const items = [...sideItems(5), ...mainItems(8)];
    const noSize = splitSideRegions(items, { bodyFontSize: 0, lineHeight: LEADING });
    expect(noSize.regions).toEqual([]);
    expect(noSize.main).toHaveLength(13);
  });

  it("exposes the gates as named constants", () => {
    expect(SIDEBAR_MIN_GAP_FACTOR).toBe(1);
    expect(SIDEBAR_MIN_LINES).toBe(3);
    expect(SIDEBAR_MIN_WIDTH_FACTOR).toBeGreaterThan(2);
    expect(SIDEBAR_MAX_WIDTH_SHARE).toBeLessThan(0.5);
    expect(SIDEBAR_MIN_MAIN_SHARE).toBeGreaterThanOrEqual(0.5);
  });
});

describe("groupPageParagraphs: side paragraphs leave the main flow", () => {
  it("keeps same-baseline side lines out of the body text and reads them last", () => {
    // Same baselines on both bands: without the split `groupItemLines`
    // glues each side item to the body line it shares the baseline with.
    const items = [...sideItems(3), ...mainItems(10)];
    const paragraphs = groupPageParagraphs(page(items), {
      bodyFontSize: BODY,
      lineHeight: LEADING,
    });
    expect(paragraphs).toHaveLength(2);
    const main = paragraphs[0] ?? [];
    const side = paragraphs[1] ?? [];
    expect(main).toHaveLength(10);
    expect(side).toHaveLength(3);
    expect(side.every((line) => line.side === true)).toBe(true);
    expect(main.every((line) => line.side !== true)).toBe(true);
    const mainText = main.map((line) => line.items.map((entry) => entry.text).join("")).join(" ");
    expect(mainText).not.toContain("Side note");
    expect(mainText).toContain("Body prose line number 1");
  });
});

describe("buildBook: sidebar blocks carry the flag at the page end (E6-T03)", () => {
  it("marks the side paragraphs with flags and reads them after the body", () => {
    const book = buildBook(doc([page([...sideItems(3), ...mainItems(10)])]));
    expect(book.blocks).toHaveLength(2);
    const [main, side] = [book.blocks[0], book.blocks[1]];
    expect(main?.flags).toEqual([]);
    expect(main?.runs[0]?.text).toContain("Body prose line number 1");
    expect(main?.runs[0]?.text).not.toContain("Side note");
    expect(side?.flags).toEqual([SIDEBAR_FLAG]);
    expect(side?.runs[0]?.text).toBe("Side note line 1. Side note line 2. Side note line 3.");
    // The flag is structural, not doubt: confidence stays at the book level.
    expect(side?.confidence).toBe(main?.confidence);
    expect(side?.origin).toMatchObject({ pageFrom: 0, pageTo: 0 });
  });

  it("never joins a sidebar foot to the first paragraph of the next page (E3-T04 guard)", () => {
    // The sidebar's last line ends mid-sentence and the next page opens flush
    // left: the layout signals alone would glue sidebar text to body text.
    const pages = [
      page([
        ...mainItems(13, 700, 280, 232),
        ...sideItems(3),
        item("The note ends without stop", SIDE_X, 745),
      ]),
      page([item("The body resumes on the next page.", MAIN_X, 700, BODY, { width: MAIN_W })], 1),
    ];
    const book = buildBook(doc(pages));
    expect(book.blocks).toHaveLength(3);
    const side = book.blocks[1];
    expect(side?.flags).toEqual([SIDEBAR_FLAG]);
    expect(side?.origin).toMatchObject({ pageFrom: 0, pageTo: 0 });
    expect(side?.runs[0]?.text).toBe(
      "Side note line 1. Side note line 2. Side note line 3. The note ends without stop",
    );
    expect(book.blocks[2]?.runs[0]?.text).toBe("The body resumes on the next page.");
    expect(book.blocks[2]?.origin).toMatchObject({ pageFrom: 1, pageTo: 1 });
  });
});
