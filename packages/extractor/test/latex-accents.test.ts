import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ingestPdfjs, itemsText } from "@pagepace/extractor";
import type { RawDocument } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

/**
 * E3-T01b — spacing-accent recomposition, end to end.
 *
 * The synthetic cases always run in CI: pdf.js is fed the same shape LaTeX
 * emits (an accent glyph in its own text object, overlapping the letter it
 * belongs to) and the ingestion must deliver the composed word without any
 * invented space. The corpus case needs `$CORPUS_PRIVATE_DIR` (or `.env`) and
 * is skipped when the file is absent — it is the acceptance of the task: the
 * S1 `spaceAccent` spike of `n4-pt-astrofisica` must fall to zero.
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

/** The S1 counter `itemsWithSpacingAccent` (spikes/s1-dump.mjs), verbatim. */
const SPIKE_SPACING_ACCENT = /[´`¸˜¨¯]/;

const itemsTextOf = (document: RawDocument): string =>
  document.pages.map((page) => itemsText(page.items)).join("");

describe("LaTeX accent pattern through pdf.js (synthetic)", () => {
  it("composes a standalone accent item into the next word", async () => {
    // `EXERC` / `´` / `ICIOS` in three text objects: the accent is its own
    // pdf.js item, positioned over the `I` (x = 106 keeps both boxes
    // overlapping while each backward jump flushes an item, E3-T01b probe 14).
    const bytes = buildPdf([
      [
        textStream("EXERC", { x: 72, y: 700, size: 12 }),
        textStream("´", { x: 110, y: 700, size: 12 }),
        textStream("ICIOS", { x: 106, y: 700, size: 12 }),
      ].join("\n"),
    ]);

    const document = await ingestPdfjs(bytes, { fileName: "latex-standalone.pdf" });

    expect(document.pages[0]?.items.map((item) => item.text)).toEqual(["EXERC", "", "ÍCIOS"]);
    // Boxes keep their input positions and never collapse to zero width.
    const items = document.pages[0]?.items ?? [];
    expect(items.map((item) => item.x)).toEqual([72, 110, 106]);
    expect(items.every((item) => item.width > 0)).toBe(true);
    expect(itemsTextOf(document)).toBe("EXERCÍCIOS");
  });

  it("composes an accent run trailing an item into the next word", async () => {
    const bytes = buildPdf([
      [
        textStream("EXERC´", { x: 72, y: 700, size: 12 }),
        textStream("ICIOS", { x: 114, y: 700, size: 12 }),
      ].join("\n"),
    ]);

    const document = await ingestPdfjs(bytes, { fileName: "latex-trailing.pdf" });

    expect(document.pages[0]?.items.map((item) => item.text)).toEqual(["EXERC", "ÍCIOS"]);
    expect(itemsTextOf(document)).toBe("EXERCÍCIOS");
  });

  it("keeps plain pages byte-identical in behaviour (no accent, no change)", async () => {
    const bytes = buildPdf([textStream("plain text without accents", { x: 72, y: 700 })]);

    const document = await ingestPdfjs(bytes, { fileName: "plain.pdf" });

    expect(document.pages[0]?.items.map((item) => item.text)).toEqual([
      "plain text without accents",
    ]);
  });
});

describe("E3-T01b acceptance against the corpus (skipped without $CORPUS_PRIVATE_DIR)", () => {
  const n4 = path.join(privateCorpusDir(), "n4-pt-astrofisica.pdf");

  it.skipIf(!existsSync(n4))(
    "n4-pt-astrofisica: the spacing-accent spike reaches zero",
    async () => {
      const bytes = new Uint8Array(await readFile(n4));
      const document = await ingestPdfjs(bytes, { fileName: "n4-pt-astrofisica.pdf" });

      const total = document.pages.reduce((sum, page) => sum + page.items.length, 0);
      expect(total).toBeGreaterThan(0);

      const offenders = document.pages
        .flatMap((page) => page.items)
        .filter((item) => SPIKE_SPACING_ACCENT.test(item.text))
        .map((item) => item.text);
      expect(offenders).toEqual([]);
    },
    300_000,
  );
});
