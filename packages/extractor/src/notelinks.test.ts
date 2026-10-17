// E5-T02: footnote calls (layer 4, "semântica"). Every rule of
// `linkFootnoteCalls` gets a case — match by (page, label), bracketed and
// symbolic labels, the two orphan flags with their page-has-notes guard, the
// duplicate label, the markerless note — plus the buildBook wiring: the call
// run gets `noteRef`, the note gets `anchor`, orphans floor the confidence,
// a note continuing on the next page is linked like any other and an OCR
// layer never gets the pass.
import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { BOOK_BLOCK_CONFIDENCE, buildBook, OCR_TEXT_LAYER_CONFIDENCE } from "./book";
import {
  CALL_WITHOUT_NOTE_FLAG,
  callLabel,
  linkFootnoteCalls,
  NOTE_CALL_TEXT,
  NOTE_LINK_UNCERTAIN_CONFIDENCE,
  NOTE_WITHOUT_CALL_FLAG,
  type NoteCallBlock,
  noteMarkerLabel,
} from "./notelinks";

const BODY = 11;
const NOTE = 9;
const LEADING = 15;
const NOTE_LEADING = 12;
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

function doc(pages: RawPage[], ocr = false): RawDocument {
  return {
    schemaVersion: "1.2.0",
    source: {
      fileName: "book.pdf",
      sha256: "a".repeat(64),
      pageCount: pages.length,
      tagged: false,
      ...(ocr ? { ocrTextLayer: true } : {}),
    },
    pages,
    ingest: { adapter: "pdfjs", adapterVersion: "test" },
  };
}

const bodyAt = (baseline: number): RawTextItem[] =>
  lines(
    [
      "01234567890123456789012345678901234567890123456789",
      "01234567890123456789012345678901234567890123456789",
      "01234567890123456789012345678901234567890123456789",
    ],
    baseline,
  );

const noteAt = (baseline: number, texts: readonly string[]): RawTextItem[] =>
  lines(texts, baseline, NOTE, NOTE_LEADING);

/** A body line closed by a superscript call `1` (8pt, baseline 3pt above). */
const CALL_TEXT = "The witness may be the only honest one.";
const callLine = (): RawTextItem[] => [
  item(CALL_TEXT, MARGIN, 400, BODY),
  // Raw pages use the pdf.js viewport coordinates (y grows downward), so a
  // raised baseline is a SMALLER `y` — the probe of E5-T02 confirmed the
  // extractor reads that back as `sup`.
  item("1", MARGIN + CALL_TEXT.length * BODY * 0.5, 397, 8),
];

/** A note block for the unit tests: digits get a punctuated marker. */
function noteBlock(id: string, pageFrom: number, label: string): NoteCallBlock {
  const marker = /^\d+$/.test(label) ? `${label}.` : label;
  return {
    id,
    kind: "footnote",
    pageFrom,
    pageTo: pageFrom,
    runs: [{ text: `${marker} A note that explains the line.` }],
  };
}

/** A calling paragraph for the unit tests: run 0 is text, then the calls. */
function callBlock(id: string, pageFrom: number, calls: readonly string[]): NoteCallBlock {
  return {
    id,
    kind: "paragraph",
    pageFrom,
    pageTo: pageFrom,
    runs: [{ text: "The witness hesitates." }, ...calls.map((text) => ({ text, sup: true }))],
  };
}

describe("note and call labels", () => {
  it("reads every marker shape a note opens with", () => {
    expect(noteMarkerLabel("1. A note")).toBe("1");
    expect(noteMarkerLabel("1 A note")).toBe("1");
    expect(noteMarkerLabel("(2) A note")).toBe("2");
    expect(noteMarkerLabel("[3] A note")).toBe("3");
    expect(noteMarkerLabel("* A note")).toBe("*");
    expect(noteMarkerLabel("†† A note")).toBe("††");
    expect(noteMarkerLabel("A note without marker")).toBeNull();
  });

  it("accepts only call shapes as superscript calls", () => {
    expect(callLabel("1")).toBe("1");
    expect(callLabel("(1)")).toBe("1");
    expect(callLabel("[4]")).toBe("4");
    expect(callLabel("*")).toBe("*");
    expect(callLabel("st")).toBeNull();
    expect(callLabel("1234")).toBeNull();
    expect(callLabel("2.5")).toBeNull();
    expect(NOTE_CALL_TEXT.test("x2")).toBe(false);
  });

  it("keeps the named constants", () => {
    expect(NOTE_WITHOUT_CALL_FLAG).toBe("note-without-call");
    expect(CALL_WITHOUT_NOTE_FLAG).toBe("call-without-note");
    expect(NOTE_LINK_UNCERTAIN_CONFIDENCE).toBe(0.7);
  });
});

describe("linkFootnoteCalls", () => {
  it("links a call to the note of its page and anchors the note at it", () => {
    const decisions = linkFootnoteCalls([callBlock("c1", 0, ["1"]), noteBlock("n1", 0, "1")]);
    expect(decisions[0]?.noteRefs.get(1)).toBe("n1");
    expect(decisions[0]?.orphanCall).toBe(false);
    expect(decisions[0]?.withoutCall).toBe(false);
    expect(decisions[1]?.anchor).toEqual({ blockId: "c1", runIndex: 1, offset: 0, label: "1" });
    expect(decisions[1]?.withoutCall).toBe(false);
  });

  it("accepts every bracketed and symbolic call shape", () => {
    for (const [call, label] of [
      ["(2)", "2"],
      ["[3]", "3"],
      ["*", "*"],
      ["†", "†"],
    ] as const) {
      const decisions = linkFootnoteCalls([callBlock("c1", 0, [call]), noteBlock("n1", 0, label)]);
      expect([call, decisions[0]?.noteRefs.get(1)]).toEqual([call, "n1"]);
    }
  });

  it("never matches a label across pages", () => {
    const decisions = linkFootnoteCalls([callBlock("c1", 0, ["1"]), noteBlock("n1", 1, "1")]);
    expect(decisions[0]?.noteRefs.size).toBe(0);
    // Page one has no notes at all: the call proves nothing, no flag.
    expect(decisions[0]?.orphanCall).toBe(false);
    expect(decisions[1]?.withoutCall).toBe(true);
  });

  it("flags a call whose label matches no note of a page that has notes", () => {
    const decisions = linkFootnoteCalls([callBlock("c1", 0, ["2"]), noteBlock("n1", 0, "1")]);
    expect(decisions[0]?.orphanCall).toBe(true);
    expect(decisions[1]?.withoutCall).toBe(true);
  });

  it("leaves a superscript alone on a page without notes", () => {
    // An exponent or an ordinal is only a call where notes live.
    const decisions = linkFootnoteCalls([
      {
        id: "c1",
        kind: "paragraph",
        pageFrom: 0,
        pageTo: 0,
        runs: [{ text: "x" }, { text: "2", sup: true }],
      },
    ]);
    expect(decisions[0]?.orphanCall).toBe(false);
    expect(decisions[0]?.noteRefs.size).toBe(0);
  });

  it("links both calls of a label to the first note and flags the twin", () => {
    const decisions = linkFootnoteCalls([
      callBlock("c1", 0, ["1", "1"]),
      noteBlock("n1", 0, "1"),
      noteBlock("n2", 0, "1"),
    ]);
    expect(decisions[0]?.noteRefs.get(1)).toBe("n1");
    expect(decisions[0]?.noteRefs.get(2)).toBe("n1");
    expect(decisions[1]?.anchor).toEqual({ blockId: "c1", runIndex: 1, offset: 0, label: "1" });
    expect(decisions[2]?.withoutCall).toBe(true);
  });

  it("leaves a note without a parseable marker alone", () => {
    // The rule-only uncertain note has nothing its call could repeat.
    const decisions = linkFootnoteCalls([
      callBlock("c1", 0, ["1"]),
      {
        id: "n1",
        kind: "footnote",
        pageFrom: 0,
        pageTo: 0,
        runs: [{ text: "A note the rule announces." }],
      },
    ]);
    expect(decisions[0]?.noteRefs.size).toBe(0);
    expect(decisions[1]?.withoutCall).toBe(false);
  });

  it("follows a call into the pages its block spans", () => {
    const decisions = linkFootnoteCalls([
      {
        id: "c1",
        kind: "paragraph",
        pageFrom: 0,
        pageTo: 1,
        runs: [{ text: "A call at the foot" }, { text: "1", sup: true }],
      },
      noteBlock("n1", 1, "1"),
    ]);
    expect(decisions[0]?.noteRefs.get(1)).toBe("n1");
  });
});

describe("buildBook with footnote calls (E5-T02)", () => {
  it("links the call run and anchors the note at it", () => {
    const book = buildBook(
      doc([page([...bodyAt(100), ...callLine(), ...noteAt(700, ["1. A note that explains."])])]),
    );
    expect(book.blocks.map((block) => block.kind)).toEqual(["paragraph", "paragraph", "footnote"]);
    const paragraph = book.blocks[1];
    const note = book.blocks[2];
    const callIndex = paragraph?.runs.findIndex((run) => run.sup === true) ?? -1;
    const callRun = paragraph?.runs[callIndex];
    expect(callRun?.text).toBe("1");
    expect(callRun?.noteRef).toBe(note?.id);
    expect(note?.anchor).toEqual({
      blockId: paragraph?.id,
      runIndex: callIndex,
      offset: 0,
      label: "1",
    });
    expect(paragraph?.flags).toEqual([]);
    expect(note?.flags).toEqual([]);
    expect(paragraph?.confidence).toBe(BOOK_BLOCK_CONFIDENCE);
    expect(note?.confidence).toBe(BOOK_BLOCK_CONFIDENCE);
    expect(book.extraction.avgConfidence).toBe(BOOK_BLOCK_CONFIDENCE);
  });

  it("flags both orphans and floors their confidence", () => {
    const book = buildBook(
      doc([page([...bodyAt(100), ...callLine(), ...noteAt(700, ["2. Another note."])])]),
    );
    const paragraph = book.blocks[1];
    const note = book.blocks[2];
    expect(paragraph?.flags).toEqual([CALL_WITHOUT_NOTE_FLAG]);
    expect(paragraph?.confidence).toBe(NOTE_LINK_UNCERTAIN_CONFIDENCE);
    expect(note?.flags).toEqual([NOTE_WITHOUT_CALL_FLAG]);
    expect(note?.confidence).toBe(NOTE_LINK_UNCERTAIN_CONFIDENCE);
    expect(note?.anchor).toBeUndefined();
    expect(book.extraction.avgConfidence).toBeLessThan(BOOK_BLOCK_CONFIDENCE);
  });

  it("links a note that continues on the next page", () => {
    const book = buildBook(
      doc([
        page([...bodyAt(100), ...callLine(), ...noteAt(700, ["1. A note that runs"])]),
        page([...noteAt(100, ["onto the next page without a stop."])], 1),
      ]),
    );
    const note = book.blocks.find((block) => block.kind === "footnote");
    expect(note?.origin).toEqual({ pageFrom: 0, pageTo: 1 });
    const call = book.blocks.find((block) => block.runs.some((run) => run.noteRef !== undefined));
    expect(call?.runs.find((run) => run.noteRef !== undefined)?.noteRef).toBe(note?.id);
    expect(note?.flags).toEqual([]);
    expect(note?.anchor?.label).toBe("1");
  });

  it("keeps an OCR text layer out of the linking pass", () => {
    // Without `Run.sup` the pass could only invent flags, so it never runs.
    const book = buildBook(
      doc(
        [page([...bodyAt(100), ...callLine(), ...noteAt(700, ["1. A note that explains."])])],
        true,
      ),
    );
    const note = book.blocks.find((block) => block.kind === "footnote");
    expect(note?.flags).toEqual([]);
    expect(book.blocks.every((block) => block.confidence === OCR_TEXT_LAYER_CONFIDENCE)).toBe(true);
  });
});
