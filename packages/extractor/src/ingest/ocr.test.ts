import type { RawTextItem } from "@pagepace/schema";
import { parseBook } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildBook, OCR_TEXT_LAYER_CONFIDENCE } from "../book";
import { classifyFontName } from "../fontstyle";
import type { OcrLine, OcrPageInput, OcrWord } from "./ocr";
import { ingestOcr, OCR_FONT_NAME, OCR_RENDER_SCALE, ocrPageToRawPage } from "./ocr";

/**
 * E9-T02: the engine-agnostic OCR core.
 *
 * Word boxes arrive in image pixels (origin top-left, y down — the tesseract
 * layout) and leave as page points divided by the render scale; every word
 * becomes one `RawTextItem` with the neutral face `"unknown"` and no flags
 * (E9-T02 ships without style — E9-T03 adds it). `ingestOcr` flags the
 * document `source.ocrTextLayer` so the existing pipeline (`buildBook`)
 * lowers the confidence base, warns `ocr-text-layer` and keeps the runs
 * plain **without any pipeline change** — the E9-T02 acceptance, measured
 * here against the real builder.
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

  it("classifies the neutral face with no style signal (E9-T03 will add style)", () => {
    expect(classifyFontName(OCR_FONT_NAME)).toMatchObject({
      bold: false,
      italic: false,
    });
  });
});
