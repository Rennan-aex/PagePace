// E4-T02: headings and their levels (layer 4, "semântica"). Every signal of
// `detectHeadings` gets a case here, plus the exclusions that keep body text
// out (a one-line sentence, an indented list item, an italic epigraph).
import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildBook } from "./book";
import {
  detectHeadings,
  HEADING_MAX_LEVEL,
  HEADING_MAX_LINES,
  HEADING_SIZE_CLUSTER_FACTOR,
  type HeadingDecision,
  headingLevels,
  pageMeasureOf,
} from "./headings";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import { documentStats } from "./stats";

const BODY = 11;
const LEADING = 15;
const MARGIN = 72;
/** Width of one character in the fixtures (`width = length · size · 0.5`). */
const CHAR = BODY * 0.5;
const INDENT = MARGIN + 2 * BODY;

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

/** A block of lines, the first one on `baseline`, one leading apart. */
function lines(
  texts: readonly string[],
  baseline: number,
  size = BODY,
  extra: Partial<RawTextItem> = {},
): RawTextItem[] {
  return texts.map((text, index) => item(text, MARGIN, baseline + index * LEADING, size, extra));
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

/** The decisions `buildBook` would make for these pages. */
function decisionsOf(pages: RawPage[]): HeadingDecision[] {
  const document = doc(pages);
  const stats = documentStats(document);
  const grouped = groupDocumentParagraphs(document);
  return detectHeadings(joinCrossPageParagraphs(grouped, stats.bodyFontSize), {
    bodyFontSize: stats.bodyFontSize,
    lineHeight: stats.lineHeight,
    measures: grouped.map((page) => pageMeasureOf(page.flat())),
  });
}

/** A body paragraph of three long lines (keeps the median leading at 15). */
const BODY_LONG = (baseline: number, x = MARGIN): RawTextItem[] =>
  lines(
    [
      "01234567890123456789012345678901234567890123456789",
      "01234567890123456789012345678901234567890123456789",
      "01234567890123456789012345678901234567890123456789",
    ],
    baseline,
    BODY,
    { x },
  );

describe("detectHeadings", () => {
  it("finds a short isolated line that does not end a sentence", () => {
    const decisions = decisionsOf([
      page([...BODY_LONG(100), ...lines(["Chapter Title"], 155), ...BODY_LONG(180)]),
    ]);
    expect(decisions.map((decision) => decision.heading)).toEqual([false, true, false]);
    expect(decisions[1]?.level).toBe(1);
  });

  it("keeps a one-line sentence as a paragraph (a finished sentence is body text)", () => {
    const decisions = decisionsOf([
      page([...BODY_LONG(100), ...lines(["Alone."], 155), ...BODY_LONG(180)]),
    ]);
    expect(decisions.map((decision) => decision.heading)).toEqual([false, false, false]);
  });

  it("keeps a multi-line block as a paragraph even when its lines are short", () => {
    const decisions = decisionsOf([
      page([
        ...lines(
          [
            "A paragraph that keeps going",
            "over three short lines and",
            "never looks like a title here",
          ],
          100,
        ),
        ...BODY_LONG(155),
      ]),
    ]);
    expect(decisions[0]?.heading).toBe(false);
  });

  it("finds a larger font without needing isolation", () => {
    // The title sits flush against the paragraph below (only the indent of
    // that paragraph keeps the two blocks apart): only the size can speak.
    const decisions = decisionsOf([
      page([
        ...lines(["Large Title"], 100, 14),
        ...lines(["Body text right under the title", "with no extra space above."], 115, BODY, {
          x: INDENT,
        }),
      ]),
    ]);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toEqual({ heading: true, level: 1 });
    expect(decisions[1]?.heading).toBe(false);
  });

  it("finds a bold line at the body size without isolation", () => {
    const decisions = decisionsOf([
      page([
        ...lines(["Bold Title"], 100, BODY, { fontName: "Helvetica-Bold" }),
        ...lines(["Body text right under the title", "with no extra space above."], 115, BODY, {
          x: INDENT,
        }),
      ]),
    ]);
    expect(decisions[0]).toEqual({ heading: true, level: 1 });
  });

  it("finds a centered line even though its left edge looks indented", () => {
    const width = 50 * CHAR;
    const titleWidth = "Centered Title".length * CHAR;
    const decisions = decisionsOf([
      page([
        ...BODY_LONG(100),
        ...[item("Centered Title", MARGIN + (width - titleWidth) / 2, 155, BODY)],
        ...BODY_LONG(180),
      ]),
    ]);
    expect(decisions[1]).toEqual({ heading: true, level: 1 });
  });

  it("keeps an indented line as a list item, not a heading", () => {
    const decisions = decisionsOf([
      page([
        ...BODY_LONG(100),
        ...lines(["First point"], 155, BODY, { x: INDENT }),
        ...BODY_LONG(180),
      ]),
    ]);
    expect(decisions[1]?.heading).toBe(false);
  });

  it("keeps a centered list marker as a list item, not a heading", () => {
    // E5-T05: a bullet block can sit on the measure's centre by accident
    // (the Helvetica widths of a synthetic item did) and the layout never
    // outweighs the printed marker — only size or weight do.
    const width = 50 * CHAR;
    const text = "1. First point";
    const decisions = decisionsOf([
      page([
        ...BODY_LONG(100),
        ...[item(text, MARGIN + (width - text.length * CHAR) / 2, 155, BODY)],
        ...BODY_LONG(180),
      ]),
    ]);
    expect(decisions[1]?.heading).toBe(false);
  });

  it("keeps an italic-dominant line as an epigraph, not a heading", () => {
    const decisions = decisionsOf([
      page([
        ...BODY_LONG(100),
        ...lines(["Read slowly"], 155, BODY, { fontName: "Helvetica-Oblique" }),
        ...BODY_LONG(180),
      ]),
    ]);
    expect(decisions[1]?.heading).toBe(false);
  });

  it("keeps a caption as a caption, not a heading", () => {
    const decisions = decisionsOf([
      page([...BODY_LONG(100), ...lines(["Fig. 3 The village street"], 155), ...BODY_LONG(180)]),
    ]);
    expect(decisions[1]?.heading).toBe(false);
  });

  it("finds a section number (`1.2 The method`) but not a list number (`1. First`)", () => {
    const numbered = decisionsOf([
      page([...BODY_LONG(100), ...lines(["1.2 The method"], 155), ...BODY_LONG(180)]),
    ]);
    expect(numbered[1]?.heading).toBe(true);

    const listed = decisionsOf([
      page([...BODY_LONG(100), ...lines(["1. First point"], 155), ...BODY_LONG(180)]),
    ]);
    expect(listed[1]?.heading).toBe(false);

    // The same list number at a chapter size still wins on the type alone.
    const listedLarge = decisionsOf([
      page([...BODY_LONG(100), ...lines(["1. Introduction"], 155, 14), ...BODY_LONG(180)]),
    ]);
    expect(listedLarge[1]?.heading).toBe(true);
  });

  it("finds a chapter word (`Capítulo 3`)", () => {
    const decisions = decisionsOf([
      page([...BODY_LONG(100), ...lines(["Capítulo 3 O método"], 155), ...BODY_LONG(180)]),
    ]);
    expect(decisions[1]?.heading).toBe(true);
  });

  it("rejects a block deeper than HEADING_MAX_LINES", () => {
    const decisions = decisionsOf([
      page([
        ...lines(
          Array.from(
            { length: HEADING_MAX_LINES + 1 },
            (_, index) => `Short line number ${index} of the block`,
          ),
          100,
        ),
        ...BODY_LONG(175),
      ]),
    ]);
    expect(decisions[0]?.heading).toBe(false);
  });
});

describe("headingLevels", () => {
  it("ranks the font-size clusters, largest first", () => {
    expect(headingLevels([18, 12, 14])).toEqual([1, 3, 2]);
    expect(headingLevels([18, 14, 12])).toEqual([1, 2, 3]);
  });

  it("shares one level between sizes closer than the cluster factor", () => {
    const close = BODY * (1 + HEADING_SIZE_CLUSTER_FACTOR / 2);
    expect(headingLevels([close, BODY])).toEqual([1, 1]);
  });

  it("falls back to the reading order when every heading has one size", () => {
    expect(headingLevels([BODY, BODY])).toEqual([1, 2]);
    expect(headingLevels([BODY, BODY, BODY])).toEqual([1, 2, 3]);
    expect(headingLevels([BODY])).toEqual([1]);
  });

  it("never goes deeper than HEADING_MAX_LEVEL", () => {
    expect(headingLevels(Array.from({ length: 9 }, () => BODY))).toEqual([
      1,
      2,
      3,
      4,
      5,
      HEADING_MAX_LEVEL,
      HEADING_MAX_LEVEL,
      HEADING_MAX_LEVEL,
      HEADING_MAX_LEVEL,
    ]);
  });
});

describe("buildBook with headings (E4-T02)", () => {
  it("emits a heading block with its level and keeps the others as paragraphs", () => {
    const book = buildBook(
      doc([page([...BODY_LONG(100), ...lines(["Chapter Title"], 155), ...BODY_LONG(180)])]),
    );
    expect(book.blocks.map((block) => block.kind)).toEqual(["paragraph", "heading", "paragraph"]);
    expect(book.blocks[1]?.level).toBe(1);
    expect(book.blocks[1]?.runs.map((run) => run.text)).toEqual(["Chapter Title"]);
  });

  it("ranks a chapter title above a section title by font size", () => {
    const book = buildBook(
      doc([
        page([
          ...lines(["Chapter One"], 100, 18),
          ...BODY_LONG(140),
          ...lines(["1.1 The beginning"], 195, 14),
          ...BODY_LONG(230),
        ]),
      ]),
    );
    const levels = book.blocks
      .filter((block) => block.kind === "heading")
      .map((block) => ({ text: block.runs.map((run) => run.text).join(""), level: block.level }));
    expect(levels).toEqual([
      { text: "Chapter One", level: 1 },
      { text: "1.1 The beginning", level: 2 },
    ]);
  });
});

describe("heading runs vs the title style (E4-T05)", () => {
  it("does not carry the title style's bold as run bold", () => {
    // The heading is bold face at the body size: the weight says "title" and
    // `kind` + `level` already carry that meaning, so no run keeps `bold`.
    const book = buildBook(
      doc([
        page([
          ...BODY_LONG(100),
          ...lines(["Bold Title"], 155, BODY, { fontName: "Helvetica-Bold" }),
          ...BODY_LONG(180),
        ]),
      ]),
    );
    const heading = book.blocks.find((block) => block.kind === "heading");
    expect(heading?.runs).toEqual([{ text: "Bold Title" }]);
  });

  it("keeps word-level bold inside a heading whose face is not bold", () => {
    // Detected by size alone (14 >= 1.2 · 11); "One" is bold for emphasis,
    // not as the title face (3 of the 10 non-space characters), so it stays.
    const title = [
      item("Chapter ", MARGIN, 155, 14),
      item("One", MARGIN + "Chapter ".length * 7, 155, 14, { fontName: "Helvetica-Bold" }),
    ];
    const book = buildBook(doc([page([...BODY_LONG(100), ...title, ...BODY_LONG(180)])]));
    const heading = book.blocks.find((block) => block.kind === "heading");
    expect(heading?.runs).toEqual([{ text: "Chapter " }, { text: "One", bold: true }]);
  });

  it("strips the bold of a bold-dominant heading and merges the plain fragment", () => {
    // 7 of the 10 non-space characters are bold (>= HEADING_BOLD_SHARE): the
    // whole face is the title style, so the plain fragment loses the split.
    const title = [
      item("Chapter ", MARGIN, 155, 14, { fontName: "Helvetica-Bold" }),
      item("One", MARGIN + "Chapter ".length * 7, 155, 14),
    ];
    const book = buildBook(doc([page([...BODY_LONG(100), ...title, ...BODY_LONG(180)])]));
    const heading = book.blocks.find((block) => block.kind === "heading");
    expect(heading?.runs).toEqual([{ text: "Chapter One" }]);
  });
});
