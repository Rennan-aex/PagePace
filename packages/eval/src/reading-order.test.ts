// E2-T06 acceptance: on N1 the blocks the extraction delivers have to come in
// the order the golden declares — `reading_order` >= 0.99 (EVALUATION.md).
// Single column is the trivial order (page by page, top to bottom); columns
// and regions are E6 and are not gated here. Like the E2-T02/E2-T04 tests,
// this calls the very function the runner measures with, so there is no
// second implementation to diverge, and a guardian test fails if no N1
// document could be checked at all.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { type CorpusEntry, loadCorpus, REPO_ROOT } from "./corpus";
import { blockReadingOrder } from "./eval";
import { type Golden, hasGolden, parseGolden, resolveGoldenPath } from "./golden";

/** E2-T06: minimum `reading_order` of an N1 document (EVALUATION.md). */
const READING_ORDER_TARGET_N1 = 0.99;

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

const measured: { entry: CorpusEntry; golden: Golden }[] = [];
for (const entry of corpus.entries) {
  if (entry.level !== "N1" || !hasGolden(entry)) continue;
  const golden = readGolden(entry);
  if (golden !== null) measured.push({ entry, golden });
}

function readDocument(entry: CorpusEntry) {
  return ingestPdfjs(new Uint8Array(readFileSync(entry.path)), {
    fileName: path.basename(entry.path),
  });
}

describe("E2-T06: N1 reading order against the golden", () => {
  it("checks at least one N1 document (the acceptance must stay alive)", () => {
    expect(measured.map(({ entry }) => entry.id)).not.toHaveLength(0);
  });

  for (const { entry, golden } of measured) {
    it.skipIf(!existsSync(entry.path))(
      `${entry.id}: reading_order >= ${READING_ORDER_TARGET_N1}`,
      async () => {
        const document = await readDocument(entry);
        const order = blockReadingOrder(golden, document);
        expect(
          order.score,
          `${entry.id}: ${order.edits} edit(s) between ${order.referenceBlocks} golden and ` +
            `${order.hypothesisBlocks} extracted block(s)`,
        ).toBeGreaterThanOrEqual(READING_ORDER_TARGET_N1);
      },
    );
  }
});
