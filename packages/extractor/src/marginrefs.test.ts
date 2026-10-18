// E5-T07: margin numbering (layer 4, "semântica"). Every signal of
// `detectMarginRefs` gets a case here — the text shape (digits + letter
// `a`-`e`, optional trailing period) and the position gate (the line
// entirely outside the body's text area, measured with the candidates
// excluded) — plus the buildBook round trip that proves the kind priority:
// the short isolated number stays a `margin_ref` instead of the heading of
// E4-T02, and instead of the `reference` of E5-T06 when a bibliography
// section is open around it. The repeated pass never strips the lettered
// shape, so a Bekker sequence cannot leave the flow as a folio.
import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { BOOK_BLOCK_CONFIDENCE, buildBook } from "./book";
import { detectHeadings, pageMeasureOf } from "./headings";
import {
  bodyMeasures,
  detectMarginRefs,
  isMarginRefShaped,
  isMarginRefText,
  type MarginRefDecision,
} from "./marginrefs";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import { detectReferences } from "./references";
import { stripRepeatedRegions } from "./repeated";
import { documentStats } from "./stats";

const BODY = 11;
const LEADING = 15;
const MARGIN = 72;
/** Size of a printed margin number: the editions set it in the body size. */
const REF_SIZE = BODY;
/** x of a number printed in the left margin (right edge below the body). */
const LEFT_X = 40;
/** x of a number printed in the right margin (left edge past the body). */
const RIGHT_X = 552;

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

/** A block of long prose lines at the page's left edge, first one on `baseline`. */
function bodyLines(baseline: number, count = 3, pageTag = ""): RawTextItem[] {
  return Array.from({ length: count }, (_, index) =>
    item(
      `The body text of line ${index + 1} continues the argument${pageTag} with more prose.`,
      MARGIN,
      baseline + index * LEADING,
      BODY,
      { width: 400 },
    ),
  );
}

function page(items: RawTextItem[], index = 0): RawPage {
  return { index, width: 612, height: 792, rotation: 0, items };
}

function doc(pages: RawPage[]): RawDocument {
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
  };
}

/** Paragraphs, headings and the measures the passes need, measured once. */
function layoutOf(pages: RawPage[]) {
  const document = doc(pages);
  const stats = documentStats(document);
  const grouped = groupDocumentParagraphs(document);
  const paragraphs = joinCrossPageParagraphs(grouped, stats.bodyFontSize);
  const measures = bodyMeasures(grouped, paragraphs);
  // The same two-pass measure buildBook performs: confirmed numbers leave
  // the page's measure, so the paragraphs beside them keep their indent.
  const marginRefs = detectMarginRefs(paragraphs, { measures });
  const marginRefLines = new Set(
    paragraphs
      .filter((_, index) => marginRefs[index]?.marginRef === true)
      .map((paragraph) => paragraph.lines[0]),
  );
  const headings = detectHeadings(paragraphs, {
    bodyFontSize: stats.bodyFontSize,
    lineHeight: stats.lineHeight,
    measures: grouped.map((group) =>
      pageMeasureOf(group.flat().filter((line) => !marginRefLines.has(line))),
    ),
  });
  return { document, stats, paragraphs, measures, headings };
}

/** The decisions `detectMarginRefs` would make for these pages. */
function decisionsOf(pages: RawPage[]): MarginRefDecision[] {
  const { paragraphs, measures } = layoutOf(pages);
  return detectMarginRefs(paragraphs, { measures });
}

/** Body, a left-margin number and body again — the classic Stephanus page. */
function marginPage(text = "1094a", x = LEFT_X, baseline = 170): RawPage {
  return page([...bodyLines(100), item(text, x, baseline, REF_SIZE), ...bodyLines(210)]);
}

describe("isMarginRefText", () => {
  it("accepts the Bekker/Stephanus shapes, with or without the trailing period", () => {
    expect(isMarginRefText("1094a")).toBe(true);
    expect(isMarginRefText("1094d")).toBe(true);
    expect(isMarginRefText("57c")).toBe(true);
    expect(isMarginRefText("20e")).toBe(true);
    expect(isMarginRefText("1094a.")).toBe(true);
    expect(isMarginRefText(" 327b ")).toBe(true);
    expect(isMarginRefText("1094A")).toBe(true);
  });

  it("rejects bare numbers, other letters and prose", () => {
    expect(isMarginRefText("1094")).toBe(false);
    expect(isMarginRefText("42")).toBe(false);
    expect(isMarginRefText("1094f")).toBe(false);
    expect(isMarginRefText("1724")).toBe(false);
    expect(isMarginRefText("1094 ab")).toBe(false);
    expect(isMarginRefText("see 1094a")).toBe(false);
    expect(isMarginRefText("")).toBe(false);
  });
});

describe("detectMarginRefs", () => {
  it("marks a number printed in the left margin", () => {
    expect(decisionsOf([marginPage()]).map((decision) => decision.marginRef)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("marks a number printed in the right margin", () => {
    expect(
      decisionsOf([marginPage("327b", RIGHT_X)]).map((decision) => decision.marginRef),
    ).toEqual([false, true, false]);
  });

  it("marks the trailing-period form a citation footnote prints", () => {
    // The period widens the line, so the number sits a little deeper in
    // the margin to keep its right edge clear of the body.
    expect(decisionsOf([marginPage("1094a.", 36)]).map((decision) => decision.marginRef)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("refuses a bare number in the margin (a folio, a line number, a year)", () => {
    expect(decisionsOf([marginPage("1094")]).map((decision) => decision.marginRef)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("refuses a number inside the text area", () => {
    expect(
      decisionsOf([marginPage("1094a", MARGIN)]).map((decision) => decision.marginRef),
    ).toEqual([false, false, false]);
  });

  it("needs the measure with the candidates excluded to see the margin", () => {
    const { paragraphs, measures } = layoutOf([marginPage()]);
    // The candidate sits at x=40: including it would pull the measure's left
    // edge to 40 and swallow its own margin.
    expect(measures[0]?.left).toBe(MARGIN);
    expect(isMarginRefShaped(paragraphs[1] as (typeof paragraphs)[number])).toBe(true);
    expect(detectMarginRefs(paragraphs, { measures })[1]).toEqual({ marginRef: true });
  });

  it("refuses when the page has no body to measure against", () => {
    const only = page([item("1094a", LEFT_X, 100, REF_SIZE)]);
    expect(decisionsOf([only]).map((decision) => decision.marginRef)).toEqual([false]);
  });

  it("refuses a paragraph of more than one line", () => {
    const twinned = page([
      ...bodyLines(100),
      item("1094a", LEFT_X, 170, REF_SIZE),
      item("and more text that joined the line", LEFT_X, 170 + LEADING, REF_SIZE),
      ...bodyLines(210),
    ]);
    expect(decisionsOf([twinned]).map((decision) => decision.marginRef)).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe("buildBook with margin numbers (E5-T07)", () => {
  it("emits the number as a margin_ref block with its box, out of every other kind", () => {
    const book = buildBook(doc([marginPage()]));

    expect(book.blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "margin_ref",
      "paragraph",
    ]);
    const ref = book.blocks[1];
    expect(ref?.flags).toEqual([]);
    expect(ref?.confidence).toBe(BOOK_BLOCK_CONFIDENCE);
    expect(ref?.origin.pageFrom).toBe(0);
    expect(ref?.origin.pageTo).toBe(0);
    expect(ref?.origin.bbox).toEqual([
      { x: LEFT_X, y: 170 - REF_SIZE, width: 5 * REF_SIZE * 0.5, height: REF_SIZE },
    ]);
    // The short isolated number is a heading candidate (E4-T02) — the kind
    // priority is what keeps it a margin_ref.
    const { paragraphs, measures, headings } = layoutOf([marginPage()]);
    expect(headings[1]?.heading).toBe(true);
    expect(paragraphs).toHaveLength(3);
    expect(measures[0]?.left).toBe(MARGIN);
  });

  it("wins over the reference section of E5-T06 when the number stands inside it", () => {
    // The trailing period ends a sentence, so the number is not a heading
    // candidate (E4-T02) — the contest against `reference` is real.
    const inSection = page([
      ...bodyLines(100),
      item("References", MARGIN, 180, 18),
      item("1094a.", 36, 205, REF_SIZE),
      // Lower-case opening: the section closed at the first paragraph that
      // does not look like an entry.
      item("a closing paragraph that reads as prose, not as an entry.", MARGIN, 235, BODY, {
        width: 400,
      }),
    ]);
    const { paragraphs, headings } = layoutOf([inSection]);
    expect(headings[1]?.heading).toBe(true);
    expect(headings[2]?.heading).toBe(false);
    expect(
      detectReferences(paragraphs, { headings }).map((decision) => decision.reference),
    ).toEqual([false, false, true, false]);

    const book = buildBook(doc([inSection]));
    expect(book.blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "heading",
      "margin_ref",
      "paragraph",
    ]);
  });
});

describe("repeated regions keep the lettered shape (E5-T07)", () => {
  /** A page whose mid-flow line is a numbered candidate, body around it. */
  function flowPage(label: string, index: number): RawPage {
    return page(
      [
        ...bodyLines(600, 3, `, page ${index + 1}, above`),
        item(label, LEFT_X, 680, REF_SIZE),
        ...bodyLines(710, 2, `, page ${index + 1}, below`),
      ],
      index,
    );
  }

  it("never strips an increasing Bekker sequence as a flow folio", () => {
    const stripped = stripRepeatedRegions(
      doc([flowPage("1094a", 0), flowPage("1095a", 1), flowPage("1096a", 2)]),
    );

    expect(stripped.removed).toEqual([]);
  });

  it("still strips the bare-number folio sequence the pass always removed", () => {
    const stripped = stripRepeatedRegions(
      doc([flowPage("42", 0), flowPage("43", 1), flowPage("44", 2)]),
    );

    expect(stripped.removed.map((occurrence) => occurrence.text)).toEqual(["42", "43", "44"]);
  });
});
