// E6-T01: column detection (layer 3, "layout"). The vertical-gap projection
// of `detectColumns` gets a case here for every gate: 1/2/3 columns, the cap
// at 3, spanning titles and figure regions, and the false-positive guards
// (ragged verse, block-quote indent, margin numbers, gaps narrower than the
// minimum). Every fixture is synthetic items — no corpus, no PDF. Items are
// the voting unit because `groupLines` still joins same-baseline items
// across the gutter (the single-column assumption of E2).
import type { RawDocument, RawNonTextRegion, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import {
  COLUMNS_MAX,
  COLUMNS_MIN_GUTTER_FACTOR,
  detectColumns,
  detectDocumentColumns,
  detectPageColumns,
  type PageColumns,
} from "./columns";

const BODY = 11;
const PAGE_WIDTH = 612;
const MARGIN = 72;
/** Column geometry of the synthetic two-column page (11pt body). */
const COL1_X = 72;
const COL2_X = 318;
const COL_W = 222;
const GUTTER_W = 24;

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

/** A stack of `count` prose items in the column that starts at `x`. */
function columnItems(x: number, count: number, baseline = 700, width = COL_W): RawTextItem[] {
  return Array.from({ length: count }, (_, index) =>
    item(`Column text line number ${index + 1} of prose.`, x, baseline + index * 15, BODY, {
      width,
    }),
  );
}

function page(items: RawTextItem[], nonText?: RawNonTextRegion[]): RawPage {
  return {
    index: 0,
    width: PAGE_WIDTH,
    height: 792,
    rotation: 0,
    items,
    ...(nonText ? { nonText } : {}),
  };
}

function doc(pages: RawPage[]): RawDocument {
  return {
    schemaVersion: "1.2.0",
    source: {
      fileName: "columns.pdf",
      sha256: "b".repeat(64),
      pageCount: pages.length,
      tagged: false,
    },
    pages,
    ingest: { adapter: "pdfjs", adapterVersion: "test" },
  };
}

function detect(items: RawTextItem[], nonText?: RawNonTextRegion[]): PageColumns {
  return detectPageColumns(page(items, nonText), { bodyFontSize: BODY });
}

describe("detectColumns: column count", () => {
  it("reads a single-column page as one column", () => {
    const result = detect(columnItems(MARGIN, 12, 700, 400));
    expect(result.count).toBe(1);
    expect(result.columns).toEqual([{ x: MARGIN, width: 400 }]);
    expect(result.gutters).toEqual([]);
    expect(result.spanningItems.every((flag) => flag === false)).toBe(true);
  });

  it("reads a two-column page as two columns with the gutter between them", () => {
    const result = detect([...columnItems(COL1_X, 8), ...columnItems(COL2_X, 8)]);
    expect(result.count).toBe(2);
    expect(result.columns).toEqual([
      { x: COL1_X, width: COL_W },
      { x: COL2_X, width: COL_W },
    ]);
    expect(result.gutters).toEqual([{ x: COL1_X + COL_W, width: GUTTER_W }]);
  });

  it("reads a three-column page as three columns", () => {
    const width = 140;
    const result = detect([
      ...columnItems(72, 6, 700, width),
      ...columnItems(236, 6, 700, width),
      ...columnItems(400, 6, 700, width),
    ]);
    expect(result.count).toBe(3);
    expect(result.columns.map((column) => column.x)).toEqual([72, 236, 400]);
  });

  it("caps the count at COLUMNS_MAX and keeps the widest gutters", () => {
    const width = 94;
    const result = detect([
      ...columnItems(72, 6, 700, width),
      ...columnItems(190, 6, 700, width),
      ...columnItems(308, 6, 700, width),
      ...columnItems(426, 6, 700, width),
    ]);
    expect(result.count).toBe(COLUMNS_MAX);
    expect(result.gutters).toHaveLength(COLUMNS_MAX - 1);
    expect(result.columns).toHaveLength(COLUMNS_MAX);
  });

  it("ignores a gap narrower than the minimum gutter", () => {
    const narrow = 4;
    const result = detect([
      ...columnItems(COL1_X, 8, 700, COL_W),
      ...columnItems(COL1_X + COL_W + narrow, 8, 700, COL_W - narrow),
    ]);
    expect(result.count).toBe(1);
    expect(result.gutters).toEqual([]);
  });

  it("returns one column for an empty page", () => {
    const result = detect([]);
    expect(result.count).toBe(1);
    expect(result.columns).toEqual([]);
    expect(result.spanningItems).toEqual([]);
  });
});

describe("detectColumns: spanning items and regions", () => {
  it("marks a full-width title crossing the gutter and keeps the count", () => {
    const title = item("A title that spans both columns of the page of light", MARGIN, 680);
    const result = detect([title, ...columnItems(COL1_X, 8), ...columnItems(COL2_X, 8)]);
    expect(result.count).toBe(2);
    expect(result.spanningItems[0]).toBe(true);
    expect(result.spanningItems.slice(1).every((flag) => flag === false)).toBe(true);
  });

  it("tolerates a spanning abstract up to the share gate", () => {
    const spanning = Array.from({ length: 6 }, (_, index) =>
      item(`A spanning abstract line number ${index + 1} of the page.`, MARGIN, 640 + index * 15),
    );
    const result = detect([...spanning, ...columnItems(COL1_X, 20), ...columnItems(COL2_X, 20)]);
    expect(result.count).toBe(2);
    expect(result.spanningItems.slice(0, 6).every((flag) => flag === true)).toBe(true);
  });

  it("falls back to one column when most items span the gutter", () => {
    const spanning = Array.from({ length: 10 }, (_, index) =>
      item(`A spanning abstract line number ${index + 1} of the page.`, MARGIN, 640 + index * 15),
    );
    const result = detect([
      ...spanning,
      ...columnItems(COL1_X, 10, 820),
      ...columnItems(COL2_X, 10, 820),
    ]);
    expect(result.count).toBe(1);
  });

  it("marks a figure region that crosses the gutter as spanning", () => {
    const figure: RawNonTextRegion = {
      bbox: { x: 72, y: 100, width: 468, height: 120 },
      kind: "image",
    };
    const inset: RawNonTextRegion = {
      bbox: { x: 318, y: 400, width: 200, height: 80 },
      kind: "image",
    };
    const result = detect([...columnItems(COL1_X, 8), ...columnItems(COL2_X, 8)], [figure, inset]);
    expect(result.count).toBe(2);
    expect(result.regionSpanning).toEqual([true, false]);
  });
});

describe("detectColumns: false-positive guards", () => {
  it("never splits a page of short verse lines", () => {
    const result = detect(
      Array.from({ length: 10 }, (_, index) =>
        item("short verse line", MARGIN, 700 + index * 15, BODY, { width: 140 }),
      ),
    );
    expect(result.count).toBe(1);
  });

  it("never splits a page because of a block-quote indent", () => {
    const quote = Array.from({ length: 3 }, (_, index) =>
      item("An indented quote line of the block.", MARGIN + 18, 730 + index * 15, BODY, {
        width: 420,
      }),
    );
    const result = detect([...columnItems(MARGIN, 10, 700, 400), ...quote]);
    expect(result.count).toBe(1);
  });

  it("never splits a page because of margin numbers", () => {
    const refs = Array.from({ length: 2 }, (_, index) =>
      item(`109${index}a`, 40, 700 + index * 30, BODY, { width: 24 }),
    );
    const result = detect([...columnItems(MARGIN, 12, 700, 400), ...refs]);
    expect(result.count).toBe(1);
  });

  it("never counts a narrow stray sliver beside the text block as a column", () => {
    const sliver = Array.from({ length: 4 }, (_, index) =>
      item("note", 520, 700 + index * 30, BODY, { width: 20 }),
    );
    const result = detect([...columnItems(MARGIN, 12, 700, 400), ...sliver]);
    expect(result.count).toBe(1);
  });
});

describe("detectColumns: spanning band above a two-column body", () => {
  // `n2-en-astrofisica` p1: title/abstract/footer rows are full width and
  // vote on every bin, so the crossing gate refuses the real gutter of the
  // two-column body below. The row cut removes those rows from the
  // projection; the line-gap gate then checks that the body lines actually
  // break at the gutter (a single-column page of full-width lines does not).
  it("reads a two-column page under a full-width abstract as two columns", () => {
    const spanning = Array.from({ length: 12 }, (_, index) =>
      item(
        "A full width abstract line of the manuscript that crosses.",
        MARGIN,
        300 + index * 15,
        BODY,
        {
          width: 400,
        },
      ),
    );
    const result = detect([
      ...spanning,
      ...columnItems(COL1_X, 12, 500),
      ...columnItems(COL2_X, 12, 500),
    ]);
    expect(result.count).toBe(2);
    expect(result.gutters).toEqual([{ x: COL1_X + COL_W, width: GUTTER_W }]);
    expect(result.spanningItems.slice(0, 12).every((flag) => flag === true)).toBe(true);
  });

  it("keeps one column when the cut's gutter carries no line gap", () => {
    const fullWidth = Array.from({ length: 14 }, (_, index) =>
      item(
        "A full width line of a single column page of the journal.",
        MARGIN,
        300 + index * 15,
        BODY,
        {
          width: 400,
        },
      ),
    );
    const left = [700, 730, 760].map((baseline) =>
      item("Short fragment", MARGIN, baseline, BODY, { width: 120 }),
    );
    const right = [710, 740, 770].map((baseline) =>
      item("Short fragment", 352, baseline, BODY, { width: 120 }),
    );
    const result = detect([...fullWidth, ...left, ...right]);
    expect(result.count).toBe(1);
    expect(result.gutters).toEqual([]);
  });
});

describe("detectColumns: purity and helpers", () => {
  it("is deterministic and does not mutate the input", () => {
    const items = [...columnItems(COL1_X, 8), ...columnItems(COL2_X, 8)];
    const snapshot = JSON.parse(JSON.stringify(items));
    const first = detectColumns(items, { bodyFontSize: BODY });
    const second = detectColumns(items, { bodyFontSize: BODY });
    expect(first).toEqual(second);
    expect(items).toEqual(snapshot);
  });

  it("detects every page of a document, one and two columns", () => {
    const pages = [
      page(columnItems(MARGIN, 8)),
      page([...columnItems(COL1_X, 8), ...columnItems(COL2_X, 8)]),
    ];
    const results = detectDocumentColumns(doc(pages), { bodyFontSize: BODY });
    expect(results.map((result) => result.count)).toEqual([1, 2]);
  });

  it("exposes the minimum gutter as a body-size multiple", () => {
    expect(COLUMNS_MIN_GUTTER_FACTOR).toBeGreaterThan(0);
  });
});
