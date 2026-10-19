// E6-T01 — column detection, end to end through pdf.js.
//
// The synthetic cases always run in CI: a single-column page and a
// two-column page whose title spans the gutter. The ingestion must deliver
// items that `detectDocumentColumns` reads as 1 and 2 columns, and the
// spanning title must be flagged — the acceptance of the task ("fixtures
// sintéticas de 1/2 colunas passam").
//
// The corpus cases need `corpus/public` and are skipped when the files are
// absent: the arXiv paper is two-column (most pages must read as 2) and the
// Rebus book plus the SciLO article are single-column (no page may read as
// multi-column — measured on 2026-10-19: 7/10 arXiv pages as 2, the rest
// title/figure pages; 99/99, 11/11 and 20/20 pages as 1).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectDocumentColumns, ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

const BODY = 11;
/** Geometry kept clear of the gutter (page 612pt wide, margins 72pt). */
const COL1_X = 72;
const COL2_X = 318;
/** Short enough that a line stays inside one 222pt column of Helvetica 11. */
const LINE = "The quick brown fox jumps.";
const TITLE = "A title that spans both columns of the page and holds them together";

function singleColumnStream(): string {
  return Array.from({ length: 10 }, (_, index) =>
    textStream(LINE, { x: COL1_X, y: 700 - index * 15, size: BODY }),
  ).join("\n");
}

function twoColumnStream(): string {
  const left = Array.from({ length: 8 }, (_, index) =>
    textStream(LINE, { x: COL1_X, y: 700 - index * 15, size: BODY }),
  );
  const right = Array.from({ length: 8 }, (_, index) =>
    textStream(LINE, { x: COL2_X, y: 700 - index * 15, size: BODY }),
  );
  const title = textStream(TITLE, { x: COL1_X, y: 730, size: BODY });
  return [title, ...left, ...right].join("\n");
}

describe("column detection through pdf.js (synthetic)", () => {
  it("reads a single-column page as one column (E6-T01 acceptance)", async () => {
    const bytes = buildPdf([singleColumnStream()], { fonts: { F1: "Helvetica" } });
    const document = await ingestPdfjs(bytes, { fileName: "one-column.pdf" });

    const results = detectDocumentColumns(document, { bodyFontSize: BODY });
    expect(results).toHaveLength(1);
    expect(results[0]?.count).toBe(1);
    expect(results[0]?.gutters).toEqual([]);
  });

  it("reads a two-column page as two columns and flags the spanning title", async () => {
    const bytes = buildPdf([twoColumnStream()], { fonts: { F1: "Helvetica" } });
    const document = await ingestPdfjs(bytes, { fileName: "two-columns.pdf" });

    const results = detectDocumentColumns(document, { bodyFontSize: BODY });
    expect(results).toHaveLength(1);
    const result = results[0];
    expect(result?.count).toBe(2);
    expect(result?.gutters).toHaveLength(1);
    // The title is the only item that crosses the gutter.
    const items = document.pages[0]?.items ?? [];
    const spanning = items.filter((_, index) => result?.spanningItems[index] === true);
    expect(spanning).toHaveLength(1);
    expect(spanning[0]?.text).toContain("spans both columns");
  });
});

describe("E6-T01 acceptance against the public corpus (skipped without corpus/public)", () => {
  const phobos = path.join(repoRoot, "corpus", "public", "n2-en-arxiv-phobos.pdf");
  const rebus = path.join(repoRoot, "corpus", "public", "n1-en-rebus-philosophy-mind.pdf");
  const wittgenstein = path.join(repoRoot, "corpus", "public", "n3-pt-scielo-wittgenstein.pdf");

  it.skipIf(!existsSync(phobos))(
    "n2-en-arxiv-phobos: most pages read as two columns, the rest as one",
    async () => {
      const bytes = new Uint8Array(readFileSync(phobos));
      const document = await ingestPdfjs(bytes, { fileName: "n2-en-arxiv-phobos.pdf" });

      const results = detectDocumentColumns(document);
      const withItems = results
        .map((result, index) => ({ result, page: document.pages[index] }))
        .filter((entry) => (entry.page?.items.length ?? 0) > 0);
      expect(withItems.length).toBeGreaterThan(0);
      const twoColumn = withItems.filter((entry) => entry.result.count === 2).length;
      // Measured 2026-10-19: 7 of 10 pages (title/figure pages read as 1).
      expect(twoColumn / withItems.length).toBeGreaterThanOrEqual(0.5);
      // The paper is two-column only: no page may claim three columns.
      expect(withItems.every((entry) => entry.result.count <= 2)).toBe(true);
    },
    120_000,
  );

  it.skipIf(!existsSync(rebus) || !existsSync(wittgenstein))(
    "single-column books read as one column on every page",
    async () => {
      for (const [file, name] of [
        [rebus, "n1-en-rebus-philosophy-mind"],
        [wittgenstein, "n3-pt-scielo-wittgenstein"],
      ] as const) {
        const bytes = new Uint8Array(readFileSync(file));
        const document = await ingestPdfjs(bytes, { fileName: `${name}.pdf` });
        const results = detectDocumentColumns(document);
        // Measured 2026-10-19: 99/99 and 11/11 pages as one column.
        expect(results.every((result) => result.count === 1)).toBe(true);
      }
    },
    180_000,
  );
});
