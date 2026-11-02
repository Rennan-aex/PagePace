import type { RawDocument } from "@pagepace/schema";
import type { OcrEngine, OcrImage, OcrPageInput } from "./ocr";
import { ingestOcr, OCR_RENDER_SCALE } from "./ocr";
import type { OcrRaster } from "./ocr-style";

/**
 * Portable orchestrator of the scanned flow (E9-T04 / ADR-018): render one
 * page → recognise it → collect the lines → assemble a `RawDocument`, page
 * after page, reporting progress per page. Engine- and platform-agnostic
 * (rule 6): the caller injects a {@link renderPage} callback and an
 * {@link OcrEngine}; this module never imports pdf.js, the file system, a
 * worker or the clock, so the same pages always assemble the same document
 * (rule 7).
 *
 * The caller decides how each page is rendered (in Node the CLI draws with
 * pdf.js and `@napi-rs/canvas`; in the browser the app would use a
 * `<canvas>`); this module only sequences the calls, hands the rendered
 * image bytes to the engine, and feeds the recognised lines to `ingestOcr`
 * (E9-T02), which validates every page and flags `source.ocrTextLayer`
 * (ADR-096) — exactly what the pdf.js path expects of a scan.
 *
 * The engine is **not** closed here: the caller owns it and terminates the
 * worker when the document is done (ADR-095). Progress is reported after
 * each page is recognised (`{ page, total }`), so a host can drive a bar
 * or a "página N de M" counter without reimplementing the loop.
 */

/** What a rendered page looks like once the caller's {@link renderPage} is done. */
export interface OcrFlowRenderedPage {
  /**
   * The rendered page as image bytes (PNG in the tested path) — handed to
   * {@link OcrEngine.recognizePage}. In Node this is a `Buffer`/`Uint8Array`
   * the worker reads from memory or a temp file; in the browser a `Blob` or
   * object URL.
   */
  png: OcrImage;
  /** Rendered image width in pixels (what the canvas actually produced). */
  imageWidth: number;
  /** Rendered image height in pixels. */
  imageHeight: number;
  /**
   * Optional grayscale raster of the same size (E9-T03): when present the
   * visual heuristic estimates bold/italic/fontSize per recognised word;
   * absent, every word keeps the plain E9-T02 item.
   */
  image?: OcrRaster;
}

/** Per-page progress the orchestrator reports to the host. */
export interface OcrFlowProgress {
  /** 1-based number of the page just recognised. */
  page: number;
  /** Total pages in this run (the length of the page list). */
  total: number;
}

export interface OcrFlowOptions {
  /** Recorded as `source.fileName`; the orchestrator never opens files. */
  fileName: string;
  /** SHA-256 of the source PDF (the caller hashes the bytes, rule 1/6). */
  sha256: string;
  /** Total pages of the source PDF (may exceed `pages.length` for a range). */
  pageCount: number;
  /** 0-based page indexes to recognise; defaults to every page. */
  pages?: number[];
  /** Image pixels per page point used at render time; defaults to `OCR_RENDER_SCALE`. */
  scale?: number;
  /** The engine the caller created and will close (ADR-095). */
  engine: OcrEngine;
  /** Renders one 0-based page index; injected by the host (pdf.js, canvas…). */
  renderPage: (pageIndex: number) => Promise<OcrFlowRenderedPage>;
  /** Called after each page is recognised — drives the progress bar. */
  onProgress?: (progress: OcrFlowProgress) => void;
}

function resolvePageList(pageCount: number, pages: number[] | undefined): number[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new RangeError(`ingestOcrFlow: pageCount ${pageCount} must be an integer >= 1`);
  }
  const list = pages ?? Array.from({ length: pageCount }, (_, index) => index);
  if (list.length === 0) throw new RangeError("ingestOcrFlow: at least one page is required");
  for (const index of list) {
    if (!Number.isInteger(index) || index < 0 || index >= pageCount) {
      throw new RangeError(`ingestOcrFlow: page index ${index} outside 0..${pageCount - 1}`);
    }
  }
  return list;
}

/**
 * Runs the scanned flow end to end: render each requested page, recognise it
 * with `engine`, collect the {@link OcrPageInput}s and assemble the
 * `RawDocument` via `ingestOcr`. Pages are processed in list order (the
 * caller controls reading order); progress is reported **after** each page
 * completes, so `onProgress({ page: total, total })` is the last call before
 * the document is returned.
 *
 * Throws `RangeError` on bad `pageCount`/`pages`/`scale`; the render and
 * engine errors propagate unchanged so the host can surface them.
 */
export async function ingestOcrFlow(options: OcrFlowOptions): Promise<RawDocument> {
  const scale = options.scale ?? OCR_RENDER_SCALE;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`ingestOcrFlow: scale ${scale} must be a finite number > 0`);
  }
  if (!options.fileName.trim()) throw new RangeError("ingestOcrFlow: fileName is required");

  const pageList = resolvePageList(options.pageCount, options.pages);
  const collected: OcrPageInput[] = [];
  let done = 0;
  for (const pageIndex of pageList) {
    const rendered = await options.renderPage(pageIndex);
    const lines = await options.engine.recognizePage(rendered.png);
    collected.push({
      index: pageIndex,
      imageWidth: rendered.imageWidth,
      imageHeight: rendered.imageHeight,
      ...(rendered.image ? { image: rendered.image } : {}),
      lines,
    });
    done += 1;
    options.onProgress?.({ page: done, total: pageList.length });
  }

  return ingestOcr(collected, {
    fileName: options.fileName,
    sha256: options.sha256,
    pageCount: options.pageCount,
    scale,
    adapterVersion: options.engine.version,
  });
}
