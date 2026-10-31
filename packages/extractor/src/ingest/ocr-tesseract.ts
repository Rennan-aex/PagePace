import type { Worker } from "tesseract.js";
import { createWorker, OEM } from "tesseract.js";
import type { OcrEngine, OcrImage, OcrLine, OcrWord } from "./ocr";

/**
 * tesseract.js implementation of {@link OcrEngine} (E9-T02, ADR-094/095).
 *
 * One worker is created on the first page and reused for the whole document
 * (the S7 spike measured a ~300 ms cold start and 1.5–2.9 s/page warm; a
 * fresh worker per page would pay the cold start every time). The engine
 * runs LSTM-only (OEM 1) with the `best_int` models shipped by
 * `@tesseract.js-data` — `langPath` is **required** so production never
 * fetches models from a CDN (ADR-094). Pass `gzip: false` when the
 * `langPath` directory holds unpacked `.traineddata` files (the spike's
 * recipe); the default expects the packaged `.traineddata.gz`.
 *
 * The core never imports this module (rule 6): the CLI and the app choose
 * the engine and hand the recognised lines to `ingestOcr`. `close()` must be
 * called when the document is done — it terminates the worker.
 */

/** Exact `tesseract.js` version this adapter was written against. */
export const TESSERACT_JS_VERSION = "7.0.0";

/** Default languages (ADR-094): Portuguese + English, packed locally. */
export const OCR_DEFAULT_LANGS = "por+eng";

export interface TesseractOcrEngineOptions {
  /**
   * Directory holding the `*.traineddata(.gz)` files — required, production
   * never downloads models from a CDN (ADR-094). In Node point it at the
   * unpacked `@tesseract.js-data/{lang}/{variant}` folders (or a folder that
   * merges them); in the browser point it at your static assets.
   */
  langPath: string;
  /** Tesseract language spec; defaults to {@link OCR_DEFAULT_LANGS}. */
  langs?: string;
  /** True when `langPath` holds `.traineddata.gz` (the npm default). */
  gzip?: boolean;
  /**
   * Scratch directory for the model cache. **Set it in Node**: without it the
   * worker writes the unpacked `*.traineddata` into the process cwd (S7
   * trap — stray files in the repo). Point it at the same directory as
   * `langPath` when the models are already unpacked there.
   */
  cachePath?: string;
}

function wordsOf(line: { words?: readonly unknown[] } | undefined): OcrWord[] {
  const words: OcrWord[] = [];
  for (const raw of line?.words ?? []) {
    const word = raw as {
      text?: unknown;
      confidence?: unknown;
      bbox?: { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown };
    };
    if (typeof word.text !== "string" || word.text.trim() === "") continue;
    const bbox = word.bbox;
    if (!bbox) continue;
    words.push({
      text: word.text,
      bbox: {
        x0: Number(bbox.x0) || 0,
        y0: Number(bbox.y0) || 0,
        x1: Number(bbox.x1) || 0,
        y1: Number(bbox.y1) || 0,
      },
      confidence: typeof word.confidence === "number" ? word.confidence : 0,
    });
  }
  return words;
}

/**
 * Creates an engine over one reused tesseract.js worker. The worker boots
 * lazily on the first {@link OcrEngine.recognizePage} call, so constructing
 * the engine is free when no page is ever recognised.
 */
export function createTesseractOcrEngine(options: TesseractOcrEngineOptions): OcrEngine {
  if (!options.langPath.trim()) {
    throw new RangeError("createTesseractOcrEngine: langPath is required (no CDN, ADR-094)");
  }
  const langs = options.langs ?? OCR_DEFAULT_LANGS;
  let workerPromise: Promise<Worker> | null = null;

  const workerOf = (): Promise<Worker> => {
    workerPromise ??= createWorker(langs, OEM.LSTM_ONLY, {
      langPath: options.langPath,
      ...(options.gzip !== undefined ? { gzip: options.gzip } : {}),
      ...(options.cachePath ? { cachePath: options.cachePath } : {}),
    });
    return workerPromise;
  };

  return {
    version: TESSERACT_JS_VERSION,
    async recognizePage(image: OcrImage): Promise<readonly OcrLine[]> {
      const worker = await workerOf();
      // `blocks: true` is what keeps the line/word boxes in the result —
      // without it the worker returns only the plain text (S7 recipe).
      const { data } = await worker.recognize(image, {}, { blocks: true });
      const lines: OcrLine[] = [];
      for (const block of data.blocks ?? []) {
        for (const paragraph of block?.paragraphs ?? []) {
          for (const line of paragraph?.lines ?? []) {
            const words = wordsOf(line);
            if (words.length > 0) lines.push({ words });
          }
        }
      }
      return lines;
    },
    async close(): Promise<void> {
      const pending = workerPromise;
      workerPromise = null;
      if (pending) await (await pending).terminate();
    },
  };
}
