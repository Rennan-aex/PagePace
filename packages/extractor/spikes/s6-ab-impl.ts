// A/B for the ADR-084 implementation (common-letter swaps): blocks carrying
// flags BROKEN_FONT_MAPPING per digital PDF, by the real buildBook pipeline,
// counting separately what only the FFFD/PUA signature catches (old) and what
// the internal-à signature adds (new). Only counts leave this script.
import { readFileSync } from "node:fs";
import path from "node:path";
import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import {
  BROKEN_FONT_MAPPING,
  buildBook,
  brokenFontSignal,
  documentParagraphs,
  ingestPdfjs,
  internalAccentSwaps,
  normalizeForReader,
  paragraphHyphenText,
  stripRepeatedRegions,
} from "../src/index";

(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix;
(globalThis as Record<string, unknown>).ImageData = ImageData;
(globalThis as Record<string, unknown>).Path2D = Path2D;

const privateDir = process.env.CORPUS_PRIVATE_DIR ?? "<CORPUS_PRIVATE_DIR>";
const publicDir = path.join(import.meta.dirname, "../../../corpus/public");

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

async function scan(id: string, filePath: string): Promise<void> {
  let document;
  try {
    document = await ingestPdfjs(new Uint8Array(readFileSync(filePath)), {
      fileName: path.basename(filePath),
    });
  } catch (error) {
    console.log(`${id}: INGEST FAILED`);
    return;
  }
  const book = buildBook(document);
  const flagged = book.blocks.filter((block) => block.flags.includes(BROKEN_FONT_MAPPING));
  const pages = documentParagraphs(stripRepeatedRegions(document).document);
  let old = 0;
  let added = 0;
  for (const lines of pages.flat()) {
    const text = normalizeForReader(paragraphHyphenText(lines).text);
    const viaFffd = brokenFontSignal(text).broken;
    const viaAccent = !viaFffd && internalAccentSwaps(text) >= 3;
    if (viaFffd) old += 1;
    if (viaAccent) added += 1;
  }
  console.log(
    `${id}: flagged=${flagged.length} (old fffd/pua=${old}, new internal-à=${added}) warnings=${JSON.stringify(book.extraction.warnings)}`,
  );
}

for (const id of PRIVATE) {
  await scan(id, path.join(privateDir, `${id}.pdf`));
}
for (const id of PUBLIC) {
  try {
    await scan(id, path.join(publicDir, `${id}.pdf`));
  } catch {
    console.log(`${id}: SKIP`);
  }
}
