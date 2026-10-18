// E5-T06: bibliographic references (layer 4, "semântica"). Every signal of
// `detectReferences` gets a case here — the section title (exact match, blind
// to case and to a trailing colon, en/pt lexicon), the entry shape
// (upper-case author, bracketed label, year) — plus the two guards that keep
// the run inside the section (a paragraph that does not open like an entry, a
// paragraph the heading pass claims). The buildBook round trip proves the
// kind priority: the recuo of a typeset reference stays a `reference` instead
// of the shallow list of E5-T05, and an entry set smaller in the page foot
// stays a `reference` instead of the note of E5-T01.
import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { BOOK_BLOCK_CONFIDENCE, buildBook } from "./book";
import { detectFootnotes } from "./footnotes";
import { detectHeadings, pageMeasureOf } from "./headings";
import { detectLists } from "./lists";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import {
  detectReferences,
  opensLikeReference,
  REFERENCE_SECTION_TITLES,
  type ReferenceDecision,
} from "./references";
import { documentStats } from "./stats";

const BODY = 11;
const LEADING = 15;
const MARGIN = 72;
/** Recuo of a typeset reference: shallow list band of E5-T05 (1,6 em). */
const REFERENCE_INDENT = 18;

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

/** A block of lines at the page's left edge, the first one on `baseline`. */
function lines(
  texts: readonly string[],
  baseline: number,
  size = BODY,
  leading = LEADING,
): RawTextItem[] {
  return texts.map((text, index) => item(text, MARGIN, baseline + index * leading, size));
}

/** A block of lines inside the recuo of a typeset reference. */
function entryLines(texts: readonly string[], baseline: number, size = BODY): RawTextItem[] {
  return texts.map((text, index) =>
    item(text, MARGIN + REFERENCE_INDENT, baseline + index * LEADING, size),
  );
}

/** A body paragraph of three long lines (keeps the median leading at 15). */
const bodyAt = (baseline: number): RawTextItem[] =>
  lines(
    [
      "01234567890123456789012345678901234567890123456789",
      "01234567890123456789012345678901234567890123456789",
      "01234567890123456789012345678901234567890123456789",
    ],
    baseline,
  );

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

/** Paragraphs, heading decisions, page lines and measures, measured once. */
function layoutOf(pages: RawPage[]) {
  const document = doc(pages);
  const stats = documentStats(document);
  const grouped = groupDocumentParagraphs(document);
  const paragraphs = joinCrossPageParagraphs(grouped, stats.bodyFontSize);
  const measures = grouped.map((pageLines) => pageMeasureOf(pageLines.flat()));
  const headings = detectHeadings(paragraphs, {
    bodyFontSize: stats.bodyFontSize,
    lineHeight: stats.lineHeight,
    measures,
  });
  return {
    document,
    stats,
    paragraphs,
    headings,
    measures,
    pageLines: grouped.map((page) => page.flat()),
  };
}

/** The decisions `detectReferences` would make for these pages. */
function decisionsOf(pages: RawPage[]): ReferenceDecision[] {
  const { paragraphs, headings } = layoutOf(pages);
  return detectReferences(paragraphs, { headings });
}

/** A page with body text, a section title and two entries in the recuo. */
function sectionPage(title = "References"): RawPage {
  return page([
    ...bodyAt(100),
    ...lines([title], 170),
    ...entryLines(
      ["Abrams, H. (2016). The bend of a river: field notes on", "meanders. Harbor Press."],
      210,
    ),
    ...entryLines(
      [
        "Okonkwo, A. Rivers and roads: a study of paths.",
        "Lagos Field Series 4. River House, 2018.",
      ],
      250,
    ),
  ]);
}

describe("detectReferences", () => {
  it("marks the entry-shaped paragraphs that follow a section title", () => {
    const decisions = decisionsOf([sectionPage()]);
    expect(decisions.map((decision) => decision.reference)).toEqual([false, false, true, true]);
  });

  it("matches the title blind to case and to a trailing colon", () => {
    const decisions = decisionsOf([sectionPage("REFERENCES:")]);
    expect(decisions.filter((decision) => decision.reference)).toHaveLength(2);
  });

  it("keeps the Portuguese titles of the lexicon", () => {
    for (const title of ["Referências", "Bibliografia", "Obras citadas"]) {
      const decisions = decisionsOf([sectionPage(title)]);
      expect(
        decisions.filter((decision) => decision.reference),
        title,
      ).toHaveLength(2);
    }
  });

  it("marks nothing when the document has no section title", () => {
    const decisions = decisionsOf([sectionPage("A transitional line of the chapter")]);
    expect(decisions.map((decision) => decision.reference)).toEqual([false, false, false, false]);
  });

  it("needs the whole title: a heading that merely starts with the word is not it", () => {
    const decisions = decisionsOf([sectionPage("References in Everyday Life")]);
    expect(decisions.map((decision) => decision.reference)).toEqual([false, false, false, false]);
  });

  it("stops at the first paragraph that does not open like an entry", () => {
    const decisions = decisionsOf([
      page([
        ...bodyAt(100),
        ...lines(["References"], 170),
        ...entryLines(["Abrams, H. (2016). The bend of a river."], 210),
        ...lines(["the works below shaped the chapter above."], 250),
        ...entryLines(["Chen, L. Maps drawn by water. Harbor Press, 2020."], 290),
      ]),
    ]);
    expect(decisions.map((decision) => decision.reference)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it("never marks a heading, even one that opens like an entry", () => {
    const pages = [
      page([
        ...bodyAt(100),
        ...lines(["References"], 170),
        // 18 pt claims it as a title, and the run of entries stops there.
        ...lines(["Rivers"], 210, 18),
        ...entryLines(["Abrams, H. (2016). The bend of a river."], 250),
      ]),
    ];
    const { paragraphs, headings } = layoutOf(pages);
    expect(headings[2]?.heading).toBe(true);
    expect(
      detectReferences(paragraphs, { headings }).map((decision) => decision.reference),
    ).toEqual([false, false, false, false]);
  });

  it("accepts the bracketed label and the year openings of an entry", () => {
    const decisions = decisionsOf([
      page([
        ...bodyAt(100),
        ...lines(["Bibliography"], 170),
        ...lines(["[1] Duarte, M. The ferry rope. River House, 2021."], 210),
        ...lines(["(2019) An entry the author left unsigned."], 250),
      ]),
    ]);
    expect(decisions.map((decision) => decision.reference)).toEqual([false, false, true, true]);
  });

  it("keeps the named constants", () => {
    expect([...REFERENCE_SECTION_TITLES]).toEqual([
      "references",
      "bibliography",
      "works cited",
      "referências",
      "bibliografia",
      "obras citadas",
    ]);
    expect(opensLikeReference("Abrams, H. A capitalized author.")).toBe(true);
    expect(opensLikeReference("[1] A bracketed label.")).toBe(true);
    expect(opensLikeReference("[12 An unclosed label.")).toBe(false);
    expect(opensLikeReference("(2020) A year opening.")).toBe(true);
    expect(opensLikeReference("2019, A bare year opening.")).toBe(true);
    expect(opensLikeReference('"A quoted title opening.')).toBe(true);
    expect(opensLikeReference("the continuation of the entry above.")).toBe(false);
    expect(opensLikeReference("")).toBe(false);
  });
});

describe("buildBook with references (E5-T06)", () => {
  it("emits the section entries as reference blocks and keeps the title a heading", () => {
    const book = buildBook(doc([sectionPage()]));

    expect(book.blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "heading",
      "reference",
      "reference",
    ]);
    // The recuo sits in the shallow band E5-T05 reads as a list (1,6 em): the
    // kind of the section wins, so no `uncertain-list` flag leaks into it.
    const { paragraphs, headings, measures } = layoutOf([sectionPage()]);
    expect(detectLists(paragraphs, { measures })[2]).toEqual({
      list: true,
      marked: false,
      uncertain: true,
    });
    expect(detectReferences(paragraphs, { headings })[2]).toEqual({ reference: true });
    expect(book.blocks[2]?.flags).toEqual([]);
    expect(book.blocks[3]?.flags).toEqual([]);
    expect(book.blocks[2]?.confidence).toBe(BOOK_BLOCK_CONFIDENCE);
    expect(book.blocks[2]?.origin).toEqual({ pageFrom: 0, pageTo: 0 });
  });

  it("wins over the foot note of E5-T01 for an entry set smaller in the page foot", () => {
    const pageWithFoot = page([
      ...bodyAt(100),
      ...lines(["References"], 170),
      ...lines(["1. Abrams, H. The bend of a river and the roads that", "left it."], 210, 10),
      ...lines(["2. Okonkwo, A. Rivers and roads: a study of paths."], 250, 10),
    ]);
    const { stats, paragraphs, pageLines } = layoutOf([pageWithFoot]);
    // The fixture is the E5-T01 case itself: bottom region, smaller font,
    // numbered marker. The section is what says it is a reference.
    expect(
      detectFootnotes(paragraphs, pageLines, { bodyFontSize: stats.bodyFontSize }).map(
        (decision) => decision.footnote,
      ),
    ).toEqual([false, false, true, true]);

    const book = buildBook(doc([pageWithFoot]));
    expect(book.blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "heading",
      "reference",
      "reference",
    ]);
    expect(book.blocks[2]?.flags).toEqual([]);
    expect(book.blocks[3]?.flags).toEqual([]);
  });
});
