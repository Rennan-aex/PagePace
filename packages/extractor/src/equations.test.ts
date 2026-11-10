// E10-T03: equations out of the text lines (layer 4, "semântica").
//
// The gates of the plan (`phases/E10-nontext.md` § "Plano — E10-T03"): a line
// reads as math when its characters sit in a math font
// (`EQUATION_MATH_FONT_SHARE`), or its symbols are dense enough
// (`EQUATION_SYMBOL_DENSITY`), or the typesetter printed its equation number
// beside a relation; on top of that it must hold a relation or be short
// (`EQUATION_SHORT_WORDS`), carry at least one math symbol (the by-line
// affiliation superscripts of CMMI stay prose) and never trail off into a
// word of prose (`PROSE_TAIL`). A line too poor to pass on its own but
// carrying the ink of math and no word of prose rides along with the
// candidates of its paragraph, a line of running text parts the runs, tables
// claim first, and consecutive runs of one page and band chain into a single
// decision (`EQUATION_LINK_GAP_FACTOR` x the body apart).
import type { RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { claimsByLine, splitParagraphsAtClaims } from "./claims";
import { detectEquations, equationText } from "./equations";
import { groupLines, type TextLine } from "./lines";
import type { JoinedParagraph } from "./pagejoin";

const BODY = 12;
const PAGE_WIDTH = 600;
const PAGE_HEIGHT = 800;
/** A math face the `EQUATION_MATH_FONT_SHARE` gate recognises. */
const MATH_FACE = "CMMI10";
const TEXT_FACE = "Helvetica";

/** One item of a line, the way the ingestion delivers it (top-left box). */
function item(
  text: string,
  top: number,
  options: { x?: number; fontName?: string; width?: number } = {},
): RawTextItem {
  const { x = 72, fontName = TEXT_FACE, width } = options;
  return {
    text,
    x,
    y: top,
    width: width ?? text.length * BODY * 0.5,
    height: BODY,
    fontName,
    fontSize: BODY,
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

function paragraphOf(...items: RawTextItem[]): JoinedParagraph {
  const lines = linesOf(items);
  return { lines, pageFrom: 0, pageTo: 0 };
}

/** The claim lookup `splitParagraphsAtClaims` cuts the paragraphs with. */
function claimMap(decisions: readonly { lines: readonly TextLine[] }[]): Map<TextLine, unknown> {
  return claimsByLine(decisions);
}

describe("detectEquations (E10-T03)", () => {
  it("claims a line set in a math font with a relation", () => {
    const paragraph = paragraphOf(
      item("E = mc2", 100, { fontName: MATH_FACE }),
      item("p = mv", 114, { fontName: MATH_FACE }),
    );

    const decisions = detectEquations([paragraph], { bodyFontSize: BODY, tables: [undefined] });

    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.lines).toHaveLength(2);
    expect(decisions[0] && equationText(decisions[0])).toBe("E = mc2\np = mv");
  });

  it("claims a dense-symbol line of the text face", () => {
    const paragraph = paragraphOf(item("a+b×c−d ≈ e", 100));

    const decisions = detectEquations([paragraph], { bodyFontSize: BODY, tables: [undefined] });

    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.lines).toHaveLength(1);
  });

  it("claims a line the typesetter numbered, even when it is thin", () => {
    const paragraph = paragraphOf(item("x = 1 (12)", 100));

    expect(detectEquations([paragraph], { bodyFontSize: BODY, tables: [undefined] })).toHaveLength(
      1,
    );
  });

  it("keeps running text with a sprinkled symbol out", () => {
    const paragraph = paragraphOf(
      item("The equation x = 1 holds here for the whole sentence of the text.", 100),
      item("so x = 1 and", 114),
    );

    expect(detectEquations([paragraph], { bodyFontSize: BODY, tables: [undefined] })).toHaveLength(
      0,
    );
  });

  it("keeps a by-line of CMMI superscripts out — no symbol, no claim", () => {
    const paragraph = paragraphOf(item("Anna D'Ambrosio1,2", 100, { fontName: MATH_FACE }));

    expect(detectEquations([paragraph], { bodyFontSize: BODY, tables: [undefined] })).toHaveLength(
      0,
    );
  });

  it("keeps a math line that trails off into a word of prose", () => {
    const paragraph = paragraphOf(item("x = y, we obtain", 100, { fontName: MATH_FACE }));

    expect(detectEquations([paragraph], { bodyFontSize: BODY, tables: [undefined] })).toHaveLength(
      0,
    );
  });

  it("keeps a side line out of the claim", () => {
    const paragraph = paragraphOf(item("x = 1", 100, { fontName: MATH_FACE }));
    (paragraph.lines[0] as TextLine).side = true;

    expect(detectEquations([paragraph], { bodyFontSize: BODY, tables: [undefined] })).toHaveLength(
      0,
    );
  });

  it("rides a broken piece of the formula along with its candidate", () => {
    const paragraph = paragraphOf(item("M1R2 M2", 100), item("2 = (6)", 114));

    const decisions = detectEquations([paragraph], { bodyFontSize: BODY, tables: [undefined] });

    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.lines).toHaveLength(2);
  });

  it("never claims a fragment-only run — no candidate, no decision", () => {
    const paragraph = paragraphOf(item("M1R2 M2", 100), item("ρ2", 114));

    expect(detectEquations([paragraph], { bodyFontSize: BODY, tables: [undefined] })).toHaveLength(
      0,
    );
  });

  it("parts the runs at a line of running text", () => {
    const paragraph = paragraphOf(
      item("E = mc2", 100, { fontName: MATH_FACE }),
      item("The words of a sentence sit between the two lines.", 114),
      item("p = mv", 128, { fontName: MATH_FACE }),
    );

    const decisions = detectEquations([paragraph], { bodyFontSize: BODY, tables: [undefined] });

    expect(decisions).toHaveLength(2);
    const claimed = decisions.flatMap((decision) => decision.lines);
    expect(claimed).not.toContain(paragraph.lines[1]);
  });

  it("keeps a dot-leader contents line out even beside an equation", () => {
    const paragraph = paragraphOf(
      item("E = mc2", 100, { fontName: MATH_FACE }),
      item("Chapter 1", 114, { x: 72 }),
      item("......", 114, { x: 200, width: 100 }),
      item("12", 114, { x: 400, width: 10 }),
    );
    // The three items of the contents line share a baseline: `groupLines`
    // glues them into one line, which must not ride along as a fragment.
    const decisions = detectEquations([paragraph], { bodyFontSize: BODY, tables: [undefined] });

    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.lines).toHaveLength(1);
  });

  it("skips a paragraph a table already claimed", () => {
    const paragraph = paragraphOf(item("x = 1", 100, { fontName: MATH_FACE }));
    const table = { lines: paragraph.lines, cells: [["x"]] };

    expect(
      detectEquations([paragraph], { bodyFontSize: BODY, tables: [table as never] }),
    ).toHaveLength(0);
  });

  it("chains two runs of the same band that touch", () => {
    const first = paragraphOf(item("E = mc2", 100, { fontName: MATH_FACE }));
    const second = paragraphOf(item("p = mv", 114, { fontName: MATH_FACE }));

    const decisions = detectEquations([first, second], {
      bodyFontSize: BODY,
      tables: [undefined, undefined],
    });

    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.lines).toHaveLength(2);
  });

  it("keeps two runs apart when the gap is wider than the link factor", () => {
    const first = paragraphOf(item("E = mc2", 100, { fontName: MATH_FACE }));
    const second = paragraphOf(item("p = mv", 160, { fontName: MATH_FACE }));

    const decisions = detectEquations([first, second], {
      bodyFontSize: BODY,
      tables: [undefined, undefined],
    });

    expect(decisions).toHaveLength(2);
  });

  it("does not chain across a paragraph of running text", () => {
    const first = paragraphOf(item("E = mc2", 100, { fontName: MATH_FACE }));
    const prose = paragraphOf(item("A sentence of prose sits between them.", 114));
    const last = paragraphOf(item("p = mv", 128, { fontName: MATH_FACE }));

    const decisions = detectEquations([first, prose, last], {
      bodyFontSize: BODY,
      tables: [undefined, undefined, undefined],
    });

    expect(decisions).toHaveLength(2);
  });
});

describe("splitParagraphsAtClaims on equations (E10-T03)", () => {
  it("cuts the prose around the claim so the equation reads alone", () => {
    const paragraph = paragraphOf(
      item("Before the equation the sentence starts here.", 86),
      item("E = mc2", 100, { fontName: MATH_FACE }),
      item("After the equation the sentence ends here.", 114),
    );
    const decisions = detectEquations([paragraph], { bodyFontSize: BODY, tables: [undefined] });
    expect(decisions).toHaveLength(1);
    const linePages = new Map(paragraph.lines.map((line) => [line, 0]));

    const split = splitParagraphsAtClaims([paragraph], claimMap(decisions), linePages);

    expect(split.paragraphs).toHaveLength(3);
    expect(split.claims[0]).toBeUndefined();
    expect(split.claims[1]).toBe(decisions[0]);
    expect(split.claims[2]).toBeUndefined();
    expect(split.paragraphs[1]?.lines).toEqual(decisions[0]?.lines);
  });
});
