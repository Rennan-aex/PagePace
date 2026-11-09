// E10-T02: tables out of the text lines (layer 4, "semântica").
//
// The gates of the plan (`phases/E10-nontext.md` § "Plano — E10-T02"): rows
// whose cells sit far apart (at least `TABLE_GAP_FACTOR` x the line font,
// never below the body size), `TABLE_MIN_GAPS` of those gaps aligned with the
// previous row's, a gap-less short row (a wrapped label) absorbed into the
// table, prose and dot-leader contents lines kept out, and the paragraphs
// split at the claim so one table reads as one `table` block whose cells go
// to `placeholder.description` as TSV.
import type { RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { groupLines, type TextLine } from "./lines";
import type { JoinedParagraph } from "./pagejoin";
import { detectTables, splitParagraphsAtTables, tableTsv } from "./tables";

const BODY = 12;
const TABLE_SIZE = 10;
const PAGE_WIDTH = 600;
const PAGE_HEIGHT = 800;

/** One item of a line, the way the ingestion delivers it (top-left box). */
function item(
  text: string,
  x: number,
  top: number,
  size: number,
  width?: number,
  fontName = "Helvetica",
): RawTextItem {
  return {
    text,
    x,
    y: top,
    width: width ?? text.length * size * 0.5,
    height: size,
    fontName,
    fontSize: size,
  };
}

function linesOf(items: RawTextItem[]): TextLine[] {
  const page: RawPage = {
    index: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    rotation: 0,
    items,
  };
  return groupLines(page);
}

/** The three cells of one table row at `top`. */
function row(
  top: number,
  cells: readonly { text: string; x: number; width?: number }[],
  size = TABLE_SIZE,
): RawTextItem[] {
  return cells.map((cell) => item(cell.text, cell.x, top, size, cell.width));
}

const HEADER = [
  { text: "Grade", x: 72 },
  { text: "Girls", x: 200 },
  { text: "Boys", x: 330 },
];
const ROW_A = [
  { text: "Elementary", x: 72 },
  { text: "3", x: 200 },
  { text: "2", x: 330 },
];
const ROW_B = [
  { text: "Middle", x: 72 },
  { text: "1", x: 200 },
  { text: "4", x: 330 },
];

describe("detectTables (E10-T02)", () => {
  it("claims a simple table and returns its cells as TSV", () => {
    const lines = linesOf([...row(100, HEADER), ...row(114, ROW_A), ...row(128, ROW_B)]);
    const tables = detectTables([[lines]], { bodyFontSize: BODY });

    expect(tables).toHaveLength(1);
    expect(tables[0]?.lines).toHaveLength(3);
    expect(tables[0]?.cells).toEqual([
      ["Grade", "Girls", "Boys"],
      ["Elementary", "3", "2"],
      ["Middle", "1", "4"],
    ]);
    expect(tables[0]).toBeDefined();
    expect(tables[0] && tableTsv(tables[0])).toBe(
      "Grade\tGirls\tBoys\nElementary\t3\t2\nMiddle\t1\t4",
    );
  });

  it("keeps the prose around the table out of it", () => {
    const lines = linesOf([
      item(
        "The results of the study are shown in the table below this paragraph.",
        72,
        60,
        BODY,
        468,
      ),
      ...row(100, HEADER),
      ...row(114, ROW_A),
      ...row(128, ROW_B),
      item("After the table the text continues normally.", 72, 170, BODY, 400),
    ]);
    const tables = detectTables([[lines]], { bodyFontSize: BODY });

    expect(tables).toHaveLength(1);
    expect(tables[0]?.lines).toHaveLength(3);
    // The claimed rows are the table's font, never the body-sized prose.
    expect(tables[0]?.lines.every((line) => line.fontSize === TABLE_SIZE)).toBe(true);
  });

  it("absorbs a gap-less label row into the table", () => {
    const data = [
      { text: "Framework A", x: 288, width: 40 },
      { text: "0", x: 380 },
      { text: "1", x: 460 },
    ];
    const lines = linesOf([
      ...row(100, data),
      item("(Kong & Lei, 2021)", 94, 114, TABLE_SIZE, 130),
      ...row(128, [
        { text: "Framework B", x: 288, width: 40 },
        { text: "2", x: 380 },
        { text: "3", x: 460 },
      ]),
    ]);
    const tables = detectTables([[lines]], { bodyFontSize: BODY });

    expect(tables).toHaveLength(1);
    expect(tables[0]?.lines).toHaveLength(3);
    expect(tables[0]?.cells).toEqual([
      ["Framework A", "0", "1"],
      ["(Kong & Lei, 2021)", "", ""],
      ["Framework B", "2", "3"],
    ]);
  });

  it("rejects a dot-leader contents line even with aligned gaps", () => {
    const leader = [
      item("Chapter 1 Introduction", 72, 100, BODY, 120),
      item(". . . . . . . . . .", 220, 100, BODY, 200),
      item("1", 470, 100, BODY, 8),
    ];
    const lines = linesOf([...leader, ...leader.map((entry) => ({ ...entry, y: 114 }))]);

    expect(detectTables([[lines]], { bodyFontSize: BODY })).toHaveLength(0);
  });

  it("keeps an aligned equation grid out of the tables", () => {
    const equation = (top: number): RawTextItem[] => [
      item("k", 72, top, TABLE_SIZE, 8),
      item("=", 180, top, TABLE_SIZE, 8),
      item("sqrt", 240, top, TABLE_SIZE, 30),
      item("2", 340, top, TABLE_SIZE, 8),
    ];
    const lines = linesOf([...equation(100), ...equation(114), ...equation(128)]);

    expect(detectTables([[lines]], { bodyFontSize: BODY })).toHaveLength(0);
  });

  it("keeps bracket-only gap rows out of the tables", () => {
    const brackets = (top: number): RawTextItem[] => [
      item("[", 72, top, TABLE_SIZE, 9),
      item("(", 180, top, TABLE_SIZE, 9),
      item(")", 280, top, TABLE_SIZE, 9),
      item("]", 380, top, TABLE_SIZE, 9),
    ];
    const lines = linesOf([...brackets(100), ...brackets(114), ...brackets(128)]);

    expect(detectTables([[lines]], { bodyFontSize: BODY })).toHaveLength(0);
  });

  it("does not claim a chain set in a foreign font family", () => {
    const foreign = (top: number): RawTextItem[] =>
      row(top, HEADER).map((entry) => ({ ...entry, fontName: "DejaVuSans" }));
    const prose: RawTextItem[] = [];
    for (let index = 0; index < 5; index++) {
      const top = 36 + index * 12;
      prose.push(
        item("Body", 72, top, BODY, 24),
        item("words", 100, top, BODY, 26),
        item("of", 130, top, BODY, 16),
        item("the", 150, top, BODY, 20),
        item("document.", 175, top, BODY, 45),
      );
    }
    const lines = linesOf([...prose, ...foreign(100), ...foreign(114), ...foreign(128)]);

    expect(detectTables([[lines]], { bodyFontSize: BODY })).toHaveLength(0);
  });

  it("needs two cell gaps to seed and three lines to claim", () => {
    const oneGap = (top: number): RawTextItem[] => [
      item("Left column", 72, top, TABLE_SIZE, 60),
      item("Right column", 240, top, TABLE_SIZE, 80),
    ];
    // One gap per row: a two-column shape never seeds.
    expect(
      detectTables([[linesOf([...oneGap(100), ...oneGap(114), ...oneGap(128)])]], {
        bodyFontSize: BODY,
      }),
    ).toHaveLength(0);

    // Two rows with aligned gaps are below TABLE_MIN_LINES.
    expect(
      detectTables([[linesOf([...row(100, HEADER), ...row(114, ROW_A)])]], {
        bodyFontSize: BODY,
      }),
    ).toHaveLength(0);
  });
});

describe("splitParagraphsAtTables (E10-T02)", () => {
  it("cuts the paragraph at the claim so the prose keeps its own block", () => {
    const lines = linesOf([
      item("Before the table the paragraph starts here.", 72, 60, BODY, 400),
      ...row(100, HEADER),
      ...row(114, ROW_A),
      ...row(128, ROW_B),
      item("After the table the paragraph ends here.", 72, 170, BODY, 400),
    ]);
    const decisions = detectTables([[lines]], { bodyFontSize: BODY });
    expect(decisions).toHaveLength(1);
    const paragraph: JoinedParagraph = { lines, pageFrom: 0, pageTo: 0 };
    const linePages = new Map(lines.map((line) => [line, 0]));

    const split = splitParagraphsAtTables([paragraph], decisions, linePages);

    expect(split.paragraphs).toHaveLength(3);
    expect(split.paragraphs[0]?.lines).toHaveLength(1);
    expect(split.paragraphs[1]?.lines).toHaveLength(3);
    expect(split.paragraphs[2]?.lines).toHaveLength(1);
    expect(split.tables[0]).toBeUndefined();
    expect(split.tables[1]).toBe(decisions[0]);
    expect(split.tables[2]).toBeUndefined();
  });

  it("keeps an untouched paragraph and its pages as they were", () => {
    const lines = linesOf([item("Just prose.", 72, 60, BODY, 120)]);
    const paragraph: JoinedParagraph = { lines, pageFrom: 3, pageTo: 4 };
    const linePages = new Map(lines.map((line) => [line, 3]));

    const split = splitParagraphsAtTables([paragraph], [], linePages);

    expect(split.paragraphs).toEqual([paragraph]);
    expect(split.paragraphs[0]).toBe(paragraph);
    expect(split.tables).toEqual([undefined]);
  });
});
