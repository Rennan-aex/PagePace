import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Text-layer detectors of E1-T03 (ADR-018 and ADR-019).
 *
 * - Detector A: a PDF with no text at all is a scan — the adapter refuses to
 *   build a `RawDocument` and reports the exact message of ADR-018.
 * - Detector B: a PDF whose characters are mostly drawn with the invisible
 *   text rendering mode (`Tr 3`) carries an embedded OCR layer — the document
 *   is flagged so downstream extraction warns instead of pretending the text
 *   is digital (ADR-019).
 */

/** Message of ADR-018, verbatim. The CLI/app print it as-is. */
export const SCANNED_PDF_MESSAGE = "PDF escaneado: leitura exige OCR, ainda não disponível";

/**
 * Thrown by the adapter when the document has no text layer at all.
 * A rejected promise, never a crash: callers (CLI in E1-T04, app later) catch
 * it, show `SCANNED_PDF_MESSAGE` and keep the book as "waiting for OCR".
 */
export class ScannedPdfError extends Error {
  constructor() {
    super(SCANNED_PDF_MESSAGE);
    this.name = "ScannedPdfError";
  }
}

/**
 * Share of characters that must be invisible for the document to be marked
 * `ocrTextLayer`. ADR-019 says "a maior parte dos caracteres" (more than half);
 * the number is the literal reading of that sentence and is expected to be
 * re-checked once `pnpm eval` exists (E1-T08).
 */
export const OCR_TEXT_LAYER_MAJORITY = 0.5;

/** Character tally of one page operator list. */
export interface RenderModeChars {
  /** Characters sent by any text-showing operator. */
  total: number;
  /** Characters sent while the rendering mode (`Tr`) was 3 — invisible. */
  invisible: number;
}

/** The subset of pdf.js `getOperatorList()` this module reads. */
export interface OperatorListLike {
  fnArray: readonly number[];
  /** pdf.js passes `null` for operators without arguments (`save`, `restore`). */
  argsArray: ReadonlyArray<readonly unknown[] | null>;
}

const SHOW_TEXT_OPS = new Set<number>([
  OPS.showText,
  OPS.showSpacedText,
  OPS.nextLineShowText,
  OPS.nextLineSetSpacingShowText,
]);

/**
 * Walks a pdf.js operator list counting characters drawn with `Tr 3`.
 *
 * The text state (`Tr`) starts at 0 and changes only through
 * `setTextRenderingMode`, so a single running value is enough — the same walk
 * the S2 spike used to find the two OCR-layer books of the corpus.
 *
 * `q`/`Q` (measured with a synthetic PDF, E1-T03): pdf.js emits them as
 * `OPS.save`/`OPS.restore` and does **not** re-emit `setTextRenderingMode`
 * after a `restore`, so the mode has to be pushed/popped with the graphics
 * state — otherwise every string after a `Q` would be counted as invisible
 * whenever the enclosing block used `Tr 3`.
 */
export function countRenderModeChars(ops: OperatorListLike): RenderModeChars {
  let renderMode = 0;
  let total = 0;
  let invisible = 0;
  const savedModes: number[] = [];

  for (let index = 0; index < ops.fnArray.length; index++) {
    const fn = ops.fnArray[index];
    if (fn === undefined) continue;
    const args = ops.argsArray[index];
    if (fn === OPS.save) {
      savedModes.push(renderMode);
      continue;
    }
    if (fn === OPS.restore) {
      renderMode = savedModes.pop() ?? 0;
      continue;
    }
    if (fn === OPS.setTextRenderingMode) {
      const mode = args?.[0];
      if (typeof mode === "number") renderMode = mode;
      continue;
    }
    if (!SHOW_TEXT_OPS.has(fn)) continue;
    const payload = args?.[0];
    const chars = Array.isArray(payload)
      ? payload.length
      : typeof payload === "string"
        ? payload.length
        : 0;
    total += chars;
    if (renderMode === 3) invisible += chars;
  }

  return { total, invisible };
}

/** True when more than `OCR_TEXT_LAYER_MAJORITY` of the characters are invisible. */
export function isOcrTextLayer(chars: readonly RenderModeChars[]): boolean {
  let total = 0;
  let invisible = 0;
  for (const page of chars) {
    total += page.total;
    invisible += page.invisible;
  }
  return total > 0 && invisible > total * OCR_TEXT_LAYER_MAJORITY;
}
