import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { documentStats, LINE_HEIGHT_FALLBACK_FACTOR, StatsError } from "./stats";

function item(overrides: Partial<RawTextItem> & { text: string }): RawTextItem {
  return {
    x: 72,
    y: 100,
    width: 200,
    height: 14,
    fontName: "Helvetica",
    fontSize: 12,
    ...overrides,
  };
}

function page(items: RawTextItem[], index = 0): RawPage {
  return { index, width: 600, height: 800, rotation: 0, items };
}

function doc(pages: RawPage[]): RawDocument {
  return {
    schemaVersion: "1.1.0",
    source: {
      fileName: "stats.pdf",
      sha256: "0".repeat(64),
      pageCount: pages.length,
      tagged: false,
    },
    pages,
    ingest: { adapter: "pdfjs", adapterVersion: "test" },
  };
}

describe("bodyFontSize", () => {
  it("picks the font size that carries the most characters", () => {
    const stats = documentStats(
      doc([
        page([
          item({ text: "the body of the paragraph is set in eleven point", fontSize: 11 }),
          item({ text: "9pt", fontSize: 9 }),
        ]),
      ]),
    );

    expect(stats.bodyFontSize).toBe(11);
  });

  it("breaks ties toward the smaller size", () => {
    const stats = documentStats(
      doc([page([item({ text: "aaaaa", fontSize: 11 }), item({ text: "bbbbb", fontSize: 9 })])]),
    );

    expect(stats.bodyFontSize).toBe(9);
  });

  it("rounds float noise in the font size to two decimals", () => {
    const stats = documentStats(
      doc([page([item({ text: "eleven", fontSize: 11.000000000000002 })])]),
    );

    expect(stats.bodyFontSize).toBe(11);
  });

  it("counts whitespace-only items once so they cannot dominate", () => {
    const stats = documentStats(
      doc([
        page([
          item({ text: "   ", fontSize: 9 }),
          item({ text: "   ", fontSize: 9 }),
          item({ text: "body", fontSize: 11 }),
        ]),
      ]),
    );

    expect(stats.bodyFontSize).toBe(11);
  });
});

describe("lineHeight", () => {
  it("measures the gap between consecutive lines", () => {
    const stats = documentStats(
      doc([
        page([
          item({ text: "first line", y: 100, height: 12 }),
          item({ text: "second line", y: 114, height: 12 }),
          item({ text: "third line", y: 128, height: 12 }),
        ]),
      ]),
    );

    expect(stats.lineHeight).toBe(14);
  });

  it("never reports a gap for items sitting on the same line", () => {
    const stats = documentStats(
      doc([
        page([
          item({ text: "left", x: 72, y: 100, width: 100, height: 12 }),
          item({ text: "right", x: 300, y: 100, width: 100, height: 12 }),
          item({ text: "next", x: 72, y: 114, width: 100, height: 12 }),
        ]),
      ]),
    );

    expect(stats.lineHeight).toBe(14);
  });

  it("keeps searching when the item below does not overlap horizontally", () => {
    const stats = documentStats(
      doc([
        page([
          item({ text: "column a", x: 72, y: 100, width: 100, height: 12 }),
          item({ text: "other column", x: 300, y: 114, width: 100, height: 12 }),
          item({ text: "column a again", x: 72, y: 128, width: 100, height: 12 }),
        ]),
      ]),
    );

    expect(stats.lineHeight).toBe(28);
  });

  it("ignores gaps outside the plausible band", () => {
    const stats = documentStats(
      doc([
        page([
          item({ text: "far apart", y: 100, height: 12 }),
          item({ text: "far below", y: 200, height: 12 }),
        ]),
      ]),
    );

    expect(stats.lineHeight).toBe(Math.round(12 * LINE_HEIGHT_FALLBACK_FACTOR * 100) / 100);
  });

  it("falls back to the body-size factor when no gap is measurable", () => {
    const stats = documentStats(doc([page([item({ text: "only line" })])]));

    expect(stats.lineHeight).toBe(14.4);
  });
});

describe("margins and column width", () => {
  it("measures the text box against the page box", () => {
    const stats = documentStats(
      doc([page([item({ text: "body", x: 72, y: 100, width: 200, height: 20 })])]),
    );

    expect(stats.margins).toEqual({ top: 100, right: 328, bottom: 680, left: 72 });
    expect(stats.columnWidth).toBe(200);
  });

  it("medians the page boxes across pages", () => {
    const stats = documentStats(
      doc([
        page([item({ text: "first page", x: 72, y: 100, width: 200, height: 20 })], 0),
        page([item({ text: "second page", x: 82, y: 120, width: 240, height: 20 })], 1),
      ]),
    );

    expect(stats.margins.left).toBe(77);
    expect(stats.margins.top).toBe(110);
    expect(stats.columnWidth).toBe(220);
    expect(stats.pagesMeasured).toBe(2);
    expect(stats.itemsMeasured).toBe(2);
  });

  it("skips pages without text but keeps them in the page count", () => {
    const stats = documentStats(
      doc([page([item({ text: "text" })], 0), page([], 1), page([item({ text: "more" })], 2)]),
    );

    expect(stats.pagesMeasured).toBe(2);
    expect(stats.itemsMeasured).toBe(2);
  });
});

describe("errors", () => {
  it("throws when the document has no text at all", () => {
    expect(() => documentStats(doc([page([]), page([], 1)]))).toThrow(StatsError);
    expect(() => documentStats(doc([page([])]))).toThrow("document has no text items");
  });

  it("is deterministic for the same document", () => {
    const document = doc([
      page([
        item({ text: "alpha", y: 100, fontSize: 11 }),
        item({ text: "beta", y: 114, fontSize: 11 }),
        item({ text: "gamma", y: 128, fontSize: 12 }),
      ]),
    ]);

    expect(documentStats(document)).toEqual(documentStats(document));
  });
});
