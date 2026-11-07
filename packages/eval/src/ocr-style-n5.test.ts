import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createCanvas, DOMMatrix, ImageData, loadImage, Path2D } from "@napi-rs/canvas";
import { buildBook, createTesseractOcrEngine, ingestOcr } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { registerTestSerif, TEST_SERIF } from "../../extractor/test/test-fonts";
import { blockStyleF1 } from "./eval";
import type { Golden } from "./golden";

/**
 * E9-T03 acceptance: `style_f1` measured for an N5 (scanned) document.
 *
 * No N5 book in the corpus has a golden yet, so the scanned page is synthetic:
 * one canvas page with a regular line, a bold phrase and an italic phrase,
 * recognised by the real tesseract.js engine and estimated by the visual
 * heuristic (E9-T03). `blockStyleF1` — the very function the runner measures
 * with — scores the resulting `Book` against the in-memory golden, proving
 * that a scan can carry bold/italic with the OCR confidence contract intact.
 *
 * The suite is skipped when the traineddata models are missing, exactly like
 * the extractor's integration suite, so a machine without the devDependencies
 * still runs `pnpm verify`.
 */

(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
(globalThis as Record<string, unknown>).ImageData = ImageData;
(globalThis as Record<string, unknown>).Path2D = Path2D;
// ADR-099: draw with the bundled OFL face, never the system `serif`.
registerTestSerif();

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
  const dir = mkdtempSync(path.join(tmpdir(), "pagepace-ocr-style-"));
  for (const lang of ["eng", "por"] as const) {
    const packed = gz[lang];
    if (!packed) continue;
    writeFileSync(path.join(dir, `${lang}.traineddata`), gunzipSync(readFileSync(packed)));
  }
  return dir;
}

const WIDTH = 1100;
const HEIGHT = 420;

/** The scanned page: three lines, the last two carrying visible style. */
async function renderStyledPagePng(): Promise<Buffer> {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "black";
  ctx.font = `48px "${TEST_SERIF}"`;
  ctx.fillText("Uma linha simples de leitura", 60, 110);
  ctx.font = `bold 48px "${TEST_SERIF}"`;
  ctx.fillText("destacada em negrito", 60, 220);
  ctx.font = `italic 48px "${TEST_SERIF}"`;
  ctx.fillText("e um termo em italico", 60, 330);
  // The Node worker reads Buffers (the S7 recipe); browsers get a Blob/URL.
  return Buffer.from(await canvas.encode("png"));
}

/** Grayscale (BT.601 luma) of the very PNG the engine reads. */
async function rasterOf(
  png: Buffer,
): Promise<{ width: number; height: number; luminance: Uint8Array }> {
  const image = await loadImage(png);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const luminance = new Uint8Array(WIDTH * HEIGHT);
  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4;
    const red = pixels.data[offset] as number;
    const green = pixels.data[offset + 1] as number;
    const blue = pixels.data[offset + 2] as number;
    luminance[index] = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
  }
  return { width: WIDTH, height: HEIGHT, luminance };
}

const golden: Golden = {
  id: "syn-n5-pt-ocr-estilo",
  schemaVersion: "1.1.0",
  source: "synthetic",
  coverage: null,
  blocks: [
    {
      kind: "paragraph",
      runs: [
        { text: "Uma linha simples de leitura " },
        { text: "destacada em negrito ", bold: true },
        { text: "e um termo em italico", italic: true },
      ],
      origin: null,
    },
  ],
};

const langPath = prepareLangPath();
const describeStyle = langPath ? describe : describe.skip;

describeStyle("visual style on a scanned page (E9-T03 acceptance, level N5)", () => {
  it("measures style_f1 above the floor through engine + heuristic + pipeline", async () => {
    const png = await renderStyledPagePng();
    const raster = await rasterOf(png);
    const engine = createTesseractOcrEngine({
      langPath: langPath as string,
      gzip: false,
      cachePath: langPath as string,
    });
    try {
      const lines = await engine.recognizePage(png);
      expect(lines.length).toBeGreaterThan(0);

      const doc = ingestOcr(
        [
          {
            index: 0,
            imageWidth: WIDTH,
            imageHeight: HEIGHT,
            image: raster,
            lines,
          },
        ],
        { fileName: "synthetic-n5.png", sha256: "e".repeat(64), adapterVersion: engine.version },
      );
      const book = buildBook(doc);
      // The OCR contract survives: warning and the calibrated base stay.
      expect(book.extraction.warnings).toContain("ocr-text-layer");

      const styles = blockStyleF1(golden, doc);
      // Measured 0.9089 on this fixture (engine best_int, serif canvas page);
      // still above the 0,7 floor with the bundled Source Serif 4 (ADR-099).
      expect(styles.f1).toBeGreaterThanOrEqual(0.7);
    } finally {
      await engine.close();
    }
  }, 120_000);
});

process.on("exit", () => {
  if (!langPath) return;
  try {
    rmSync(langPath, { recursive: true, force: true });
  } catch {
    // best effort — tmpdir cleanup is the OS's job anyway
  }
});
