import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  countRenderModeChars,
  ingestPdfjs,
  isOcrTextLayer,
  OCR_TEXT_LAYER_MAJORITY,
  SCANNED_PDF_MESSAGE,
  ScannedPdfError,
} from "@pagepace/extractor";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

/**
 * E1-T03: the two text-layer detectors.
 *
 * Detector A (ADR-018) — a PDF with no text layer is a scan: the adapter
 * refuses to build a `RawDocument` and reports the exact message.
 * Detector B (ADR-019) — a PDF whose characters are mostly drawn with the
 * invisible rendering mode (`Tr 3`) carries an embedded OCR layer: the
 * document is flagged `source.ocrTextLayer`.
 *
 * The synthetic cases always run in CI; the corpus cases need
 * `$CORPUS_PRIVATE_DIR` (or `.env`) and are skipped when the files are absent.
 */

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

function privateCorpusDir(): string {
  const fromEnv = process.env.CORPUS_PRIVATE_DIR?.trim();
  if (fromEnv) return fromEnv;
  const dotEnv = path.join(repoRoot, ".env");
  if (!existsSync(dotEnv)) return "";
  for (const line of readFileSync(dotEnv, "utf8").split(/\r?\n/)) {
    const match = /^CORPUS_PRIVATE_DIR\s*=\s*(.+)$/.exec(line.trim());
    if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const privateCorpus = privateCorpusDir();
const corpusFile = (id: string): string => path.join(privateCorpus, `${id}.pdf`);

describe("detector A - no text layer at all (ADR-018)", () => {
  it("refuses a PDF without text, with the exact message and no document", async () => {
    const bytes = buildPdf([""]); // a page with nothing but an empty content stream
    const error = await ingestPdfjs(bytes, { fileName: "scan.pdf" }).catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(ScannedPdfError);
    expect((error as Error).name).toBe("ScannedPdfError");
    expect((error as Error).message).toBe(SCANNED_PDF_MESSAGE);
    expect((error as Error).message).toBe("PDF escaneado: leitura exige OCR, ainda não disponível");
  });

  it("accepts an image-only page when another page of the document has text", async () => {
    const bytes = buildPdf(["", textStream("page two"), ""]);
    const document = await ingestPdfjs(bytes, { fileName: "cover.pdf" });

    expect(document.source.pageCount).toBe(3);
    expect(document.pages[0]?.items).toEqual([]);
    expect(document.pages[1]?.items.map((item) => item.text)).toEqual(["page two"]);
    expect(document.source.ocrTextLayer).toBeUndefined();
  });
});

describe("detector B - invisible OCR text layer (ADR-019)", () => {
  it("flags a document whose characters are all drawn with Tr 3", async () => {
    const bytes = buildPdf([textStream("hidden OCR layer", { renderMode: 3 })]);
    const document = await ingestPdfjs(bytes, { fileName: "ocr.pdf" });

    expect(document.source.ocrTextLayer).toBe(true);
    // The text is still extracted: ADR-019 keeps the book readable.
    expect(document.pages[0]?.items.map((item) => item.text)).toEqual(["hidden OCR layer"]);
  });

  it("flags a document only when invisible characters are the majority", async () => {
    // A producer that wants visible text after an invisible block sets `Tr 0`
    // again (or wraps the block in `q`/`Q`): text state outlives `BT`/`ET`.
    const mostlyVisible = buildPdf([
      `${textStream("hidden", { renderMode: 3 })}\n${textStream(
        "visible text with plenty of characters",
        { renderMode: 0 },
      )}`,
    ]);
    const mostlyInvisible = buildPdf([
      `${textStream("invisible OCR layer of many characters", { renderMode: 3 })}\n${textStream(
        "ok",
        { renderMode: 0 },
      )}`,
    ]);

    const visible = await ingestPdfjs(mostlyVisible, { fileName: "mixed-visible.pdf" });
    const invisible = await ingestPdfjs(mostlyInvisible, { fileName: "mixed-invisible.pdf" });

    expect(visible.source.ocrTextLayer).toBeUndefined();
    expect(invisible.source.ocrTextLayer).toBe(true);
  });

  it("leaves a normal digital PDF untouched (no flag at all)", async () => {
    const bytes = buildPdf([textStream("ordinary digital text"), textStream("second page")]);
    const document = await ingestPdfjs(bytes, { fileName: "digital.pdf" });

    expect(document.source.ocrTextLayer).toBeUndefined();
    expect(JSON.stringify(document)).not.toContain("ocrTextLayer");
  });

  it("counts Tr 3 characters from a pdf.js operator list", () => {
    const ops = {
      fnArray: [
        OPS.setTextRenderingMode,
        OPS.showText,
        OPS.setTextRenderingMode,
        OPS.showText,
        OPS.showSpacedText,
      ],
      argsArray: [[3], [[{ unicode: "a" }, { unicode: "b" }]], [0], [[{ unicode: "c" }]], ["de"]],
    };

    expect(countRenderModeChars(ops)).toEqual({ total: 5, invisible: 2 });

    // `q ... Q` (measured against pdf.js 6.4.299): pdf.js emits save/restore
    // and does not repeat `setTextRenderingMode`, so the mode must come back
    // from the stack instead of staying invisible.
    const wrapped = {
      fnArray: [OPS.save, OPS.setTextRenderingMode, OPS.showText, OPS.restore, OPS.showText],
      argsArray: [null, [3], [[{ unicode: "a" }]], null, [[{ unicode: "b" }, { unicode: "c" }]]],
    };
    expect(countRenderModeChars(wrapped)).toEqual({ total: 3, invisible: 1 });

    expect(OCR_TEXT_LAYER_MAJORITY).toBe(0.5);
    // "Majority" means strictly more than half (ADR-019).
    expect(isOcrTextLayer([{ total: 3, invisible: 2 }])).toBe(true);
    expect(isOcrTextLayer([{ total: 4, invisible: 2 }])).toBe(false);
    expect(isOcrTextLayer([{ total: 0, invisible: 0 }])).toBe(false);
    expect(isOcrTextLayer([])).toBe(false);
  });
});

describe("detectors against the real corpus (skipped without $CORPUS_PRIVATE_DIR)", () => {
  const scanned = corpusFile("n5-pt-astrofisica");
  it.skipIf(!existsSync(scanned))(
    "n5-pt-astrofisica: image-only PDF rejected with the ADR-018 message",
    async () => {
      const bytes = new Uint8Array(await readFile(scanned));
      const error = await ingestPdfjs(bytes, { fileName: "n5-pt-astrofisica.pdf" }).catch(
        (cause: unknown) => cause,
      );

      expect(error).toBeInstanceOf(ScannedPdfError);
      expect((error as Error).message).toBe(SCANNED_PDF_MESSAGE);
    },
    300_000,
  );

  for (const id of ["n1-en-lostworld", "n3-en-filosofia"]) {
    const file = corpusFile(id);
    it.skipIf(!existsSync(file))(
      `${id}: embedded OCR layer flags source.ocrTextLayer`,
      async () => {
        const bytes = new Uint8Array(await readFile(file));
        const document = await ingestPdfjs(bytes, { fileName: `${id}.pdf` });

        expect(document.source.ocrTextLayer, id).toBe(true);
        expect(
          document.pages.reduce((total, page) => total + page.items.length, 0),
          id,
        ).toBeGreaterThan(0);
      },
      300_000,
    );
  }

  const digital = corpusFile("n1-en-sofia");
  it.skipIf(!existsSync(digital))(
    "n1-en-sofia: digital book is never flagged",
    async () => {
      const bytes = new Uint8Array(await readFile(digital));
      const document = await ingestPdfjs(bytes, { fileName: "n1-en-sofia.pdf" });

      expect(document.source.ocrTextLayer).toBeUndefined();
    },
    300_000,
  );
});
