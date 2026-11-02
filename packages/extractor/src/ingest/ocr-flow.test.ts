import type { RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildBook } from "../book";
import type { OcrEngine, OcrLine, OcrWord } from "./ocr";
import { ingestOcrFlow } from "./ocr-flow";
import type { OcrRaster } from "./ocr-style";

/**
 * E9-T04: the portable orchestrator of the scanned flow.
 *
 * A fake engine and a fake renderer stand in for tesseract.js and pdf.js +
 * canvas, so this suite runs without models, workers or the file system
 * (rule 6). What it proves: pages are rendered and recognised in order,
 * progress is reported after each page, the raster reaches `ingestOcr`
 * (so E9-T03 style estimation still applies), and the assembled document
 * carries the OCR contract (`source.ocrTextLayer`, calibrated confidence).
 */

function word(text: string, x0: number, y0: number, x1: number, y1: number): OcrWord {
  return { text, bbox: { x0, y0, x1, y1 }, confidence: 90 };
}

function line(words: OcrWord[]): OcrLine {
  return { words };
}

const SHA = "c".repeat(64);

/** Engine stub: recognises a fixed word per call, counts the calls. */
function fakeEngine(version = "7.0.0"): OcrEngine & { calls: number } {
  const engine = {
    version,
    calls: 0,
    async recognizePage(): Promise<readonly OcrLine[]> {
      engine.calls += 1;
      return [line([word(`page${engine.calls}`, 10, 10, 110, 30)])];
    },
    async close(): Promise<void> {},
  };
  return engine;
}

/** Renderer stub: reports the requested index and returns a blank raster. */
function fakeRender(width = 200, height = 40) {
  const requested: number[] = [];
  const renderPage = async (pageIndex: number) => {
    requested.push(pageIndex);
    const image: OcrRaster = { width, height, luminance: new Uint8Array(width * height).fill(255) };
    return {
      png: new Uint8Array([1, 2, 3]),
      imageWidth: width,
      imageHeight: height,
      image,
    };
  };
  return { requested, renderPage };
}

function itemsText(items: readonly RawTextItem[]): string {
  return items.map((item) => item.text).join("|");
}

describe("ingestOcrFlow", () => {
  it("renders and recognises every page in order, then assembles the document", async () => {
    const engine = fakeEngine();
    const { requested, renderPage } = fakeRender();
    const progress: Array<{ page: number; total: number }> = [];

    const doc = await ingestOcrFlow({
      fileName: "scan.pdf",
      sha256: SHA,
      pageCount: 3,
      engine,
      renderPage,
      onProgress: (value) => progress.push(value),
    });

    expect(requested).toEqual([0, 1, 2]);
    expect(engine.calls).toBe(3);
    expect(progress).toEqual([
      { page: 1, total: 3 },
      { page: 2, total: 3 },
      { page: 3, total: 3 },
    ]);
    expect(doc.source.pageCount).toBe(3);
    expect(doc.source.ocrTextLayer).toBe(true);
    expect(doc.ingest).toEqual({ adapter: "ocr", adapterVersion: "7.0.0" });
    expect(doc.pages.map((page) => itemsText(page.items))).toEqual(["page1", "page2", "page3"]);
  });

  it("recognises only the caller-chosen pages and keeps the full pageCount", async () => {
    const engine = fakeEngine();
    const { requested, renderPage } = fakeRender();
    const progress: Array<{ page: number; total: number }> = [];

    const doc = await ingestOcrFlow({
      fileName: "scan.pdf",
      sha256: SHA,
      pageCount: 10,
      pages: [4, 9],
      engine,
      renderPage,
      onProgress: (value) => progress.push(value),
    });

    expect(requested).toEqual([4, 9]);
    expect(doc.source.pageCount).toBe(10);
    expect(doc.pages.map((page) => page.index)).toEqual([4, 9]);
    expect(progress).toEqual([
      { page: 1, total: 2 },
      { page: 2, total: 2 },
    ]);
  });

  it("passes a custom scale through to the boxes", async () => {
    const engine = fakeEngine();
    const { renderPage } = fakeRender(400, 80);

    const doc = await ingestOcrFlow({
      fileName: "scan.pdf",
      sha256: SHA,
      pageCount: 1,
      scale: 4,
      engine,
      renderPage,
    });

    // 400 px / 4 = 100 pt wide page; the word box 10..110 px becomes 2.5..27.5 pt.
    expect(doc.pages[0]?.width).toBe(100);
    expect(doc.pages[0]?.items[0]).toMatchObject({ x: 2.5, y: 2.5, width: 25, height: 5 });
  });

  it("forwards the raster so the visual style heuristic still runs (E9-T03)", async () => {
    // Three words so the page median exists and sits on the regular stems
    // (OCR_STYLE_MIN_MEASURED_WORDS = 2; median of [2, 2, 5] = 2, so the
    // 5 px stems of "gamma" clear OCR_BOLD_STROKE_RATIO — the ocr.test.ts
    // recipe). The renderer stub hands the raster; the engine returns the boxes.
    const width = 240;
    const height = 40;
    const luminance = new Uint8Array(width * height).fill(255);
    const inkRect = (x: number, y: number, w: number, h: number): void => {
      for (let row = y; row < y + h; row += 1) {
        for (let column = x; column < x + w; column += 1) {
          luminance[row * width + column] = 0;
        }
      }
    };
    const stems = (x: number, y: number, stem: number, h: number): void => {
      for (let index = 0; index < 3; index += 1) inkRect(x + index * 12, y, stem, h);
    };
    stems(12, 12, 2, 16); // alpha, regular
    stems(62, 12, 2, 16); // beta, regular
    stems(112, 12, 5, 16); // gamma, bold
    const engine: OcrEngine = {
      version: "7.0.0",
      async recognizePage(): Promise<readonly OcrLine[]> {
        return [
          line([
            word("alpha", 10, 8, 48, 32),
            word("beta", 60, 8, 98, 32),
            word("gamma", 110, 8, 148, 32),
          ]),
        ];
      },
      async close(): Promise<void> {},
    };
    const renderPage = async () => ({
      png: new Uint8Array([1]),
      imageWidth: width,
      imageHeight: height,
      image: { width, height, luminance } satisfies OcrRaster,
    });

    const doc = await ingestOcrFlow({
      fileName: "scan.pdf",
      sha256: SHA,
      pageCount: 1,
      engine,
      renderPage,
    });

    // alpha/beta stay plain; gamma is heavier than the page median → bold.
    expect(doc.pages[0]?.items[0]?.fontFlags).toEqual({ bold: false, italic: false });
    expect(doc.pages[0]?.items[1]?.fontFlags).toEqual({ bold: false, italic: false });
    expect(doc.pages[0]?.items[2]?.fontFlags).toEqual({ bold: true, italic: false });
    const book = buildBook(doc);
    expect(book.extraction.warnings).toContain("ocr-text-layer");
    const paragraph = book.blocks.find((block) => block.kind === "paragraph");
    const byText = (text: string) => paragraph?.runs.find((run) => run.text.includes(text));
    expect(byText("alpha")?.bold).toBeUndefined();
    expect(byText("gamma")).toMatchObject({ bold: true });
  });

  it("rejects unusable input with RangeError before rendering anything", async () => {
    const engine = fakeEngine();
    const { requested, renderPage } = fakeRender();
    const base = { fileName: "scan.pdf", sha256: SHA, engine, renderPage };

    await expect(ingestOcrFlow({ ...base, pageCount: 0 })).rejects.toThrow(RangeError);
    await expect(ingestOcrFlow({ ...base, pageCount: 1.5 })).rejects.toThrow(RangeError);
    await expect(ingestOcrFlow({ ...base, pageCount: 1, pages: [] })).rejects.toThrow(RangeError);
    await expect(ingestOcrFlow({ ...base, pageCount: 2, pages: [2] })).rejects.toThrow(RangeError);
    await expect(ingestOcrFlow({ ...base, pageCount: 2, pages: [-1] })).rejects.toThrow(RangeError);
    await expect(ingestOcrFlow({ ...base, pageCount: 1, scale: 0 })).rejects.toThrow(RangeError);
    await expect(ingestOcrFlow({ ...base, pageCount: 1, scale: Number.NaN })).rejects.toThrow(
      RangeError,
    );
    await expect(ingestOcrFlow({ ...base, pageCount: 1, fileName: " " })).rejects.toThrow(
      RangeError,
    );
    expect(requested).toEqual([]);
  });

  it("does not close the engine: the caller owns it (ADR-095)", async () => {
    let closed = 0;
    const engine: OcrEngine = {
      version: "7.0.0",
      async recognizePage(): Promise<readonly OcrLine[]> {
        return [line([word("ok", 10, 10, 40, 30)])];
      },
      async close(): Promise<void> {
        closed += 1;
      },
    };
    const renderPage = async () => ({
      png: new Uint8Array([1]),
      imageWidth: 200,
      imageHeight: 40,
    });

    await ingestOcrFlow({
      fileName: "scan.pdf",
      sha256: SHA,
      pageCount: 1,
      engine,
      renderPage,
    });
    expect(closed).toBe(0);
  });
});
