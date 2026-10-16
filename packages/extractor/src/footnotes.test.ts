// E5-T01: footnotes and their markers (layer 4, "semântica"). Every signal of
// `detectFootnotes` gets a case here — region, size, marker (punctuated,
// symbolic and bare), rule — plus the exclusions that keep body text out (body
// size, middle of the page, bare page number, data rows that only look like a
// number, running feet that repeat across pages, a paragraph that crosses
// pages) and the two numbering restarts the acceptance asks for: by page and
// by chapter.
import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { BOOK_BLOCK_CONFIDENCE, buildBook } from "./book";
import {
  detectFootnotes,
  FOOTNOTE_BARE_MARKER,
  FOOTNOTE_FURNITURE_BASELINE_TOLERANCE,
  FOOTNOTE_FURNITURE_MIN_PAGES,
  FOOTNOTE_MARKER,
  FOOTNOTE_MAX_SIZE_FACTOR,
  FOOTNOTE_PROSE_MIN_LETTERS,
  FOOTNOTE_REGION_TOP_SHARE,
  FOOTNOTE_UNCERTAIN_CONFIDENCE,
  type FootnoteDecision,
  UNCERTAIN_FOOTNOTE_FLAG,
} from "./footnotes";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import { documentStats } from "./stats";

const BODY = 11;
const NOTE = 9;
const LEADING = 15;
const NOTE_LEADING = 12;
const MARGIN = 72;
/** Body size below which a note can be set (`FOOTNOTE_MAX_SIZE_FACTOR` · body). */
const SMALLER_THAN_BODY = BODY * FOOTNOTE_MAX_SIZE_FACTOR;

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

/** A block of lines, the first one on `baseline`, `leading` apart. */
function lines(
  texts: readonly string[],
  baseline: number,
  size = BODY,
  leading = LEADING,
): RawTextItem[] {
  return texts.map((text, index) => item(text, MARGIN, baseline + index * leading, size));
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

/** A note: smaller type, tight leading, at `baseline`. */
const noteAt = (baseline: number, texts: readonly string[]): RawTextItem[] =>
  lines(texts, baseline, NOTE, NOTE_LEADING);

/** The decisions `buildBook` would make for these pages. */
function decisionsOf(pages: RawPage[]): FootnoteDecision[] {
  const document = doc(pages);
  const stats = documentStats(document);
  const grouped = groupDocumentParagraphs(document);
  return detectFootnotes(
    joinCrossPageParagraphs(grouped, stats.bodyFontSize),
    grouped.map((pageLines) => pageLines.flat()),
    { bodyFontSize: stats.bodyFontSize },
  );
}

describe("detectFootnotes", () => {
  it("finds a numbered note in the bottom region, in a font smaller than the body", () => {
    const decisions = decisionsOf([
      page([...bodyAt(100), ...noteAt(700, ["1. A note that explains the line above it."])]),
    ]);
    expect(decisions.map((decision) => decision.footnote)).toEqual([false, true]);
    expect(decisions[1]?.uncertain).toBe(false);
  });

  it("keeps a numbered line set in the body size as a paragraph", () => {
    const decisions = decisionsOf([
      page([...bodyAt(100), ...lines(["2. A numbered line in the body size."], 700, BODY)]),
    ]);
    expect(decisions.map((decision) => decision.footnote)).toEqual([false, false]);
    expect(BODY).not.toBeLessThan(SMALLER_THAN_BODY);
  });

  it("keeps a small-font marked line in the middle of the page as a paragraph", () => {
    // The body runs past the middle line, so the page's own text block puts
    // the line above `FOOTNOTE_REGION_TOP_SHARE` of the page.
    const decisions = decisionsOf([
      page([
        ...bodyAt(100),
        ...lines(["1. A marked line that is not at the foot."], 250, NOTE),
        ...bodyAt(430),
      ]),
    ]);
    expect(decisions.map((decision) => decision.footnote)).toEqual([false, false, false]);
  });

  it("keeps a small-font line at the foot without marker or rule as a paragraph", () => {
    const decisions = decisionsOf([
      page([...bodyAt(100), ...noteAt(700, ["Smaller type, no marker at all."])]),
    ]);
    expect(decisions.map((decision) => decision.footnote)).toEqual([false, false]);
  });

  it("keeps a bare page number at the foot as a paragraph", () => {
    const decisions = decisionsOf([page([...bodyAt(100), ...noteAt(700, ["4"])])]);
    expect(decisions.map((decision) => decision.footnote)).toEqual([false, false]);
  });

  it("accepts every marker shape a note opens with", () => {
    for (const marker of [
      "1. First note.",
      "12) Twelfth note.",
      "(3) Third note.",
      "[4] Fourth note.",
    ]) {
      const decisions = decisionsOf([page([...bodyAt(100), ...noteAt(700, [marker])])]);
      expect([marker, decisions[1]?.footnote]).toEqual([marker, true]);
    }
    for (const marker of ["* Star note.", "†† Dagger note.", "§ Section note."]) {
      const decisions = decisionsOf([page([...bodyAt(100), ...noteAt(700, [marker])])]);
      expect([marker, decisions[1]?.footnote]).toEqual([marker, true]);
    }
  });

  it("finds a note whose number opens the line without punctuation (SciELO style)", () => {
    const decisions = decisionsOf([
      page([...bodyAt(100), ...noteAt(700, ["1 A note that opens with a bare number."])]),
    ]);
    expect(decisions.map((decision) => decision.footnote)).toEqual([false, true]);
    expect(decisions[1]?.uncertain).toBe(false);
  });

  it("keeps a bare number followed by data, not prose, as a paragraph", () => {
    // Table rows and coordinate fragments start with a number too: a marker
    // has to announce prose.
    for (const line of ["10 2 10 2 CDM15 CDM60", "5 14 41 25 85", "0 0"]) {
      const decisions = decisionsOf([page([...bodyAt(100), ...noteAt(700, [line])])]);
      expect([line, decisions[1]?.footnote]).toEqual([line, false]);
    }
  });

  it("keeps a bare number opening a printed label as a paragraph", () => {
    // The chapter name typeset in the page foot has a number and words, but
    // they are set in capitals: a label, not a note.
    for (const line of ["2 INTRODUCTION", "74 ABOUT THE CONTRIBUTORS"]) {
      const decisions = decisionsOf([page([...bodyAt(100), ...noteAt(700, [line])])]);
      expect([line, decisions[1]?.footnote]).toEqual([line, false]);
    }
  });

  it("keeps a running footer that repeats on many pages as a paragraph", () => {
    // The digits-hidden text of the footer is the same on three pages at the
    // same baseline: page furniture, never a note — even though it opens with
    // a bare number and is set smaller than the body.
    const decisions = decisionsOf(
      [0, 1, 2].map((index) =>
        page([...bodyAt(100), ...noteAt(700, [`${index + 2} RUNNING HEAD OF A CHAPTER.`])], index),
      ),
    );
    expect(decisions.map((decision) => decision.footnote)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("still finds a repeated note whose lines sit at different heights", () => {
    // The same words on three pages, but a note follows the body of each
    // page, so its baseline moves with it: text, not furniture.
    const decisions = decisionsOf([
      page([...bodyAt(100), ...noteAt(700, ["2 See also the appendix."])]),
      page([...bodyAt(100), ...bodyAt(180), ...noteAt(640, ["2 See also the appendix."])], 1),
      page([...bodyAt(100), ...noteAt(700, ["2 See also the appendix."])], 2),
    ]);
    expect(decisions.map((decision) => decision.footnote)).toEqual([
      false,
      true,
      false,
      false,
      true,
      false,
      true,
    ]);
  });

  it("never reads a date or a section number as a marker", () => {
    expect(FOOTNOTE_MARKER.test("1998 the year everything changed")).toBe(false);
    expect(FOOTNOTE_MARKER.test("1.2 The method")).toBe(false);
    expect(FOOTNOTE_MARKER.test("1. The method")).toBe(true);
  });

  it("reads a bare number as a marker only before a space", () => {
    expect(FOOTNOTE_BARE_MARKER.test("1 A note that explains the line")).toBe(true);
    expect(FOOTNOTE_BARE_MARKER.test("1998 the year everything changed")).toBe(false);
    expect(FOOTNOTE_BARE_MARKER.test("1.2 The method")).toBe(false);
    expect(FOOTNOTE_BARE_MARKER.test("4")).toBe(false);
  });

  it("accepts a note opened by the rule itself, without a marker (uncertain)", () => {
    // The rule grouped with the note: it is the paragraph's first line and
    // the marker the rule announces sits on the line right after it.
    const decisions = decisionsOf([
      page([
        ...bodyAt(100),
        ...noteAt(685, ["----"]),
        ...noteAt(700, ["A note the rule announces."]),
      ]),
    ]);
    expect(decisions.map((decision) => decision.footnote)).toEqual([false, true]);
    expect(decisions[1]?.uncertain).toBe(true);
  });

  it("accepts a note separated from the body by a rule of its own paragraph", () => {
    // Here the rule is a paragraph too small to be a note (no line to read
    // after it), and the note below is found by the rule above it.
    const decisions = decisionsOf([
      page([...bodyAt(100), ...noteAt(660, ["____"]), ...noteAt(700, ["A note under the rule."])]),
    ]);
    expect(decisions.map((decision) => decision.footnote)).toEqual([false, false, true]);
    expect(decisions[2]?.uncertain).toBe(true);
  });

  it("keeps a paragraph that crosses pages as body text (the join is E3-T04)", () => {
    const decisions = decisionsOf([
      page([...bodyAt(100), ...noteAt(700, ["1. A note that runs"])]),
      page([item("onto the next page without a stop.", MARGIN, 100, BODY)], 1),
    ]);
    expect(decisions.map((decision) => decision.footnote)).toEqual([false, false]);
  });

  it("finds notes whose numbering restarts on every page", () => {
    const decisions = decisionsOf([
      page([
        ...bodyAt(100),
        ...noteAt(700, ["1. First note of page one."]),
        ...noteAt(725, ["2. Second note of page one."]),
      ]),
      page([...bodyAt(100), ...noteAt(700, ["1. First note of page two."])], 1),
    ]);
    // Page two starts again at 1 — the decisions never compare neighbours.
    expect(decisions.map((decision) => decision.footnote)).toEqual([
      false,
      true,
      true,
      false,
      true,
    ]);
  });

  it("finds notes whose numbering restarts at each chapter", () => {
    const decisions = decisionsOf([
      page([...bodyAt(100), ...noteAt(700, ["1. A note of the first chapter."])]),
      page(
        [
          ...lines(["Chapter Two"], 100, 18),
          ...bodyAt(140),
          ...noteAt(700, ["1. A note of the second chapter, numbered from one."]),
        ],
        1,
      ),
    ]);
    expect(decisions.map((decision) => decision.footnote)).toEqual([
      false,
      true,
      false,
      false,
      true,
    ]);
  });

  it("keeps the named constants", () => {
    expect(FOOTNOTE_REGION_TOP_SHARE).toBe(0.5);
    expect(FOOTNOTE_MAX_SIZE_FACTOR).toBe(0.95);
    expect(FOOTNOTE_PROSE_MIN_LETTERS).toBe(4);
    expect(FOOTNOTE_FURNITURE_MIN_PAGES).toBe(3);
    expect(FOOTNOTE_FURNITURE_BASELINE_TOLERANCE).toBe(3);
    expect(FOOTNOTE_UNCERTAIN_CONFIDENCE).toBe(0.7);
    expect(UNCERTAIN_FOOTNOTE_FLAG).toBe("uncertain-footnote");
  });
});

describe("buildBook with footnotes (E5-T01)", () => {
  it("emits the note as a footnote block with its origin", () => {
    const book = buildBook(
      doc([page([...bodyAt(100), ...noteAt(700, ["1. A note that explains the line above."])])]),
    );
    expect(book.blocks.map((block) => block.kind)).toEqual(["paragraph", "footnote"]);
    const note = book.blocks[1];
    expect(note?.origin).toEqual({ pageFrom: 0, pageTo: 0 });
    expect(note?.runs.map((run) => run.text)).toEqual(["1. A note that explains the line above."]);
    expect(note?.flags).toEqual([]);
    expect(note?.confidence).toBe(BOOK_BLOCK_CONFIDENCE);
    expect(book.extraction.avgConfidence).toBe(BOOK_BLOCK_CONFIDENCE);
  });

  it("flags a note accepted by the rule alone and lowers its confidence", () => {
    const book = buildBook(
      doc([
        page([
          ...bodyAt(100),
          ...noteAt(685, ["----"]),
          ...noteAt(700, ["A note the rule announces alone."]),
        ]),
      ]),
    );
    const note = book.blocks.find((block) => block.kind === "footnote");
    expect(note?.flags).toEqual([UNCERTAIN_FOOTNOTE_FLAG]);
    expect(note?.confidence).toBe(FOOTNOTE_UNCERTAIN_CONFIDENCE);
    expect(note?.origin).toEqual({ pageFrom: 0, pageTo: 0 });
    expect(book.extraction.avgConfidence).toBeLessThan(BOOK_BLOCK_CONFIDENCE);
  });
});
