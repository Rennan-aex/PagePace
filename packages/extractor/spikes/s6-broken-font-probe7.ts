// Spike BACKLOG-26 part 7 (final measurement):
// (a) render two more lone-"?" pages of n4 to close the symbol-substitution claim;
// (b) block-level scan of the candidate signal (word-internal à) across every
//     digital PDF, mirroring brokenFontSignal's floor+share shape, plus the
//     current brokenFontSignal as the baseline that misses this class.
// Only counts and geometry leave this script — no book text is written.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  brokenFontSignal,
  documentParagraphs,
  ingestPdfjs,
  normalizeForReader,
  paragraphHyphenText,
  stripRepeatedRegions,
} from "../src/index";

(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
(globalThis as Record<string, unknown>).ImageData = ImageData;
(globalThis as Record<string, unknown>).Path2D = Path2D;

const privateDir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const publicDir = path.join(import.meta.dirname, "../../../corpus/public");
const outDir = path.join(import.meta.dirname, "../../../.pagepace-cache/tmp");

// --------------------------------------------------------------- renders ----
async function renderLoneQuestion(id: string, filePath: string, pageNumber: number): Promise<void> {
  const bytes = new Uint8Array(readFileSync(filePath));
  const task = getDocument({ data: bytes, fontExtraProperties: true, verbosity: 0 });
  const pdf = await task.promise;
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const items = content.items as Array<{ str: string; transform: number[]; width: number; height: number }>;
  const hit = items.find((i) => i.str.trim() === "?");
  if (!hit) {
    console.log(`${id} p${pageNumber}: no lone ? item`);
    await task.destroy();
    return;
  }
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport } as never).promise;
  const [, , , , x, y] = hit.transform;
  const left = Math.max(x * 2 - 160, 0);
  const top = Math.max(viewport.height - y * 2 - 40, 0);
  const cropW = Math.min(340, canvas.width - left);
  const cropH = Math.min(80, canvas.height - top);
  const crop = createCanvas(Math.ceil(cropW), Math.ceil(cropH));
  crop
    .getContext("2d")
    .drawImage(canvas, left, top, Math.ceil(cropW), Math.ceil(cropH), 0, 0, Math.ceil(cropW), Math.ceil(cropH));
  const out = path.join(outDir, `n4-question-p${pageNumber}.png`);
  writeFileSync(out, crop.toBuffer("image/png"));
  console.log(`rendered ${out}`);
  await task.destroy();
}

await renderLoneQuestion("n4-pt-astrofisica", path.join(privateDir, "n4-pt-astrofisica.pdf"), 66);
await renderLoneQuestion("n4-pt-astrofisica", path.join(privateDir, "n4-pt-astrofisica.pdf"), 190);

// --------------------------------------------------------- block scanning ----
const PRIVATE = [
  "n1-en-curinga",
  "n1-en-lostworld",
  "n1-en-sofia",
  "n1-pt-curinga",
  "n1-pt-sofia",
  "n2-en-astrofisica",
  "n2-pt-placasdevideo",
  "n3-en-filosofia",
  "n3-pt-filosofia",
  "n3-pt-filosofia2",
  "n4-en-astrofisica",
  "n4-en-fisica",
  "n4-pt-astrofisica",
] as const;
const PUBLIC = [
  "n1-en-rebus-philosophy-mind",
  "n2-en-arxiv-phobos",
  "n3-en-scielo-climatejustice",
  "n3-pt-scielo-wittgenstein",
] as const;

const WORD_INTERNAL_A = /[\p{L}]à[\p{L}]/gu;

interface BlockStats {
  blocks: number;
  atLeast1: number;
  atLeast3: number;
  atLeast3Share5: number;
  brokenFontBlocks: number;
}

async function scan(id: string, filePath: string): Promise<BlockStats | null> {
  let document;
  try {
    document = await ingestPdfjs(new Uint8Array(readFileSync(filePath)), {
      fileName: path.basename(filePath),
    });
  } catch (error) {
    console.log(`${id}: INGEST FAILED (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
  const pages = documentParagraphs(stripRepeatedRegions(document).document);
  const paragraphs = pages.flat();
  const stats: BlockStats = {
    blocks: paragraphs.length,
    atLeast1: 0,
    atLeast3: 0,
    atLeast3Share5: 0,
    brokenFontBlocks: 0,
  };
  for (const lines of paragraphs) {
    const text = normalizeForReader(paragraphHyphenText(lines).text);
    const hits = text.match(WORD_INTERNAL_A);
    const suspect = hits?.length ?? 0;
    if (suspect >= 1) stats.atLeast1 += 1;
    if (suspect >= 3) stats.atLeast3 += 1;
    if (suspect >= 3) {
      const readable = [...text].filter((c) => !/\s/u.test(c)).length;
      if (readable > 0 && suspect / readable >= 0.05) stats.atLeast3Share5 += 1;
    }
    if (brokenFontSignal(text).broken) stats.brokenFontBlocks += 1;
  }
  return stats;
}

for (const id of PRIVATE) {
  const stats = await scan(id, path.join(privateDir, `${id}.pdf`));
  if (stats) console.log(`${id}: ${JSON.stringify(stats)}`);
}
for (const id of PUBLIC) {
  try {
    const stats = await scan(id, path.join(publicDir, `${id}.pdf`));
    if (stats) console.log(`${id}: ${JSON.stringify(stats)}`);
  } catch (error) {
    console.log(`${id}: SKIP (${error instanceof Error ? error.message : String(error)})`);
  }
}
