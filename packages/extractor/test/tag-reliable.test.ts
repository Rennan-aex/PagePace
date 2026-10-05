import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";

/**
 * The `reliable` flag of S3 §4.3, checked against the five tagged PDFs of the
 * corpus (ADR-028, provisional rule calibrated on exactly these documents).
 *
 * Files come from `corpus/public/` (public, fetched by E1-T05) and from
 * `$CORPUS_PRIVATE_DIR` (or `.env`, the same resolution the runner uses).
 * Missing files are skipped, so CI without a corpus still passes.
 */

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const publicCorpus = path.join(repoRoot, "corpus", "public");

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

interface Case {
  id: string;
  file: string;
  reliable: boolean;
  /** Some paragraph hints are expected even when the document is not reliable. */
  paragraphs: "some" | "any";
}

const CASES: Case[] = [
  {
    id: "n1-en-rebus-philosophy-mind",
    file: path.join(publicCorpus, "n1-en-rebus-philosophy-mind.pdf"),
    reliable: true,
    paragraphs: "some",
  },
  {
    id: "n1-en-sofia",
    file: path.join(privateCorpus, "n1-en-sofia.pdf"),
    reliable: true,
    paragraphs: "some",
  },
  {
    id: "n4-en-fisica",
    file: path.join(privateCorpus, "n4-en-fisica.pdf"),
    reliable: true,
    paragraphs: "some",
  },
  {
    id: "n1-en-curinga",
    file: path.join(privateCorpus, "n1-en-curinga.pdf"),
    reliable: false,
    paragraphs: "some",
  },
  {
    id: "n1-en-lostworld",
    file: path.join(privateCorpus, "n1-en-lostworld.pdf"),
    reliable: false,
    paragraphs: "any",
  },
];

describe("tagHints.reliable on the tagged corpus (ADR-028)", () => {
  for (const testCase of CASES) {
    const available = Boolean(testCase.file) && existsSync(testCase.file);

    it.skipIf(!available)(
      `${testCase.id}: reliable === ${testCase.reliable}`,
      async () => {
        const bytes = new Uint8Array(await readFile(testCase.file));
        const document = await ingestPdfjs(bytes, { fileName: path.basename(testCase.file) });

        expect(document.source.tagged, testCase.id).toBe(true);
        expect(document.tagHints, testCase.id).toBeDefined();
        expect(document.tagHints?.reliable, testCase.id).toBe(testCase.reliable);
        // Hints are emitted whether or not the tree can be trusted: they are
        // confirmations for E2/E10, never the only source.
        expect(Array.isArray(document.tagHints?.paragraphs), testCase.id).toBe(true);
        expect(Array.isArray(document.tagHints?.figures), testCase.id).toBe(true);
        if (testCase.paragraphs === "some") {
          expect(document.tagHints?.paragraphs.length, testCase.id).toBeGreaterThan(0);
        }
      },
      300_000,
    );
  }
});
