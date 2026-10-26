// Spike BACKLOG-26 part 8: same word-internal-à scan on the 5 synthetic PDFs
// (they carry the eval goldens — a future heuristic must stay at zero here).
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  documentParagraphs,
  ingestPdfjs,
  normalizeForReader,
  paragraphHyphenText,
  stripRepeatedRegions,
} from "../src/index";

const syntheticDir = path.join(import.meta.dirname, "../../../corpus/public/synthetic");
const WORD_INTERNAL_A = /[\p{L}]à[\p{L}]/gu;

const ids = ["syn-n1-pt-book", "syn-n2-en-columns", "syn-n3-pt-notes", "syn-n4-en-tables", "syn-n5-scan"];
let listed = 0;
const { readdirSync } = await import("node:fs");
for (const file of readdirSync(syntheticDir)) {
  if (!file.endsWith(".pdf")) continue;
  listed += 1;
  const id = file.replace(/\.pdf$/, "");
  let document;
  try {
    document = await ingestPdfjs(new Uint8Array(readFileSync(path.join(syntheticDir, file))), {
      fileName: file,
    });
  } catch (error) {
    console.log(`${id}: INGEST FAILED (${error instanceof Error ? error.message : String(error)})`);
    continue;
  }
  const paragraphs = documentParagraphs(stripRepeatedRegions(document).document).flat();
  let atLeast1 = 0;
  let atLeast3 = 0;
  let chars = 0;
  for (const lines of paragraphs) {
    const text = normalizeForReader(paragraphHyphenText(lines).text);
    const hits = text.match(WORD_INTERNAL_A)?.length ?? 0;
    chars += hits;
    if (hits >= 1) atLeast1 += 1;
    if (hits >= 3) atLeast3 += 1;
  }
  console.log(`${id}: blocks=${paragraphs.length} internalAgraveChars=${chars} atLeast1=${atLeast1} atLeast3=${atLeast3}`);
}
console.log(`files scanned=${listed} expected=${ids.length}`);
