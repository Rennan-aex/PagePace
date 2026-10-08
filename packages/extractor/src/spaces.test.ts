// E2-T03 — space inference: the gap decides, existing spaces are never
// duplicated. Thresholds come from the corpus measurement recorded in
// docs/extractor/DECISIONS.md (ADR-040), not from a guess.
import type { RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { itemsText, SPACE_GAP_FACTOR, spaceBetween } from "./spaces";

const item = (text: string, x: number, options: Partial<RawTextItem> = {}): RawTextItem => ({
  text,
  x,
  y: 100,
  width: 20,
  height: 12,
  fontName: "Helvetica",
  fontSize: 10,
  ...options,
});

describe("SPACE_GAP_FACTOR", () => {
  it("is the measured valley between kerning splits (0.087) and glyph-less word gaps (0.164)", () => {
    expect(SPACE_GAP_FACTOR).toBe(0.12);
  });
});

describe("spaceBetween", () => {
  it("separates runs whose gap is above the factor of the larger font size", () => {
    const first = item("Hello", 72); // ends at 92
    const second = item("world", 97); // gap 5 = 0.5 em
    expect(spaceBetween(first, second)).toBe(true);
  });

  it("keeps runs that touch or overlap (tight kerning)", () => {
    const first = item("phil", 72); // ends at 92
    expect(spaceBetween(first, item("osophy", 92))).toBe(false);
    expect(spaceBetween(first, item("osophy", 91.5))).toBe(false);
  });

  it("does not separate at exactly the threshold", () => {
    // 100 pt keeps the arithmetic exact in binary: 0.12 * 100 === 12.
    const first = item("Hello", 72, { fontSize: 100 }); // ends at 92
    expect(spaceBetween(first, item("world", 104, { fontSize: 100 }))).toBe(false); // gap 12
    expect(spaceBetween(first, item("world", 104.25, { fontSize: 100 }))).toBe(true); // gap 12.25
  });

  it("normalises by the larger font size of the pair", () => {
    const small = item("A", 72, { width: 20, fontSize: 10 }); // ends at 92
    const big = item("B", 93.5, { width: 20, fontSize: 20 }); // gap 1.5
    expect(spaceBetween(small, big)).toBe(false); // 1.5 < 0.12 * 20
    expect(spaceBetween(small, item("B", 93.5, { width: 20, fontSize: 10 }))).toBe(true);
  });

  it("never duplicates a space the text already carries", () => {
    const trailing = item("word ", 72, { width: 40 }); // ends at 112, text already spaced
    expect(spaceBetween(trailing, item("next", 132))).toBe(false);
    const leading = item("next", 132, { text: " next" });
    expect(spaceBetween(item("word", 72), leading)).toBe(false);
    const space = item(" ", 92, { width: 0 });
    expect(spaceBetween(space, item("next", 104))).toBe(false);
  });
});

describe("itemsText", () => {
  it("joins justified runs: wide gaps, one space each, no space glyphs needed", () => {
    const line = [
      item("The", 72, { width: 18 }), // ends 90
      item("light", 95, { width: 25 }), // gap 5 = 0.5 em, ends 120
      item("came", 128, { width: 24 }), // gap 8 = 0.8 em, ends 152
      item("slowly", 172, { width: 30 }), // gap 20 = 2 em
    ];
    expect(itemsText(line)).toBe("The light came slowly");
  });

  it("keeps tight kerning inside the word", () => {
    expect(itemsText([item("phil", 72), item("osophy", 92.6)])).toBe("philosophy");
    expect(itemsText([item("half", 72), item("way", 93)])).toBe("halfway"); // gap 1.0 em
  });

  it("inserts the space the producer never wrote (items without a space)", () => {
    const line = [item("word", 72), item("other", 95)]; // gap 3 = 0.3 em
    expect(itemsText(line)).toBe("word other");
  });

  it("does not duplicate existing spaces", () => {
    expect(itemsText([item("word ", 72, { width: 40 }), item("next", 132)])).toBe("word next");
    expect(itemsText([item("word", 72), item(" next", 132)])).toBe("word next");
    // A zero-width space item followed by a real gap used to yield two spaces.
    const runs = [item("word", 72, { width: 24 }), item(" ", 96, { width: 0 }), item("next", 104)];
    expect(itemsText(runs)).toBe("word next");
  });

  it("breaks the line where pdf.js reports hasEOL", () => {
    expect(itemsText([item("Line one", 72, { hasEOL: true }), item("Line two", 72)])).toBe(
      "Line one\nLine two",
    );
    const marker = item("", 72, { hasEOL: true, width: 0 });
    expect(itemsText([item("Line one", 72), marker, item("Line two", 72)])).toBe(
      "Line one\nLine two",
    );
  });

  it("ignores marker items without an end of line", () => {
    expect(itemsText([item("A", 72), item("", 92, { width: 0 }), item("B", 92)])).toBe("AB");
  });

  it("returns an empty string for no items", () => {
    expect(itemsText([])).toBe("");
  });
});
