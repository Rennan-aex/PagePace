// E2-T02 acceptance: on N1 the number of lines extracted per page must stay
// within ±2% of the golden. The golden answers a line-count question only
// when it records the layout line breaks (`\n` inside runs — ADR-039): the
// synthetic generator always writes them, hand-annotated goldens may not, and
// a golden that does not record them is skipped, never guessed.
//
// E3-T02: the count is taken **after** the repeated regions leave — a running
// head, a foot or a page number is not a line the reader meets, and the
// golden's line breaks never contain one.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { documentLines, ingestPdfjs, stripRepeatedRegions } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { type CorpusEntry, loadCorpus, REPO_ROOT } from "./corpus";
import {
  type Golden,
  goldenLinesPerPage,
  hasGolden,
  parseGolden,
  resolveGoldenPath,
} from "./golden";

/** E2-T02: every page's line count within ±2% of the golden. */
const LINE_COUNT_TOLERANCE = 0.02;

/** The ambient corpus; an unreadable private manifest falls back to the public one. */
const corpus = (() => {
  try {
    return loadCorpus();
  } catch {
    return loadCorpus({ env: {} });
  }
})();

function readGolden(entry: CorpusEntry): Golden | null {
  const goldenPath = resolveGoldenPath(entry, {
    repoRoot: REPO_ROOT,
    privateDir: corpus.privateDir,
    private: entry.visibility === "private" && corpus.privateDir !== null,
  });
  if (goldenPath === null || !existsSync(goldenPath)) return null;
  return parseGolden(readFileSync(goldenPath, "utf8"), goldenPath);
}

const checkable: { entry: CorpusEntry; expected: Map<number, number> }[] = [];
const withoutLayout: { entry: CorpusEntry; golden: Golden }[] = [];
for (const entry of corpus.entries) {
  if (entry.level !== "N1" || !hasGolden(entry)) continue;
  const golden = readGolden(entry);
  if (golden === null) continue;
  const expected = goldenLinesPerPage(golden);
  if (expected === null) withoutLayout.push({ entry, golden });
  else checkable.push({ entry, expected });
}

describe("E2-T02: N1 lines per page against the golden", () => {
  it("checks at least one N1 document (the acceptance must stay alive)", () => {
    expect(checkable.map(({ entry }) => entry.id)).not.toHaveLength(0);
  });

  for (const { entry, golden } of withoutLayout) {
    it(`${entry.id}: not checked — its golden records no line breaks (ADR-039)`, () => {
      expect(goldenLinesPerPage(golden)).toBeNull();
    });
  }

  for (const { entry, expected } of checkable) {
    it.skipIf(!existsSync(entry.path))(
      `${entry.id}: every page within ±2% of the golden line count`,
      async () => {
        const raw = await ingestPdfjs(new Uint8Array(readFileSync(entry.path)), {
          fileName: path.basename(entry.path),
        });
        const pages = documentLines(stripRepeatedRegions(raw).document);
        for (const [page, want] of expected) {
          const lines = pages[page - 1];
          if (lines === undefined) {
            throw new Error(`${entry.id}: page ${page} of the golden is not in the PDF`);
          }
          const got = lines.length;
          expect(
            Math.abs(got - want) / want,
            `${entry.id} page ${page}: ${got} lines extracted, ${want} lines in the golden`,
          ).toBeLessThanOrEqual(LINE_COUNT_TOLERANCE);
        }
      },
    );
  }
});
