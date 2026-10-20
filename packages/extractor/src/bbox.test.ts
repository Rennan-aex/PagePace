import { describe, expect, it } from "vitest";
import { BBOX_DECIMALS, linePageMap, linesBBox, paragraphBBoxes } from "./bbox";
import type { TextLine } from "./lines";
import type { JoinedParagraph } from "./pagejoin";

function line(x: number, top: number, width: number, height: number): TextLine {
  return { items: [], top, bottom: top + height, x, width, fontSize: height };
}

const lineA = line(72, 100, 200, 12);
const lineB = line(80, 114, 180, 12);
const lineC = line(320, 100, 100, 12);

describe("linesBBox", () => {
  it("returns the box of a single line untouched (the ADR-065 margin box)", () => {
    expect(linesBBox([lineA])).toEqual({ x: 72, y: 100, width: 200, height: 12 });
  });

  it("unions several lines of one column", () => {
    expect(linesBBox([lineA, lineB])).toEqual({ x: 72, y: 100, width: 200, height: 26 });
  });

  it("unions lines across a gutter into one box", () => {
    expect(linesBBox([lineA, lineC])).toEqual({ x: 72, y: 100, width: 348, height: 12 });
  });

  it("rounds every coordinate to BBOX_DECIMALS places", () => {
    const odd = line(72.333333, 100.005, 19.999999, 11.111111);
    expect(BBOX_DECIMALS).toBe(2);
    expect(linesBBox([odd])).toEqual({ x: 72.33, y: 100.01, width: 20, height: 11.11 });
  });

  it("returns null for no lines", () => {
    expect(linesBBox([])).toBeNull();
  });
});

describe("linePageMap", () => {
  it("maps every line of every page to its page index", () => {
    const pages = [[[lineA], [lineB]], [[lineC]]];
    const map = linePageMap(pages);
    expect(map.get(lineA)).toBe(0);
    expect(map.get(lineB)).toBe(0);
    expect(map.get(lineC)).toBe(1);
    expect(map.size).toBe(3);
  });
});

describe("paragraphBBoxes", () => {
  const pages = [[[lineA, lineB]], [[lineC]]];
  const linePages = linePageMap(pages);

  it("gives a one-page paragraph one box", () => {
    const paragraph: JoinedParagraph = { lines: [lineA, lineB], pageFrom: 0, pageTo: 0 };
    expect(paragraphBBoxes(paragraph, linePages)).toEqual([
      { x: 72, y: 100, width: 200, height: 26 },
    ]);
  });

  it("gives a cross-page paragraph one box per page, in page order", () => {
    const paragraph: JoinedParagraph = { lines: [lineB, lineC], pageFrom: 0, pageTo: 1 };
    expect(paragraphBBoxes(paragraph, linePages)).toEqual([
      { x: 80, y: 114, width: 180, height: 12 },
      { x: 320, y: 100, width: 100, height: 12 },
    ]);
  });

  it("falls back to the first page for lines the map does not know", () => {
    const stranger = line(10, 10, 10, 10);
    const paragraph: JoinedParagraph = { lines: [lineA, stranger], pageFrom: 0, pageTo: 0 };
    expect(paragraphBBoxes(paragraph, linePages)).toEqual([
      { x: 10, y: 10, width: 262, height: 102 },
    ]);
  });

  it("is deterministic: same input, same boxes", () => {
    const paragraph: JoinedParagraph = { lines: [lineA, lineB, lineC], pageFrom: 0, pageTo: 1 };
    expect(paragraphBBoxes(paragraph, linePages)).toEqual(paragraphBBoxes(paragraph, linePages));
  });
});
