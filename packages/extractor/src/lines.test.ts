import type { RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import {
  groupLines,
  LINE_BASELINE_TOLERANCE_FACTOR,
  LINE_OVERLAP_MIN_FACTOR,
  type TextLine,
} from "./lines";

/**
 * One text item sitting on `baseline` (points from the top of the page), the
 * way the ingestion delivers it: the box grows `size` points up from the
 * baseline, so `y + height` is the baseline itself.
 */
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

function page(items: RawTextItem[]): RawPage {
  return { index: 0, width: 612, height: 792, rotation: 0, items };
}

function texts(line: TextLine): string[] {
  return line.items.map((entry) => entry.text);
}

describe("groupLines", () => {
  it("joins fragmented items of one line and orders them left to right", () => {
    const lines = groupLines(
      page([
        item("woke", 200, 100, 11),
        item("The light", 72, 100, 11),
        item("slowly", 150, 100, 11),
      ]),
    );
    expect(lines).toHaveLength(1);
    expect(texts(lines[0] as TextLine)).toEqual(["The light", "slowly", "woke"]);
    expect((lines[0] as TextLine).x).toBe(72);
    expect((lines[0] as TextLine).fontSize).toBe(11);
  });

  it("keeps consecutive lines apart", () => {
    const lines = groupLines(
      page([item("first line", 72, 100, 11), item("second line", 72, 113, 11)]),
    );
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.top)).toEqual([89, 102]);
  });

  it("does not merge tightly led lines", () => {
    const leading = 1.05 * 11;
    const lines = groupLines(page([item("one", 72, 100, 11), item("two", 72, 100 + leading, 11)]));
    expect(lines).toHaveLength(2);
  });

  it("keeps a raised superscript inside its line", () => {
    const baseline = 100;
    const lines = groupLines(
      page([
        item("note", 72, baseline, 11),
        item("1", 100, baseline - 3.5, 8),
        item("after", 110, baseline, 11),
        item("next line", 72, baseline + 13, 11),
      ]),
    );
    expect(lines).toHaveLength(2);
    expect(texts(lines[0] as TextLine).join("")).toBe("note1after");
    expect(texts(lines[1] as TextLine).join("")).toBe("next line");
  });

  it("joins a font change on the same baseline", () => {
    const lines = groupLines(page([item("Chapter ", 72, 200, 11), item("ONE", 140, 200, 24)]));
    expect(lines).toHaveLength(1);
    expect((lines[0] as TextLine).fontSize).toBe(24);
    expect((lines[0] as TextLine).x).toBe(72);
    expect((lines[0] as TextLine).width).toBeGreaterThan(100);
  });

  it("attaches zero-height spaces and EOL markers without creating lines", () => {
    const marker = item("", 180, 100, 11, { width: 0, height: 0, hasEOL: true });
    const space = item(" ", 140, 100, 11, { width: 5, height: 0 });
    const orphan = item("", 72, 400, 11, { width: 0, height: 0, hasEOL: true });
    const lines = groupLines(page([marker, space, item("word", 72, 100, 11), orphan]));
    expect(lines).toHaveLength(1);
    expect(texts(lines[0] as TextLine)).toEqual(["word", " ", ""]);
    expect((lines[0] as TextLine).x).toBe(72);
    expect((lines[0] as TextLine).width).toBe(22);
  });

  it("returns no line for a page without content", () => {
    expect(groupLines(page([]))).toEqual([]);
    expect(groupLines(page([item(" ", 72, 100, 11, { width: 4, height: 0 })]))).toEqual([]);
    expect(groupLines(page([item("", 72, 100, 11, { width: 0, height: 0 })]))).toEqual([]);
  });

  it("returns lines from top to bottom and is independent of item order", () => {
    const items = [
      item("third", 72, 300, 11),
      item("first", 72, 100, 11),
      item("second", 72, 200, 11),
      item("tail", 120, 300, 11),
    ];
    const direct = groupLines(page(items));
    expect(direct.map((line) => texts(line).join(""))).toEqual(["first", "second", "thirdtail"]);
    expect(groupLines(page([...items].reverse()))).toEqual(direct);
  });

  it("exposes named, relative thresholds", () => {
    expect(LINE_BASELINE_TOLERANCE_FACTOR).toBeGreaterThan(0);
    expect(LINE_BASELINE_TOLERANCE_FACTOR).toBeLessThan(1);
    expect(LINE_OVERLAP_MIN_FACTOR).toBeGreaterThan(0);
    expect(LINE_OVERLAP_MIN_FACTOR).toBeLessThanOrEqual(1);
  });
});
