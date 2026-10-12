import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { groupLines, type TextLine } from "./lines";
import {
  documentParagraphs,
  groupParagraphs,
  PARAGRAPH_EXTRA_SPACE_FACTOR,
  PARAGRAPH_INDENT_FACTOR,
  PARAGRAPH_JUSTIFIED_MIN_SHARE,
  PARAGRAPH_MEASURE_TOLERANCE,
  paragraphText,
} from "./paragraphs";

const BODY = 11;
const LEADING = 15;
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

/** A line as the paragraph layer receives it: one item, width controlled by the test. */
function line(text: string, baseline: number, extra: Partial<RawTextItem> = {}): TextLine[] {
  const lines = groupLines(page([item(text, MARGIN, baseline, BODY, extra)]));
  if (lines.length !== 1) throw new Error(`fixture produced ${lines.length} lines`);
  return lines;
}

function page(items: RawTextItem[], index = 0): RawPage {
  return { index, width: 612, height: 792, rotation: 0, items };
}

function doc(pages: RawPage[]): RawDocument {
  return {
    schemaVersion: "1.1.0",
    source: {
      fileName: "paragraphs.pdf",
      sha256: "0".repeat(64),
      pageCount: pages.length,
      tagged: false,
    },
    pages,
    ingest: { adapter: "pdfjs", adapterVersion: "test" },
  };
}

/** Lengths of the paragraphs produced, the shape every test asserts on. */
function lengths(paragraphs: TextLine[][]): number[] {
  return paragraphs.map((paragraph) => paragraph.length);
}

/** A full-measure line (72..540 of the 612pt page) plus its width override. */
const FULL = { width: 468 };

describe("groupParagraphs", () => {
  it("keeps one paragraph when every gap is the typical leading", () => {
    const lines = [...line("one", 100), ...line("two", 115), ...line("three", 130)];
    expect(lengths(groupParagraphs(lines, LEADING))).toEqual([3]);
  });

  it("breaks where the vertical gap exceeds the typical leading", () => {
    const lines = [
      ...line("one", 100),
      ...line("two", 115),
      ...line("three", 130),
      ...line("four", 155),
    ];
    const paragraphs = groupParagraphs(lines, LEADING);
    expect(lengths(paragraphs)).toEqual([3, 1]);
  });

  it("uses the leading it is given: the same gap on a looser book stays inside", () => {
    const lines = [...line("one", 100), ...line("two", 115), ...line("three", 140)];
    expect(lengths(groupParagraphs(lines, LEADING))).toEqual([2, 1]);
    expect(lengths(groupParagraphs(lines, 25))).toEqual([3]);
  });

  it("breaks at a first-line indent of half an em or more", () => {
    const lines = [
      ...line("one", 100),
      ...line("two", 115),
      ...line("indented", 130, { x: MARGIN + 18 }),
      ...line("four", 145),
    ];
    expect(lengths(groupParagraphs(lines, LEADING))).toEqual([2, 2]);
  });

  it("keeps a paragraph whose first line is indented and then returns to the margin", () => {
    const lines = [
      ...line("indented", 100, { x: MARGIN + 18 }),
      ...line("two", 115),
      ...line("three", 130),
    ];
    expect(lengths(groupParagraphs(lines, LEADING))).toEqual([3]);
  });

  it("ignores an indent below the threshold", () => {
    const lines = [
      ...line("one", 100),
      ...line("two", 115, { x: MARGIN + 4 }),
      ...line("three", 130, { x: MARGIN + 4 }),
    ];
    expect(lengths(groupParagraphs(lines, LEADING))).toEqual([3]);
  });

  it("breaks on a short line followed by a full-measure line on a justified page", () => {
    const lines = [
      ...line("one", 100, FULL),
      ...line("two", 115, FULL),
      ...line("short", 130, { width: 200 }),
      ...line("four", 145, FULL),
    ];
    expect(lengths(groupParagraphs(lines, LEADING))).toEqual([3, 1]);
  });

  it("does not break on a short line of a ragged page", () => {
    const lines = [
      ...line("one", 100, { width: 300 }),
      ...line("two", 115, { width: 250 }),
      ...line("short", 130, { width: 200 }),
      ...line("four", 145, FULL),
    ];
    expect(lengths(groupParagraphs(lines, LEADING))).toEqual([4]);
  });

  it("does not break when the next line also misses the measure", () => {
    const lines = [
      ...line("one", 100, FULL),
      ...line("two", 115, FULL),
      ...line("short", 130, { width: 200 }),
      ...line("also short", 145, { width: 300 }),
    ];
    expect(lengths(groupParagraphs(lines, LEADING))).toEqual([4]);
  });

  it("orders paragraphs top to bottom and ignores the input order", () => {
    const items = [
      item("four", MARGIN, 155, BODY),
      item("one", MARGIN, 100, BODY),
      item("three", MARGIN, 130, BODY),
      item("two", MARGIN, 115, BODY),
    ];
    const direct = groupParagraphs(groupLines(page(items)), LEADING);
    expect(lengths(direct)).toEqual([3, 1]);
    expect(groupParagraphs([...direct].reverse().flat(), LEADING)).toEqual(direct);
  });

  it("returns one paragraph per page, even a page with a single line", () => {
    expect(groupParagraphs(line("only", 100), LEADING)).toHaveLength(1);
    expect(groupParagraphs([], LEADING)).toEqual([]);
  });

  it("exposes named, relative thresholds", () => {
    expect(PARAGRAPH_INDENT_FACTOR).toBeGreaterThan(0);
    expect(PARAGRAPH_INDENT_FACTOR).toBeLessThan(1);
    expect(PARAGRAPH_EXTRA_SPACE_FACTOR).toBeGreaterThan(1);
    expect(PARAGRAPH_JUSTIFIED_MIN_SHARE).toBeGreaterThan(0);
    expect(PARAGRAPH_JUSTIFIED_MIN_SHARE).toBeLessThanOrEqual(1);
    expect(PARAGRAPH_MEASURE_TOLERANCE).toBeGreaterThan(0);
    expect(PARAGRAPH_MEASURE_TOLERANCE).toBeLessThan(0.1);
  });
});

describe("documentParagraphs", () => {
  it("groups every page of the document", () => {
    const pages = [
      page([
        item("one", MARGIN, 100, BODY),
        item("two", MARGIN, 115, BODY),
        item("three", MARGIN, 140, BODY),
      ]),
      page([item("one", MARGIN, 100, BODY), item("two", MARGIN, 115, BODY)]),
    ];
    const paragraphs = documentParagraphs(doc(pages));
    expect(paragraphs.map(lengths)).toEqual([[2, 1], [2]]);
  });

  it("takes the typical leading from the whole document, not from the page", () => {
    // Page 1 pins the document leading at 15pt; page 2 alone would read 20pt
    // (its only gaps are 15 and 25) and would never break at 25pt.
    const pages = [
      page([
        item("one", MARGIN, 100, BODY),
        item("two", MARGIN, 115, BODY),
        item("three", MARGIN, 130, BODY),
        item("four", MARGIN, 145, BODY),
        item("five", MARGIN, 160, BODY),
        item("six", MARGIN, 175, BODY),
      ]),
      page([
        item("one", MARGIN, 100, BODY),
        item("two", MARGIN, 115, BODY),
        item("three", MARGIN, 140, BODY),
      ]),
    ];
    expect(documentParagraphs(doc(pages))[1]).toHaveLength(2);
  });

  it("returns no paragraph for a document without text", () => {
    expect(documentParagraphs(doc([page([])]))).toEqual([[]]);
  });
});

describe("paragraphText", () => {
  it("joins the lines of a paragraph with a single space", () => {
    const lines = [
      ...line("The light came", 100, { width: 121 }),
      ...line("slowly over the hills.", 115),
    ];
    const paragraphs = groupParagraphs(lines, LEADING);
    expect(lengths(paragraphs)).toEqual([2]);
    expect(paragraphText(paragraphs[0] as TextLine[])).toBe(
      "The light came slowly over the hills.",
    );
  });

  it("lets the space rule of the core split items of the same line", () => {
    const lines = groupLines(
      page([item("word", MARGIN, 100, BODY), item("next", MARGIN + 25, 100, BODY)]),
    );
    expect(paragraphText(lines)).toBe("word next");
  });

  it("keeps a word whole when pdf.js dropped a hasEOL marker mid-line", () => {
    // The marker sits on the baseline of the line between two touching runs:
    // the block text must come out as one word, with no line break inside.
    const lines = groupLines(
      page([
        item("Mama we", MARGIN, 100, 12),
        item("", MARGIN + 42, 100, 12, { hasEOL: true, width: 0, y: 100, height: 0 }),
        item("nt out", MARGIN + 42.2, 100, 12),
      ]),
    );
    expect(paragraphText(lines)).toBe("Mama went out");
  });

  it("keeps no line break inside the block when the marker splits runs of one line", () => {
    // Equation shape (n4-pt-astrofisica): the producer put an end-of-line
    // marker between two runs groupLines merged into one line (a superscript
    // above the baseline). Whatever the geometry, block text never carries \n.
    const lines = groupLines(
      page([
        item("R", MARGIN, 100, 12),
        item("", MARGIN + 6, 95, 12, { hasEOL: true, width: 0, y: 95, height: 0 }),
        item("2", MARGIN + 6, 95, 8),
      ]),
    );
    expect(lines).toHaveLength(1);
    expect(paragraphText(lines)).toBe("R2");
  });

  it("is empty for an empty paragraph", () => {
    expect(paragraphText([])).toBe("");
  });
});
