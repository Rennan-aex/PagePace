import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import type { OcrRaster, PdfjsAssets } from "@pagepace/extractor";
import { OCR_DEFAULT_LANGS } from "@pagepace/extractor";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Node adapter of the scanned flow (E9-T04): renders PDF pages for the OCR
 * engine and prepares the tesseract models. The extractor core stays free of
 * `fs`, workers and canvases (rule 6); the CLI is the platform layer.
 *
 * Rendering mirrors the S7 spike recipe: pdf.js draws each page onto an
 * `@napi-rs/canvas` at {@link OCR_RENDER_SCALE} (ADR-094), the PNG goes to
 * tesseract.js and the same pixels are reduced to a BT.601 grayscale raster
 * for the E9-T03 style heuristic. The pdf.js assets (wasm, standard fonts,
 * CMaps) are resolved from the installed `pdfjs-dist`, so scanned pages that
 * use JBIG2/JPX decode instead of rendering blank (S7 finding).
 */

// pdf.js checks for these DOM classes when it renders in Node (S7/N5 recipe);
// @napi-rs/canvas ships the implementations.
(globalThis as Record<string, unknown>).DOMMatrix ??= DOMMatrix;
(globalThis as Record<string, unknown>).ImageData ??= ImageData;
(globalThis as Record<string, unknown>).Path2D ??= Path2D;

/** Hint appended to the ADR-018 message when `--ocr` could run (E9-T04). */
export const SCANNED_OCR_HINT =
  "Dica: use --ocr para reconhecer o texto de um PDF escaneado (pode demorar).";

const requireFromCli = createRequire(import.meta.url);

/** pdf.js data paths with forward slashes and a trailing slash (S7 recipe). */
function toDataPath(dir: string): string {
  return `${dir.replace(/\\/g, "/").replace(/\/+$/, "")}/`;
}

/** Where the installed `pdfjs-dist` keeps fonts, CMaps and the WASM decoders. */
export function pdfjsAssets(): PdfjsAssets {
  const root = path.dirname(requireFromCli.resolve("pdfjs-dist/package.json"));
  return {
    standardFontDataUrl: toDataPath(path.join(root, "standard_fonts")),
    cMapUrl: toDataPath(path.join(root, "cmaps")),
    cMapPacked: true,
    wasmUrl: toDataPath(path.join(root, "wasm")),
  };
}

export interface OcrLangSetup {
  langPath: string;
  gzip: boolean;
  cachePath: string;
}

export type OcrLangResult = OcrLangSetup | { error: string };

function langsList(langs: string): string[] {
  return langs
    .split("+")
    .map((lang) => lang.trim())
    .filter(Boolean);
}

/** Path of the packed `best_int` model inside `@tesseract.js-data/<lang>`, or null. */
function modelGzPath(lang: string): string | null {
  try {
    const pkg = requireFromCli.resolve(`@tesseract.js-data/${lang}/package.json`);
    const gz = path.join(path.dirname(pkg), "4.0.0_best_int", `${lang}.traineddata.gz`);
    return existsSync(gz) ? gz : null;
  } catch {
    return null;
  }
}

/** Default cache of unpacked models (gitignored `.pagepace-cache/`, S7 trap). */
function defaultCacheRoot(): string {
  return path.join(process.cwd(), ".pagepace-cache", "ocr-lang");
}

/**
 * Unpacks the `@tesseract.js-data` models (por+eng by default) into the
 * gitignored cache and answers where the engine should look. Reuses files
 * already unpacked; a missing model is an error naming the fix, never a CDN
 * fetch (ADR-094).
 */
export function prepareOcrLangs(
  langs: string = OCR_DEFAULT_LANGS,
  cacheRoot: string = defaultCacheRoot(),
): OcrLangResult {
  const list = langsList(langs);
  if (list.length === 0) return { error: "Idiomas OCR vazios (--tessdata ou padrão por+eng)." };
  const dir = path.join(cacheRoot, list.join("+"));
  for (const lang of list) {
    const target = path.join(dir, `${lang}.traineddata`);
    if (existsSync(target)) continue;
    const gz = modelGzPath(lang);
    if (gz === null) {
      return {
        error:
          `Modelo OCR '${lang}' não encontrado. Rode pnpm install (as devDependencies ` +
          `@tesseract.js-data carregam os modelos) ou aponte --tessdata para uma pasta ` +
          `com ${lang}.traineddata ou ${lang}.traineddata.gz.`,
      };
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(target, gunzipSync(readFileSync(gz)));
  }
  return { langPath: dir, gzip: false, cachePath: dir };
}

/** Validates a `--tessdata` directory (packed or unpacked models per language). */
export function tessdataSetup(dir: string, langs: string = OCR_DEFAULT_LANGS): OcrLangResult {
  const list = langsList(langs);
  if (list.length === 0) return { error: "Idiomas OCR vazios." };
  if (!existsSync(dir)) return { error: `Pasta --tessdata não encontrada: ${dir}` };
  if (list.every((lang) => existsSync(path.join(dir, `${lang}.traineddata`)))) {
    return { langPath: dir, gzip: false, cachePath: dir };
  }
  if (list.every((lang) => existsSync(path.join(dir, `${lang}.traineddata.gz`)))) {
    return { langPath: dir, gzip: true, cachePath: dir };
  }
  return {
    error: `--tessdata precisa conter ${list.map((lang) => `${lang}.traineddata(.gz)`).join(", ")}.`,
  };
}

/** One rendered page: the PNG for the engine plus the grayscale raster. */
export interface OcrRenderedPage {
  png: Buffer;
  imageWidth: number;
  imageHeight: number;
  image: OcrRaster;
}

export interface OcrRenderer {
  pageCount: number;
  renderPage(pageIndex: number): Promise<OcrRenderedPage>;
  close(): Promise<void>;
}

/**
 * Opens `bytes` with pdf.js and renders pages at `scale` for the OCR flow.
 * One document stays open for the whole run; `close()` tears the pdf.js task
 * down. Each page is drawn on a white canvas, encoded as PNG and reduced to
 * a BT.601 luminance raster of the very same pixels.
 */
export async function createOcrRenderer(bytes: Uint8Array, scale: number): Promise<OcrRenderer> {
  const task = getDocument({ data: bytes.slice(), verbosity: 0, ...pdfjsAssets() });
  const pdf = await task.promise;
  return {
    pageCount: pdf.numPages,
    async renderPage(pageIndex: number): Promise<OcrRenderedPage> {
      const page = await pdf.getPage(pageIndex + 1);
      try {
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({
          canvasContext: context,
          // pdf.js types demand `canvas` although the runtime defaults it to
          // null when `canvasContext` carries the surface (ADR-075).
          canvas: null,
          viewport,
          background: "#ffffff",
        } as never).promise;
        const png = canvas.toBuffer("image/png");
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const luminance = new Uint8Array(canvas.width * canvas.height);
        for (let index = 0; index < luminance.length; index += 1) {
          const offset = index * 4;
          const red = pixels.data[offset] as number;
          const green = pixels.data[offset + 1] as number;
          const blue = pixels.data[offset + 2] as number;
          luminance[index] = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
        }
        return {
          png,
          imageWidth: canvas.width,
          imageHeight: canvas.height,
          image: { width: canvas.width, height: canvas.height, luminance },
        };
      } finally {
        page.cleanup();
      }
    },
    async close(): Promise<void> {
      await task.destroy().catch(() => undefined);
    },
  };
}
