import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { parseWith, rawDocumentSchema, rawPageSchema, SCHEMA_VERSION } from "@pagepace/schema";
import type { OcrRaster } from "./ocr-style";
import { estimatePageWordStyles, OCR_STYLE_MIN_CONFIDENCE } from "./ocr-style";

/**
 * OCR ingestion core (E9-T02): recognised words in, validated
 * `RawDocument` out — engine-agnostic and free of platform APIs (rule 6).
 *
 * The engine sits behind {@link OcrEngine}; the tesseract.js implementation
 * lives in `./ocr-tesseract` so this module never imports a worker, the file
 * system or the clock (ADR-095). Callers render each PDF page to an image
 * (scale {@link OCR_RENDER_SCALE}, ADR-094), hand the bytes to an engine and
 * feed the recognised lines here; the assembled document passes the
 * `@pagepace/schema` validator and flows through `buildBook` unchanged — the
 * pipeline already treats a document flagged `source.ocrTextLayer` exactly as
 * this adapter needs (calibrated low confidence, no styles, `ocr-text-layer`
 * warning; ADR-019/096).
 *
 * Coordinates: tesseract.js reports word boxes in image pixels with the
 * origin at the top-left and y growing down — the very orientation the schema
 * wants, only in a different unit. Dividing by the render `scale` converts
 * pixels to page points (ADR-074 keeps page coordinates in points).
 *
 * Style (E9-T03): when the caller also hands the page raster
 * ({@link OcrPageInput.image}), the visual heuristic of `./ocr-style`
 * estimates bold/italic (stroke width, shear) and the font size (x-height)
 * per word. Confident words carry `fontFlags` and a page-calibrated
 * `fontSize`; the rest — and every word of a raster-less page — keeps the
 * E9-T02 plain item. `fontFlags.bold`/`italic` are the unique signal of
 * "style estimated from the image": the pdf.js path never emits them, so
 * `buildBook` re-enables run styles for exactly these documents while the
 * confidence base and the `ocr-text-layer` warning stay (ADR-096 leaves the
 * call to this task).
 *
 * Determinism (rule 7): same words, same boxes, same raster, same document —
 * no clock, no randomness. The word-level confidence the engine reports
 * gates the style (a doubtful word never gets flags) but is not part of the
 * schema.
 */

/** Render scale the adapter assumes: image pixels per page point (ADR-094). */
export const OCR_RENDER_SCALE = 2;

/** Neutral face for OCR words — the schema requires a non-empty name (E9-T02). */
export const OCR_FONT_NAME = "unknown";

/** Minimum page points a word box must span to become an item (degenerate boxes are dropped). */
export const OCR_MIN_WORD_POINTS = 0.5;

/** One recognised word with its box in image pixels, origin top-left, y down. */
export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Engine confidence 0–100; below the E9-T03 floor the word keeps no style. */
  confidence: number;
}

/** One recognised line: its words in reading order. */
export interface OcrLine {
  words: readonly OcrWord[];
}

/** What an {@link OcrEngine} accepts: a PNG (or similar) as bytes or a path/URL. */
export type OcrImage = Uint8Array | string;

/**
 * Engine behind the adapter (ADR-095): recognises one page image and returns
 * its lines. `version` is recorded as `ingest.adapterVersion`, so the same
 * engine version always produces the same document.
 */
export interface OcrEngine {
  readonly version: string;
  recognizePage(image: OcrImage): Promise<readonly OcrLine[]>;
  close(): Promise<void>;
}

/** One recognised page, with the image size the renderer produced. */
export interface OcrPageInput {
  /** 0-based page index. */
  index: number;
  /** Rendered image width in pixels. */
  imageWidth: number;
  /** Rendered image height in pixels. */
  imageHeight: number;
  /**
   * The rendered page as grayscale pixels (E9-T03), same size as
   * `imageWidth` × `imageHeight`. When present the visual heuristic
   * estimates bold/italic/fontSize per word; absent, every word keeps the
   * plain E9-T02 item.
   */
  image?: OcrRaster;
  /** Recognised lines in reading order. */
  lines: readonly OcrLine[];
}

export interface OcrIngestOptions {
  /** Recorded as `source.fileName`; the adapter never opens files. */
  fileName: string;
  /** SHA-256 of the source PDF (the caller hashes the bytes, rule 1/6). */
  sha256: string;
  /**
   * Total pages of the source PDF. May exceed `pages.length` when only a
   * range was recognised. Defaults to the highest page index + 1.
   */
  pageCount?: number;
  /**
   * Image pixels per page point used at render time (ADR-094: 2). Must be a
   * finite number > 0; every box and the page size are divided by it.
   */
  scale?: number;
  /** Engine version recorded as `ingest.adapterVersion`. */
  adapterVersion: string;
}

/**
 * Converts one recognised page into a `RawPage`: every word becomes a
 * `RawTextItem` whose box is the word box in page points, the last word of
 * each line carries `hasEOL` (so `itemsText` keeps the printed line breaks)
 * and empty or degenerate words are dropped. The page size is the image size
 * divided by `scale`, and the rotation is always 0 — the renderer already
 * applied any page rotation.
 *
 * With a raster on the page (E9-T03), each word's estimated style lands on
 * the item: `fontFlags.bold`/`italic` and a page-calibrated `fontSize` when
 * both the image and the engine are confident, the plain box estimate
 * otherwise. The scale divides the pixel measurements into points.
 */
export function ocrPageToRawPage(page: OcrPageInput, scale: number = OCR_RENDER_SCALE): RawPage {
  const words = page.lines.flatMap((line) => line.words);
  const estimated = page.image ? estimatePageWordStyles(page.image, words) : null;
  const items: RawTextItem[] = [];
  let cursor = 0;
  for (const line of page.lines) {
    const last = line.words.length - 1;
    line.words.forEach((word, index) => {
      const style = estimated?.[cursor];
      cursor += 1;
      const text = word.text.trim();
      if (text === "") return;
      const width = (word.bbox.x1 - word.bbox.x0) / scale;
      const height = (word.bbox.y1 - word.bbox.y0) / scale;
      if (!(width >= OCR_MIN_WORD_POINTS) || !(height >= OCR_MIN_WORD_POINTS)) return;
      const trusted = style !== undefined && style.styleConfidence >= OCR_STYLE_MIN_CONFIDENCE;
      const item: RawTextItem = {
        text,
        x: word.bbox.x0 / scale,
        y: word.bbox.y0 / scale,
        width,
        height,
        fontName: OCR_FONT_NAME,
        fontSize: trusted && style.fontSize !== undefined ? style.fontSize / scale : height,
      };
      if (trusted) item.fontFlags = { bold: style.bold, italic: style.italic };
      if (index === last) item.hasEOL = true;
      items.push(item);
    });
  }
  return {
    index: page.index,
    width: page.imageWidth / scale,
    height: page.imageHeight / scale,
    rotation: 0,
    items,
  };
}

/**
 * Assembles recognised pages into a `RawDocument` that passes the
 * `@pagepace/schema` validator (throws `SchemaValidationError` otherwise).
 *
 * The document is flagged `source.ocrTextLayer: true` (ADR-096): the text did
 * not come from a digital text layer, so `buildBook` lowers the confidence
 * base to `OCR_TEXT_LAYER_CONFIDENCE` and warns `ocr-text-layer` — unchanged.
 * Runs stay plain unless the caller supplied page rasters and the visual
 * heuristic (E9-T03) stamped `fontFlags` on the words, in which case the
 * pipeline re-enables styles for exactly those words.
 * Every page is validated as it is built and the envelope is validated
 * without its pages (the E8-T03 pattern): a long scan is never rebuilt in
 * one piece.
 */
export function ingestOcr(pages: readonly OcrPageInput[], options: OcrIngestOptions): RawDocument {
  if (!options.fileName.trim()) throw new RangeError("ingestOcr: fileName is required");
  if (pages.length === 0) throw new RangeError("ingestOcr: at least one page is required");
  const scale = options.scale ?? OCR_RENDER_SCALE;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`ingestOcr: scale ${scale} must be a finite number > 0`);
  }
  for (const page of pages) {
    if (!Number.isInteger(page.index) || page.index < 0) {
      throw new RangeError(`ingestOcr: page index ${page.index} must be an integer >= 0`);
    }
    if (page.image !== undefined) {
      const { image } = page;
      if (image.width !== page.imageWidth || image.height !== page.imageHeight) {
        throw new RangeError(
          `ingestOcr: page ${page.index} image ${image.width}x${image.height} ` +
            `must match imageWidth/imageHeight ${page.imageWidth}x${page.imageHeight}`,
        );
      }
      if (image.luminance.length !== image.width * image.height) {
        throw new RangeError(
          `ingestOcr: page ${page.index} luminance length ${image.luminance.length} ` +
            `must equal width * height ${image.width * image.height}`,
        );
      }
    }
  }

  const rawPages: RawPage[] = [];
  let highestIndex = -1;
  for (const page of pages) {
    if (page.index > highestIndex) highestIndex = page.index;
    rawPages.push(parseWith(rawPageSchema, ocrPageToRawPage(page, scale), "RawPage"));
  }

  const pageCount = options.pageCount ?? highestIndex + 1;
  const document: RawDocument = {
    schemaVersion: SCHEMA_VERSION,
    source: {
      fileName: options.fileName,
      sha256: options.sha256,
      pageCount,
      tagged: false,
      ocrTextLayer: true,
    },
    pages: rawPages,
    ingest: { adapter: "ocr", adapterVersion: options.adapterVersion },
  };

  const envelope = parseWith(rawDocumentSchema, { ...document, pages: [] }, "RawDocument");
  envelope.pages = rawPages;
  return envelope;
}
