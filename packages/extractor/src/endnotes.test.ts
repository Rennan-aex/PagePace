// E5-T03: endnotes (layer 4, "semântica"). Every signal of `detectEndnotes`
// gets a case here — the section title (exact match, blind to case and to a
// trailing colon, en/pt lexicon), the marker-led run (punctuated and bare) —
// plus the two guards that keep the run inside the section (a paragraph that
// does not open with a marker, a paragraph the heading pass claims). The
// buildBook round trip uses notes set in the BODY size, which is exactly what
// the foot-region pass (`detectFootnotes`) rejects, so the section is the only
// thing that can turn them into `footnote` blocks linked to the calls.
import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildBook } from "./book";
import { detectEndnotes, ENDNOTE_SECTION_TITLES, type EndnoteDecision } from "./endnotes";
import { detectFootnotes, opensWithNoteMarker } from "./footnotes";
import { detectHeadings, pageMeasureOf } from "./headings";
import { NOTE_WITHOUT_CALL_FLAG } from "./notelinks";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import { documentStats } from "./stats";

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

/** A block of lines, the first one on `baseline`, `leading` apart. */
function lines(
  texts: readonly string[],
  baseline: number,
  size = BODY,
  leading = LEADING,
): RawTextItem[] {
  return texts.map((text, index) => item(text, MARGIN, baseline + index * leading, size));
}

/** A body line ending in a superscript call: the text, then the raised label. */
function callLine(baseline: number, text: string, label: string): RawTextItem[] {
  const sup = item(label, MARGIN + text.length * BODY * 0.5 + 4, baseline - 3, 8);
  return [item(text, MARGIN, baseline, BODY), sup];
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

/** Paragraphs, heading decisions and page lines of these pages, measured once. */
function layoutOf(pages: RawPage[]) {
  const document = doc(pages);
  const stats = documentStats(document);
  const grouped = groupDocumentParagraphs(document);
  const paragraphs = joinCrossPageParagraphs(grouped, stats.bodyFontSize);
  const pageMeasures = grouped.map((pageLines) => pageMeasureOf(pageLines.flat()));
  const headings = detectHeadings(paragraphs, {
    bodyFontSize: stats.bodyFontSize,
    lineHeight: stats.lineHeight,
    measures: paragraphs.map(
      (paragraph) => pageMeasures[paragraph.pageFrom] ?? { left: 0, right: 0, width: 0 },
    ),
  });
  return { document, stats, paragraphs, headings, pageLines: grouped.map((page) => page.flat()) };
}

/** The decisions `buildBook` would make for these pages. */
function decisionsOf(pages: RawPage[]): EndnoteDecision[] {
  const { paragraphs, headings } = layoutOf(pages);
  return detectEndnotes(paragraphs, { headings });
}

/** A page with body text, a section title and two notes in the BODY size. */
function sectionPage(title = "Notes"): RawPage {
  return page([
    ...bodyAt(100),
    ...lines([title], 170),
    ...lines(
      [
        "1. The window note explains the line that carries the call",
        "and keeps the wording it had in the lecture.",
      ],
      210,
    ),
    ...lines(
      [
        "2. The second note points at the room described above",
        "without adding anything new to it.",
      ],
      250,
    ),
  ]);
}

describe("detectEndnotes", () => {
  it("marks the marker-led paragraphs that follow a section title", () => {
    const decisions = decisionsOf([sectionPage()]);
    expect(decisions.map((decision) => decision.endnote)).toEqual([false, false, true, true]);
  });

  it("marks the bare-number style of the SciELO notes", () => {
    const decisions = decisionsOf([
      page([
        ...bodyAt(100),
        ...lines(["Notes"], 170),
        ...lines(
          [
            "1 A note that begins with a bare number and prose after",
            "it, the way the journals set their notes.",
          ],
          210,
        ),
        ...lines(["2 The second note of the section follows the same rule."], 250),
      ]),
    ]);
    expect(decisions.map((decision) => decision.endnote)).toEqual([false, false, true, true]);
  });

  it("matches the title blind to case and to a trailing colon", () => {
    const decisions = decisionsOf([sectionPage("NOTES:")]);
    expect(decisions.filter((decision) => decision.endnote)).toHaveLength(2);
  });

  it("keeps the Portuguese titles of the lexicon", () => {
    const decisions = decisionsOf([sectionPage("Notas de rodapé")]);
    expect(decisions.filter((decision) => decision.endnote)).toHaveLength(2);
  });

  it("marks nothing when the document has no section title", () => {
    const decisions = decisionsOf([sectionPage("A transitional line of the chapter")]);
    expect(decisions.map((decision) => decision.endnote)).toEqual([false, false, false, false]);
  });

  it("needs the whole title: a heading that merely starts with the word is not it", () => {
    const decisions = decisionsOf([sectionPage("Notes on Light")]);
    expect(decisions.map((decision) => decision.endnote)).toEqual([false, false, false, false]);
  });

  it("stops at the first paragraph that does not open with a marker", () => {
    const decisions = decisionsOf([
      page([
        ...bodyAt(100),
        ...lines(["Notes"], 170),
        ...lines(["1. A note that opens the section."], 210),
        ...lines(["A plain paragraph of prose ends the section."], 250),
        ...lines(["2. A numbered line the section no longer owns."], 290),
      ]),
    ]);
    expect(decisions.map((decision) => decision.endnote)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it("never marks a heading, even one that opens with a marker", () => {
    const decisions = decisionsOf([
      page([
        ...bodyAt(100),
        ...lines(["Notes"], 170),
        // Body size would read as a note; the 18 pt type claims it as a title.
        ...lines(["1. Introduction"], 210, 18),
        ...lines(["1. A note that follows the new chapter."], 250),
      ]),
    ]);
    expect(decisions.map((decision) => decision.endnote)).toEqual([false, false, false, false]);
  });

  it("finds what the foot-region pass rejects: body-sized notes", () => {
    const { stats, paragraphs, headings, pageLines } = layoutOf([sectionPage()]);
    const endnotes = detectEndnotes(paragraphs, { headings });
    const footnotes = detectFootnotes(paragraphs, pageLines, { bodyFontSize: stats.bodyFontSize });
    expect(endnotes.map((decision) => decision.endnote)).toEqual([false, false, true, true]);
    expect(footnotes.map((decision) => decision.footnote)).toEqual([false, false, false, false]);
  });

  it("keeps the named constants", () => {
    expect([...ENDNOTE_SECTION_TITLES]).toEqual(["notes", "endnotes", "notas", "notas de rodapé"]);
    expect(opensWithNoteMarker("1. A punctuated marker.")).toBe(true);
    expect(opensWithNoteMarker("(2) A bracketed marker.")).toBe(true);
    expect(opensWithNoteMarker("1 A bare marker with prose.")).toBe(true);
    expect(opensWithNoteMarker("2 INTRODUCTION")).toBe(false);
    expect(opensWithNoteMarker("10 2 10 2 CDM15")).toBe(false);
    expect(opensWithNoteMarker("Plain prose of the section.")).toBe(false);
  });
});

describe("buildBook with endnotes (E5-T03)", () => {
  it("emits the section notes as footnote blocks linked to their calls", () => {
    const book = buildBook(
      doc([
        page([
          ...callLine(100, "The claim of the chapter is stated once", "1"),
          item("and never again in the pages that follow here.", MARGIN, 115, BODY),
          ...callLine(145, "The second paragraph closes the page with", "2"),
          item("a line that continues after the call and stops here.", MARGIN, 160, BODY),
          item("Nothing else follows it on this page of the book.", MARGIN, 175, BODY),
        ]),
        page([
          ...lines(["Notes"], 100),
          ...lines(
            [
              "1. The window note explains the line that carries the call",
              "and keeps the wording it had in the lecture.",
            ],
            140,
          ),
          ...lines(
            [
              "2. The second note points at the room described above",
              "without adding anything new to it.",
            ],
            180,
          ),
        ]),
      ]),
    );

    expect(book.blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "paragraph",
      "heading",
      "footnote",
      "footnote",
    ]);

    const firstNote = book.blocks[3];
    const secondNote = book.blocks[4];
    expect(firstNote?.origin).toMatchObject({ pageFrom: 1, pageTo: 1 });
    expect(secondNote?.origin).toMatchObject({ pageFrom: 1, pageTo: 1 });

    // E5-T02 contract on the endnotes: `noteRef` on the call, `anchor` back
    // on the note, and no orphan flag on either side.
    const firstCall = book.blocks[0]?.runs.find((run) => run.noteRef !== undefined);
    const secondCall = book.blocks[1]?.runs.find((run) => run.noteRef !== undefined);
    expect(firstCall?.noteRef).toBe(firstNote?.id);
    expect(secondCall?.noteRef).toBe(secondNote?.id);
    expect(firstNote?.anchor?.label).toBe("1");
    expect(firstNote?.anchor?.blockId).toBe(book.blocks[0]?.id);
    expect(secondNote?.anchor?.label).toBe("2");
    expect(firstNote?.flags).toEqual([]);
    expect(secondNote?.flags).toEqual([]);
  });

  it("flags the endnote nobody called and floors its confidence", () => {
    const book = buildBook(
      doc([
        page([
          ...callLine(100, "One call of the chapter, but only one", "1"),
          item("and nothing else in the pages that follow.", MARGIN, 115, BODY),
          ...lines(["The rest of the page is ordinary body text."], 145),
        ]),
        page([
          ...lines(["Notes"], 100),
          ...lines(["1. The called note of the section."], 140),
          ...lines(["2. The note of the section nobody called."], 180),
        ]),
      ]),
    );

    const notes = book.blocks.filter((block) => block.kind === "footnote");
    expect(notes).toHaveLength(2);
    expect(notes[0]?.flags).toEqual([]);
    expect(notes[0]?.anchor?.label).toBe("1");
    expect(notes[1]?.flags).toEqual([NOTE_WITHOUT_CALL_FLAG]);
    expect(notes[1]?.anchor).toBeUndefined();
  });
});
