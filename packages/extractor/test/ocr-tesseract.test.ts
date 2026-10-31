import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import {
  buildBook,
  createTesseractOcrEngine,
  ingestOcr,
  OCR_TEXT_LAYER_CONFIDENCE,
  TESSERACT_JS_VERSION,
} from "@pagepace/extractor";
import { describe, expect, it } from "vitest";

/**
 * E9-T02 integration: the real tesseract.js engine recognises a synthetic
 * page and the document flows through the unchanged pipeline.
 *
 * The page is drawn with @napi-rs/canvas (white background, black text —
 * the S7 recipe) and handed to the engine as PNG bytes. The traineddata
 * models come from the @tesseract.js-data devDependencies, unpacked into a
 * temp `langPath` (the spike's `prep` step, without a CDN — ADR-094). The
 * whole suite is skipped when a model is missing, so a machine without the
 * devDependencies still runs `pnpm verify`.
 */

(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
(globalThis as Record<string, unknown>).ImageData = ImageData;
(globalThis as Record<string, unknown>).Path2D = Path2D;

const repoRoot = path.join(import.meta.dirname, "..", "..", "..");

function modelGz(lang: string): string | null {
  const file = path.join(
    repoRoot,
    "node_modules",
    "@tesseract.js-data",
    lang,
    "4.0.0_best_int",
    `${lang}.traineddata.gz`,
  );
  return existsSync(file) ? file : null;
}

/** Unpacks por+eng best_int models into one temp dir (the S7 `prep` recipe). */
function prepareLangPath(): string | null {
  const gz = { eng: modelGz("eng"), por: modelGz("por") };
  if (!gz.eng || !gz.por) return null;
  const dir = mkdtempSync(path.join(tmpdir(), "pagepace-ocr-"));
  for (const lang of ["eng", "por"] as const) {
    const packed = gz[lang];
    if (!packed) continue;
    writeFileSync(path.join(dir, `${lang}.traineddata`), gunzipSync(readFileSync(packed)));
  }
  return dir;
}

/** One synthetic page: the sentence rendered large enough for the LSTM. */
async function renderSentencePng(text: string): Promise<Buffer> {
  const canvas = createCanvas(900, 300);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  ctx.font = "64px serif";
  ctx.fillText(text, 40, 120);
  ctx.fillText("Segunda linha do recorte.", 40, 220);
  // The Node worker reads Buffers (the S7 recipe); browsers get a Blob/URL.
  return Buffer.from(await canvas.encode("png"));
}

const langPath = prepareLangPath();
const describeEngine = langPath ? describe : describe.skip;

describeEngine("tesseract.js engine (E9-T02 integration)", () => {
  it("recognises a synthetic page into a Book through the unchanged pipeline", async () => {
    // cachePath inside the temp dir: without it the worker caches the unpacked
    // traineddata in the process cwd (the S7 trap — stray files in the repo).
    const engine = createTesseractOcrEngine({
      langPath: langPath as string,
      gzip: false,
      cachePath: langPath as string,
    });
    try {
      const lines = await engine.recognizePage(await renderSentencePng("PagePace OCR teste"));
      expect(lines.length).toBeGreaterThan(0);
      const text = lines
        .flatMap((l) => l.words)
        .map((w) => w.text)
        .join(" ");
      // LSTM on a clean render: the words must survive, case-insensitively.
      expect(text.toLowerCase()).toContain("pagepace");
      expect(text.toLowerCase()).toContain("ocr");

      const doc = ingestOcr(
        [
          {
            index: 0,
            imageWidth: 900,
            imageHeight: 300,
            lines,
          },
        ],
        { fileName: "synthetic.png", sha256: "c".repeat(64), adapterVersion: engine.version },
      );
      expect(doc.ingest).toEqual({ adapter: "ocr", adapterVersion: TESSERACT_JS_VERSION });
      expect(doc.source.ocrTextLayer).toBe(true);

      const book = buildBook(doc);
      expect(book.extraction.warnings).toContain("ocr-text-layer");
      // System fonts differ between machines, so the classifier may call the
      // short lines headings instead of paragraphs — whatever the kind, every
      // block must inherit the OCR confidence base (the pipeline is unchanged).
      expect(book.blocks.length).toBeGreaterThan(0);
      for (const block of book.blocks) {
        expect(block.confidence).toBeLessThanOrEqual(OCR_TEXT_LAYER_CONFIDENCE);
      }
      const bookText = book.blocks.map((block) => block.runs.map((r) => r.text).join("")).join(" ");
      expect(bookText.toLowerCase()).toContain("pagepace");
    } finally {
      await engine.close();
    }
  }, 120_000);

  it("reuses one worker across pages and shuts it down cleanly", async () => {
    const engine = createTesseractOcrEngine({
      langPath: langPath as string,
      gzip: false,
      cachePath: langPath as string,
    });
    try {
      const png = await renderSentencePng("Uma linha por vez");
      const first = await engine.recognizePage(png);
      const second = await engine.recognizePage(png);
      expect(first.length).toBeGreaterThan(0);
      expect(second.length).toBeGreaterThan(0);
    } finally {
      await engine.close();
    }
  }, 120_000);

  it("requires langPath so production never fetches models from a CDN (ADR-094)", () => {
    expect(() => createTesseractOcrEngine({ langPath: " " })).toThrow(RangeError);
  });
});

describe("tesseract.js engine packaging", () => {
  it("reports the exact tesseract.js version it was written against", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, "node_modules", "tesseract.js", "package.json"), "utf8"),
    ) as { version: string };
    expect(pkg.version).toBe(TESSERACT_JS_VERSION);
  });
});

// The temp langPath is only created when the models exist; clean it when the
// process exits so repeated runs do not pile up directories.
process.on("exit", () => {
  if (!langPath) return;
  try {
    rmSync(langPath, { recursive: true, force: true });
  } catch {
    // best effort — tmpdir cleanup is the OS's job anyway
  }
});
