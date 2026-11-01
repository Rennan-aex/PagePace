import { describe, expect, it } from "vitest";
import type { OcrRaster, StyleWordInput } from "./ocr-style";
import { estimatePageWordStyles } from "./ocr-style";

/**
 * E9-T03: the visual style heuristic, on hand-drawn rasters.
 *
 * The fixtures are tiny bitmap pages built here — no engine, no canvas, no
 * clock — so every measurement is reproducible: regular stems vs heavy stems
 * for bold, a slanted stem for italic, an ascender for the size refinement,
 * and the thin-ink/thin-box cases that must fall back to "no style".
 */

function raster(width: number, height: number, paper = 255): OcrRaster {
  return { width, height, luminance: new Uint8Array(width * height).fill(paper) };
}

function inkRect(
  page: OcrRaster,
  x: number,
  y: number,
  width: number,
  height: number,
  ink = 0,
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      page.luminance[row * page.width + column] = ink;
    }
  }
}

/** One vertical stem slanted like an italic (top to the right, bottom to the left). */
function inkItalicStem(
  page: OcrRaster,
  x: number,
  y: number,
  height: number,
  thickness: number,
  deg: number,
): void {
  const tan = Math.tan((deg * Math.PI) / 180);
  for (let row = 0; row < height; row += 1) {
    inkRect(page, x - Math.round(row * tan), y + row, thickness, 1);
  }
}

function word(x0: number, y0: number, x1: number, y1: number, confidence = 90): StyleWordInput {
  return { bbox: { x0, y0, x1, y1 }, confidence };
}

/** Three vertical stems inside one box, drawn at (x, y) with the given stem width. */
function stems(page: OcrRaster, x: number, y: number, stem: number, height: number): void {
  for (let index = 0; index < 3; index += 1) {
    inkRect(page, x + index * 12, y, stem, height);
  }
}

describe("estimatePageWordStyles", () => {
  it("calls the heavy stems bold and the regular ones not, against the page median", () => {
    const page = raster(240, 40);
    stems(page, 12, 12, 2, 16);
    stems(page, 62, 12, 2, 16);
    stems(page, 112, 12, 5, 16);
    const words = [word(10, 8, 48, 32), word(60, 8, 98, 32), word(110, 8, 148, 32)];

    const styles = estimatePageWordStyles(page, words);

    expect(styles[0]).toMatchObject({ bold: false, italic: false });
    expect(styles[1]).toMatchObject({ bold: false, italic: false });
    expect(styles[2]).toMatchObject({ bold: true, italic: false });
    for (const style of styles) expect(style.styleConfidence).toBeGreaterThanOrEqual(0.5);
  });

  it("detects the italic slant and leaves upright stems alone", () => {
    const page = raster(240, 40);
    for (let index = 0; index < 3; index += 1) {
      inkItalicStem(page, 20 + index * 12, 12, 16, 2, 15);
    }
    for (let index = 0; index < 3; index += 1) {
      inkRect(page, 122 + index * 12, 12, 2, 16);
    }
    const words = [word(2, 8, 52, 32), word(112, 8, 152, 32)];

    const styles = estimatePageWordStyles(page, words);

    expect(styles[0]).toMatchObject({ italic: true, bold: false });
    expect(styles[1]).toMatchObject({ italic: false, bold: false });
    expect(styles[0]?.styleConfidence).toBeGreaterThanOrEqual(0.5);
  });

  it("sizes every body word from the x-height, whatever the box padding", () => {
    // An "h": stem across the padded box, solid body at the bottom. The band
    // of dense rows is the body, so the x-height (not the padded box) sizes
    // the word — and the body words around it land on the very same size.
    const page = raster(120, 48);
    inkRect(page, 14, 6, 2, 24);
    inkRect(page, 14, 18, 8, 12);
    // Two more body words so the page has its regular reference.
    stems(page, 42, 18, 2, 12);
    stems(page, 82, 18, 2, 12);
    const words = [word(12, 4, 34, 34), word(40, 16, 78, 32), word(80, 16, 118, 32)];

    const styles = estimatePageWordStyles(page, words);

    // x-height 12 / 0.5 = 24 for all three, not the padded boxes (30/16/16).
    expect(styles[0]?.fontSize).toBe(24);
    expect(styles[1]?.fontSize).toBe(24);
    expect(styles[2]?.fontSize).toBe(24);
  });

  it("sizes a pure x-height word from the x-height too (no ascender, same face)", () => {
    const page = raster(120, 40);
    inkRect(page, 14, 12, 24, 12);
    inkRect(page, 54, 12, 24, 12);
    const words = [word(12, 10, 40, 26), word(52, 10, 80, 26)];

    const styles = estimatePageWordStyles(page, words);

    expect(styles[0]?.fontSize).toBe(24);
    expect(styles[1]?.fontSize).toBe(24);
  });

  it("falls back to no style when the ink contrast is too thin", () => {
    const page = raster(120, 40);
    stems(page, 12, 12, 2, 16);
    stems(page, 62, 12, 2, 16);
    // Paper 255, ink 220: contrast 35 < OCR_STYLE_MIN_CONTRAST.
    inkRect(page, 12, 12, 2, 16, 220);
    inkRect(page, 24, 12, 2, 16, 220);
    inkRect(page, 36, 12, 2, 16, 220);
    const words = [word(10, 8, 48, 32), word(60, 8, 98, 32)];

    const styles = estimatePageWordStyles(page, words);

    expect(styles[0]).toEqual({ styleConfidence: 0 });
    expect(styles[1]).toEqual({ styleConfidence: 0 });
  });

  it("falls back to no style when a box holds too little ink", () => {
    const page = raster(120, 40);
    inkRect(page, 14, 12, 2, 5);
    stems(page, 42, 12, 2, 16);
    stems(page, 82, 12, 2, 16);
    const words = [word(12, 10, 20, 20), word(40, 8, 78, 32), word(80, 8, 118, 32)];

    const styles = estimatePageWordStyles(page, words);

    expect(styles[0]).toEqual({ styleConfidence: 0 });
    expect(styles[1]?.styleConfidence).toBeGreaterThan(0);
  });

  it("falls back to no style when the page has no regular reference", () => {
    const page = raster(120, 40);
    inkRect(page, 14, 12, 2, 5);
    const words = [word(12, 10, 20, 20)];

    const styles = estimatePageWordStyles(page, words);

    expect(styles).toEqual([{ styleConfidence: 0 }]);
  });

  it("lets the engine's own doubt outrank the image", () => {
    const page = raster(240, 40);
    stems(page, 12, 12, 2, 16);
    stems(page, 62, 12, 2, 16);
    stems(page, 112, 12, 5, 16);
    const words = [word(10, 8, 48, 32), word(60, 8, 98, 32), word(110, 8, 148, 32, 20)];

    const styles = estimatePageWordStyles(page, words);

    expect(styles[2]).toEqual({ styleConfidence: 0 });
  });

  it("is deterministic: the same raster and words yield the same styles", () => {
    const draw = (page: OcrRaster): void => {
      stems(page, 12, 12, 2, 16);
      stems(page, 62, 12, 2, 16);
      stems(page, 112, 12, 5, 16);
    };
    const first = raster(240, 40);
    const second = raster(240, 40);
    draw(first);
    draw(second);
    const words = [word(10, 8, 48, 32), word(60, 8, 98, 32), word(110, 8, 148, 32)];

    expect(estimatePageWordStyles(first, words)).toEqual(estimatePageWordStyles(second, words));
  });
});
