import type { RawTextItem } from "@pagepace/schema";
import { parseBook } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildBook, OCR_TEXT_LAYER_CONFIDENCE } from "../book";
import { classifyFontName } from "../fontstyle";
import type { OcrLine, OcrPageInput, OcrWord } from "./ocr";
import { ingestOcr, OCR_FONT_NAME, OCR_RENDER_SCALE, ocrPageToRawPage } from "./ocr";
import type { OcrRaster } from "./ocr-style";

/**
 * E9-T02: the engine-agnostic OCR core.
 *
 * Word boxes arrive in image pixels (origin top-left, y down — the tesseract
 * layout) and leave as page points divided by the render scale; every word
 * becomes one `RawTextItem` with the neutral face `"unknown"` (E9-T02) and,
 * when the page raster is present, the visual style of E9-T03 — `fontFlags`
 * for confident words, the plain item otherwise. `ingestOcr` flags the
 * document `source.ocrTextLayer` so the existing pipeline (`buildBook`)
 * lowers the confidence base and warns `ocr-text-layer` either way, and
 * re-enables run styles only for the words the heuristic marked.
 */

function word(text: string, x0: number, y0: number, x1: number, y1: number): OcrWord {
  return { text, bbox: { x0, y0, x1, y1 }, confidence: 90 };
}

function line(words: OcrWord[]): OcrLine {
  return { words };
}

function pageOf(lines: OcrLine[], index = 0): OcrPageInput {
  return { index, imageWidth: 1224, imageHeight: 1584, lines };
}

function itemsText(items: readonly RawTextItem[]): string {
  return items.map((item) => item.text).join("|");
}

const SHA = "b".repeat(64);

/** Blank grayscale page for the E9-T03 raster fixtures. */
function blankRaster(width: number, height: number): OcrRaster {
  return { width, height, luminance: new Uint8Array(width * height).fill(255) };
}

function inkRect(page: OcrRaster, x: number, y: number, width: number, height: number): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      page.luminance[row * page.width + column] = 0;
    }
  }
}

/** Vertical stems (regular `stem` px wide) inside the box at (x, y). */
function stems(page: OcrRaster, x: number, y: number, stem: number, height: number): void {
  for (let index = 0; index < 3; index += 1) {
    inkRect(page, x + index * 12, y, stem, height);
  }
}

/** One italic stem: top to the right, bottom to the left (E9-T03 fixture). */
function italicStem(page: OcrRaster, x: number, y: number, height: number, deg: number): void {
  const tan = Math.tan((deg * Math.PI) / 180);
  for (let row = 0; row < height; row += 1) {
    inkRect(page, x - Math.round(row * tan), y + row, 2, 1);
  }
}

/** Four words on one line: two regular, one heavy, one slanted. */
function styledPage(): { page: OcrPageInput; raster: OcrRaster } {
  const raster = blankRaster(240, 40);
  stems(raster, 12, 12, 2, 16);
  stems(raster, 62, 12, 2, 16);
  stems(raster, 112, 12, 5, 16);
  for (let index = 0; index < 3; index += 1) {
    italicStem(raster, 184 + index * 12, 12, 16, 15);
  }
  const page: OcrPageInput = {
    index: 0,
    imageWidth: 240,
    imageHeight: 40,
    image: raster,
    lines: [
      line([
        word("alpha", 10, 8, 48, 32),
        word("beta", 60, 8, 98, 32),
        word("gamma", 110, 8, 148, 32),
        word("delta", 162, 8, 214, 32),
      ]),
    ],
  };
  return { page, raster };
}

describe("ocrPageToRawPage", () => {
  it("converts word boxes from image pixels to page points at the render scale", () => {
    const raw = ocrPageToRawPage(
      pageOf([line([word("Hello", 144, 200, 344, 240)])]),
      OCR_RENDER_SCALE,
    );

    expect(raw.index).toBe(0);
    expect(raw.width).toBe(612);
    expect(raw.height).toBe(792);
    expect(raw.rotation).toBe(0);
    expect(raw.items).toHaveLength(1);
    expect(raw.items[0]).toMatchObject({
      text: "Hello",
      x: 72,
      y: 100,
      width: 100,
      height: 20,
      fontName: OCR_FONT_NAME,
      fontSize: 20,
    });
    expect(raw.items[0]?.fontFlags).toBeUndefined();
  });

  it("marks hasEOL on the last word of every line and only there", () => {
    const raw = ocrPageToRawPage(
      pageOf([
        line([word("Alpha", 100, 100, 200, 120), word("beta", 210, 100, 300, 120)]),
        line([word("gamma", 100, 130, 200, 150)]),
      ]),
      1,
    );

    expect(raw.items.map((item) => [item.text, item.hasEOL])).toEqual([
      ["Alpha", undefined],
      ["beta", true],
      ["gamma", true],
    ]);
  });

  it("drops empty and degenerate words instead of emitting invalid items", () => {
    const raw = ocrPageToRawPage(
      pageOf([
        line([
          word("", 10, 10, 50, 30),
          word("   ", 10, 10, 50, 30),
          word("flat", 10, 10, 50, 10), // zero height
          word("ok", 10, 10, 50, 30),
        ]),
      ]),
      1,
    );

    expect(raw.items.map((item) => item.text)).toEqual(["ok"]);
  });

  it("uses a custom scale when the renderer zoomed", () => {
    const raw = ocrPageToRawPage(pageOf([line([word("Zoom", 0, 0, 400, 80)])]), 4);
    expect(raw.items[0]).toMatchObject({ width: 100, height: 20, fontSize: 20 });
    expect(raw.width).toBe(306);
  });

  it("carries the page index and keeps multi-page numbering", () => {
    const raw = ocrPageToRawPage(pageOf([line([word("Two", 10, 10, 40, 30)])], 1), 1);
    expect(raw.index).toBe(1);
  });
});

describe("ocrPageToRawPage with a raster (E9-T03)", () => {
  it("stamps fontFlags and a page-calibrated size on confident words", () => {
    const { page } = styledPage();
    const raw = ocrPageToRawPage(page, 2);

    const [alpha, beta, gamma, delta] = raw.items;
    // x-height 16 px / 0.5 = 32 px = 16 pt at scale 2 — not the 24 px box.
    for (const item of raw.items) expect(item.fontSize).toBe(16);
    expect(alpha?.fontFlags).toEqual({ bold: false, italic: false });
    expect(beta?.fontFlags).toEqual({ bold: false, italic: false });
    expect(gamma?.fontFlags).toEqual({ bold: true, italic: false });
    expect(delta?.fontFlags).toEqual({ bold: false, italic: true });
  });

  it("keeps the plain item when the same page arrives without a raster", () => {
    const { page } = styledPage();
    const raw = ocrPageToRawPage({ ...page, image: undefined }, 2);

    for (const item of raw.items) {
      expect(item.fontFlags).toBeUndefined();
      expect(item.fontSize).toBe(12); // the E9-T02 box height: 24 px / 2.
    }
  });

  it("does not let the engine's doubt inherit style from the image", () => {
    const { page, raster } = styledPage();
    const doubtful: OcrPageInput = {
      ...page,
      image: raster,
      lines: [
        line([
          { ...word("gamma", 110, 8, 148, 32), confidence: 10 },
          word("alpha", 10, 8, 48, 32),
          word("beta", 60, 8, 98, 32),
          { ...word("delta", 162, 8, 214, 32), confidence: 10 },
        ]),
      ],
    };
    const raw = ocrPageToRawPage(doubtful, 2);

    const [gamma, alpha, beta, delta] = raw.items;
    expect(gamma?.fontFlags).toBeUndefined();
    expect(gamma?.fontSize).toBe(12);
    expect(delta?.fontFlags).toBeUndefined();
    expect(alpha?.fontFlags).toEqual({ bold: false, italic: false });
    expect(beta?.fontFlags).toEqual({ bold: false, italic: false });
  });
});

describe("ingestOcr", () => {
  const twoLines = pageOf([
    line([word("Alpha", 100, 200, 200, 220), word("beta", 210, 200, 300, 220)]),
    line([word("gamma.", 100, 230, 250, 250)]),
  ]);

  it("produces a RawDocument that validates against the schema", () => {
    const doc = ingestOcr([twoLines], {
      fileName: "scan.pdf",
      sha256: SHA,
      adapterVersion: "7.0.0",
    });

    expect(doc.schemaVersion).toBe("1.2.0");
    expect(doc.source).toEqual({
      fileName: "scan.pdf",
      sha256: SHA,
      pageCount: 1,
      tagged: false,
      ocrTextLayer: true,
    });
    expect(doc.ingest).toEqual({ adapter: "ocr", adapterVersion: "7.0.0" });
    expect(doc.outline).toBeUndefined();
    expect(doc.tagHints).toBeUndefined();
    expect(itemsText(doc.pages[0]?.items ?? [])).toBe("Alpha|beta|gamma.");
  });

  it("keeps a caller-supplied pageCount when only a range was recognised", () => {
    const doc = ingestOcr([pageOf([line([word("Mid", 10, 10, 40, 30)])], 49)], {
      fileName: "scan.pdf",
      sha256: SHA,
      pageCount: 319,
      adapterVersion: "7.0.0",
    });
    expect(doc.source.pageCount).toBe(319);
  });

  it("defaults pageCount to the highest page index + 1", () => {
    const doc = ingestOcr([twoLines, pageOf([line([word("Next", 10, 10, 50, 30)])], 1)], {
      fileName: "scan.pdf",
      sha256: SHA,
      adapterVersion: "7.0.0",
    });
    expect(doc.source.pageCount).toBe(2);
  });

  it("records a custom render scale in the boxes", () => {
    const doc = ingestOcr([twoLines], {
      fileName: "scan.pdf",
      sha256: SHA,
      scale: 1,
      adapterVersion: "7.0.0",
    });
    expect(doc.pages[0]?.items[0]).toMatchObject({ x: 100, y: 200, width: 100, height: 20 });
  });

  it("rejects unusable input with RangeError", () => {
    const args = { sha256: SHA, adapterVersion: "7.0.0" };
    expect(() => ingestOcr([twoLines], { ...args, fileName: " " })).toThrow(RangeError);
    expect(() => ingestOcr([], { ...args, fileName: "scan.pdf" })).toThrow(RangeError);
    expect(() => ingestOcr([twoLines], { ...args, fileName: "scan.pdf", scale: 0 })).toThrow(
      RangeError,
    );
    expect(() =>
      ingestOcr([twoLines], { ...args, fileName: "scan.pdf", scale: Number.NaN }),
    ).toThrow(RangeError);
    expect(() =>
      ingestOcr([{ ...twoLines, index: -1 }], { ...args, fileName: "scan.pdf" }),
    ).toThrow(RangeError);
    expect(() =>
      ingestOcr([{ ...twoLines, index: 1.5 }], { ...args, fileName: "scan.pdf" }),
    ).toThrow(RangeError);
  });

  it("runs the unchanged pipeline: OCR confidence base, warning, plain runs", () => {
    const doc = ingestOcr([twoLines], {
      fileName: "scan.pdf",
      sha256: SHA,
      adapterVersion: "7.0.0",
    });

    const book = buildBook(doc);
    expect(() => parseBook(book)).not.toThrow();
    expect(book.extraction.warnings).toContain("ocr-text-layer");
    const paragraph = book.blocks.find((block) => block.kind === "paragraph");
    expect(paragraph?.confidence).toBe(OCR_TEXT_LAYER_CONFIDENCE);
    // No style from the neutral face: one plain run, no bold/italic flags.
    expect(paragraph?.runs).toHaveLength(1);
    expect(paragraph?.runs[0]).toMatchObject({ text: "Alpha beta gamma." });
    expect(paragraph?.runs[0]?.bold).toBeUndefined();
    expect(paragraph?.runs[0]?.italic).toBeUndefined();
  });

  it("classifies the neutral face with no style signal", () => {
    expect(classifyFontName(OCR_FONT_NAME)).toMatchObject({
      bold: false,
      italic: false,
    });
  });

  it("rejects a raster that does not match the declared image size", () => {
    const { page, raster } = styledPage();
    const args = { fileName: "scan.pdf", sha256: SHA, adapterVersion: "7.0.0" };
    const badSize: OcrPageInput = { ...page, image: blankRaster(100, 40) };
    expect(() => ingestOcr([badSize], args)).toThrow(RangeError);
    const badLength: OcrPageInput = {
      ...page,
      image: { width: raster.width, height: raster.height, luminance: new Uint8Array(10) },
    };
    expect(() => ingestOcr([badLength], args)).toThrow(RangeError);
  });

  it("re-enables run styles for the words the visual heuristic marked (E9-T03)", () => {
    const { page } = styledPage();
    const doc = ingestOcr([page], {
      fileName: "scan.pdf",
      sha256: SHA,
      adapterVersion: "7.0.0",
    });

    const book = buildBook(doc);
    expect(() => parseBook(book)).not.toThrow();
    // The OCR contract of ADR-019/096 survives the style: the warning and
    // the calibrated base confidence stay.
    expect(book.extraction.warnings).toContain("ocr-text-layer");
    const paragraph = book.blocks.find((block) => block.kind === "paragraph");
    expect(paragraph?.confidence).toBe(OCR_TEXT_LAYER_CONFIDENCE);
    // The runs carry the estimated style word by word (neighbours with the
    // same style merge, so the plain pair comes out as one run).
    const runs = paragraph?.runs ?? [];
    const byText = (text: string) => runs.find((run) => run.text.includes(text));
    expect(byText("alpha")?.bold).toBeUndefined();
    expect(byText("alpha")?.italic).toBeUndefined();
    expect(byText("gamma")).toMatchObject({ bold: true });
    expect(byText("gamma")?.italic).toBeUndefined();
    expect(byText("delta")).toMatchObject({ italic: true });
    expect(byText("delta")?.bold).toBeUndefined();
  });
});
