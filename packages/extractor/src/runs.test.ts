import type { RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { HEADING_BOLD_SHARE } from "./headings";
import { groupLines } from "./lines";
import { headingRuns, itemRunStyle, paragraphRuns, SUPSUB_MAX_SIZE_RATIO } from "./runs";

const BODY = 12;
const MARGIN = 72;

function item(
  text: string,
  x: number,
  baseline: number,
  extra: Partial<RawTextItem> = {},
): RawTextItem {
  const fontSize = extra.fontSize ?? BODY;
  return {
    text,
    x,
    y: baseline - fontSize,
    width: text.length * fontSize * 0.5,
    height: fontSize,
    fontName: "Helvetica",
    fontSize,
    ...extra,
  };
}

function lineRuns(items: RawTextItem[]) {
  const page: RawPage = { index: 0, width: 612, height: 792, rotation: 0, items };
  return paragraphRuns(groupLines(page));
}

describe("itemRunStyle", () => {
  it("takes bold/italic from the font name", () => {
    const bold = item("word", MARGIN, 100, { fontName: "Helvetica-Bold" });
    const italic = item("word", MARGIN, 100, { fontName: "Helvetica-Oblique" });
    expect(itemRunStyle(bold, BODY, 100)).toMatchObject({ bold: true, italic: false, sup: false });
    expect(itemRunStyle(italic, BODY, 100)).toMatchObject({
      bold: false,
      italic: true,
      sup: false,
    });
  });

  it("marks a small raised item as sup and a small lowered one as sub", () => {
    const body = item("x", MARGIN, 100);
    const sup = item("2", MARGIN + 10, 97, { fontSize: 7 });
    const sub = item("2", MARGIN + 10, 103, { fontSize: 7 });
    expect(itemRunStyle(body, BODY, 100)).toMatchObject({ sup: false, sub: false });
    expect(itemRunStyle(sup, BODY, 100)).toMatchObject({ sup: true, sub: false });
    expect(itemRunStyle(sub, BODY, 100)).toMatchObject({ sup: false, sub: true });
  });

  it("keeps a small item on the body baseline plain (no sup/sub by size alone)", () => {
    const small = item("(1)", MARGIN, 100, { fontSize: 7 });
    expect(itemRunStyle(small, BODY, 100)).toMatchObject({ sup: false, sub: false });
  });

  it("forces every style off when the document comes from an OCR layer", () => {
    const bold = item("word", MARGIN, 100, { fontName: "Helvetica-Bold" });
    expect(itemRunStyle(bold, BODY, 100, false)).toEqual({
      bold: false,
      italic: false,
      sup: false,
      sub: false,
    });
  });

  it("treats a body-size item as never sup/sub even when raised", () => {
    expect(SUPSUB_MAX_SIZE_RATIO).toBeLessThan(1);
    const raised = item("word", MARGIN, 110);
    expect(itemRunStyle(raised, BODY, 100)).toMatchObject({ sup: false, sub: false });
  });
});

describe("paragraphRuns", () => {
  it("keeps a plain paragraph as one run with no flags", () => {
    expect(lineRuns([item("Alpha beta.", MARGIN, 100)])).toEqual([{ text: "Alpha beta." }]);
  });

  it("splits a line into runs at the style change and merges equal neighbors", () => {
    const runs = lineRuns([
      item("Um aviso com ", MARGIN, 100),
      item("destacada", MARGIN + 67.5, 100, { fontName: "Helvetica-Bold" }),
      item(" no meio.", MARGIN + 120, 100),
    ]);
    expect(runs).toEqual([
      { text: "Um aviso com " },
      { text: "destacada", bold: true },
      { text: " no meio." },
    ]);
  });

  it("keeps a style change inside a word without inserting a space (boundary case)", () => {
    const runs = lineRuns([
      item("ca", MARGIN, 100),
      item("fe", MARGIN + 12, 100, { fontName: "Helvetica-Bold" }),
      item("ína", MARGIN + 24, 100),
    ]);
    expect(runs).toEqual([{ text: "ca" }, { text: "fe", bold: true }, { text: "ína" }]);
    expect(runs.map((run) => run.text).join("")).toBe("cafeína");
  });

  it("marks a raised small item as sup inside the line", () => {
    const runs = lineRuns([
      item("x", MARGIN, 100),
      item("2", MARGIN + 6, 97, { fontSize: 7 }),
      item(" + 1", MARGIN + 13, 100),
    ]);
    expect(runs).toEqual([{ text: "x" }, { text: "2", sup: true }, { text: " + 1" }]);
  });

  it("gives an inferred separator space the regular style (golden convention)", () => {
    // The producer split the words by position only: the gap rule inserts the
    // space, and the neutral blank merges with the regular side — never with
    // the bold one.
    const runs = lineRuns([
      item("aviso", MARGIN, 100),
      item("destacado", MARGIN + 40, 100, { fontName: "Helvetica-Bold" }),
      item("seguido", MARGIN + 100, 100),
    ]);
    expect(runs).toEqual([
      { text: "aviso " },
      { text: "destacado", bold: true },
      { text: " seguido" },
    ]);
  });

  it("keeps a pdf.js split-off space neutral even when it inherits the bold font (E4-T01)", () => {
    // pdf.js emits the trailing/leading space of a run as its own item, and
    // the space after a bold run inherits Helvetica-Bold. The golden puts the
    // boundary space on the regular side, so the style of a whitespace-only
    // item must be ignored.
    const runs = lineRuns([
      item("palavra", MARGIN, 100),
      item(" ", MARGIN + 36, 100),
      item("destacada", MARGIN + 39, 100, { fontName: "Helvetica-Bold" }),
      item(" ", MARGIN + 93, 100, { fontName: "Helvetica-Bold" }),
      item("no meio.", MARGIN + 96, 100),
    ]);
    expect(runs).toEqual([
      { text: "palavra " },
      { text: "destacada", bold: true },
      { text: " no meio." },
    ]);
  });

  it("keeps the hyphen decisions of the plain join (E3-T03) across styled lines", () => {
    const runs = lineRuns([
      item("A pala-", MARGIN, 100),
      item("vra con-", MARGIN, 115),
      item("tinua.", MARGIN, 130),
    ]);
    expect(runs.map((run) => run.text).join("")).toBe("A palavra continua.");
    expect(runs).toEqual([{ text: "A palavra continua." }]);
  });

  it("collapses a compound broken at its hyphen across styled lines (backlog 3A)", () => {
    // The reprint of the compound hyphen is dropped, like the plain join.
    const runs = lineRuns([
      item("uma atitude não-", MARGIN, 100),
      item("-teórico, sem dogmas.", MARGIN, 115),
    ]);
    expect(runs.map((run) => run.text).join("")).toBe("uma atitude não-teórico, sem dogmas.");
    expect(runs).toEqual([{ text: "uma atitude não-teórico, sem dogmas." }]);
  });

  it("drops every style when styles are off (OCR text layer, ADR-019)", () => {
    const runs = lineRuns([
      item("Um aviso com ", MARGIN, 100),
      item("destacada", MARGIN + 67.5, 100, { fontName: "Helvetica-Bold" }),
      item(".", MARGIN + 120, 100),
    ]);
    const plain = paragraphRuns(
      groupLines({
        index: 0,
        width: 612,
        height: 792,
        rotation: 0,
        items: [
          item("Um aviso com ", MARGIN, 100),
          item("destacada", MARGIN + 67.5, 100, { fontName: "Helvetica-Bold" }),
          item(".", MARGIN + 120, 100),
        ],
      }),
      { styles: false },
    );
    expect(plain).toEqual([{ text: "Um aviso com destacada." }]);
    expect(runs.some((run) => run.bold === true)).toBe(true);
  });

  it("normalizes run text exactly like the plain join (ligatures, NBSP)", () => {
    const ff = String.fromCharCode(0xfb00);
    const nbsp = String.fromCharCode(0x00a0);
    const runs = lineRuns([item(`e${ff}ect a${nbsp}b`, MARGIN, 100)]);
    expect(runs).toEqual([{ text: "effect a b" }]);
  });
});

describe("headingRuns (E4-T05)", () => {
  it("drops the bold that is the title style and merges the plain neighbors", () => {
    // 9 of the 13 non-space characters are bold: the weight is the heading's
    // own face, and `kind: "heading"` already says so — no run keeps `bold`.
    const runs = headingRuns([{ text: "Bold Title", bold: true }, { text: " tail" }]);
    expect(runs).toEqual([{ text: "Bold Title tail" }]);
  });

  it("strips exactly at HEADING_BOLD_SHARE", () => {
    expect(HEADING_BOLD_SHARE).toBe(0.6);
    // 6 bold characters of 10: the same weight that marks a bold title.
    expect(headingRuns([{ text: "abcdef", bold: true }, { text: "ghij" }])).toEqual([
      { text: "abcdefghij" },
    ]);
  });

  it("counts only non-space characters, so a boundary space never tips the share", () => {
    // 3 bold of 5 non-space characters = 0.6: the trailing space of the bold
    // run (the golden convention of ADR-053) does not vote.
    expect(headingRuns([{ text: "abc ", bold: true }, { text: "de" }])).toEqual([
      { text: "abc de" },
    ]);
  });

  it("keeps word-level bold below the threshold (emphasis of the original text)", () => {
    const runs = [{ text: "Chapter " }, { text: "One", bold: true }];
    expect(headingRuns(runs)).toEqual([{ text: "Chapter " }, { text: "One", bold: true }]);
  });

  it("keeps italic, sup and sub of a title whose bold it stripped", () => {
    expect(
      headingRuns([
        { text: "PART ", bold: true },
        { text: "I", bold: true, italic: true },
      ]),
    ).toEqual([{ text: "PART " }, { text: "I", italic: true }]);
    expect(
      headingRuns([
        { text: "E = mc", bold: true },
        { text: "2", bold: true, sup: true },
      ]),
    ).toEqual([{ text: "E = mc" }, { text: "2", sup: true }]);
  });

  it("never mutates the runs it receives", () => {
    const original = [{ text: "Bold Title", bold: true }];
    headingRuns(original);
    expect(original).toEqual([{ text: "Bold Title", bold: true }]);
  });

  it("keeps plain headings plain", () => {
    expect(headingRuns([{ text: "A quiet title" }])).toEqual([{ text: "A quiet title" }]);
  });
});
