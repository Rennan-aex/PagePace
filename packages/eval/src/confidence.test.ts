// E7-T01 acceptance: the confidence the `Book` reports must calibrate —
// on every document with a golden, the blocks the extraction got wrong are
// the ones it is unsure about (`confidence_calibration` >= 0.5). The report
// of the acceptance lists the wrong blocks with their confidence per
// document, because a miscalibration is only visible that way.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { type CorpusEntry, loadCorpus, REPO_ROOT } from "./corpus";
import { blockConfidenceCalibration, blockKindDetection } from "./eval";
import { type Golden, hasGolden, parseGolden, resolveGoldenPath } from "./golden";

/**
 * E7-T01: minimum `confidence_calibration` of a measured document
 * (EVALUATION.md). 0.5 = the correlation must stay clearly positive; the
 * synthetic goldens score 1 (no wrong block) until a real golden brings
 * errors to separate.
 */
const CONFIDENCE_CALIBRATION_TARGET = 0.5;

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
  if (!hasGolden(entry)) continue;
  const golden = readGolden(entry);
  if (golden !== null) measured.push({ entry, golden });
}

function readDocument(entry: CorpusEntry) {
  return ingestPdfjs(new Uint8Array(readFileSync(entry.path)), {
    fileName: path.basename(entry.path),
  });
}

describe("E7-T01: block confidence calibration against the golden", () => {
  it("checks at least one document (the acceptance must stay alive)", () => {
    expect(measured.map(({ entry }) => entry.id)).not.toHaveLength(0);
  });

  it("agrees with block_kind_f1 on what an error is, on every measured document", async () => {
    for (const { entry, golden } of measured) {
      if (!existsSync(entry.path)) continue;
      const document = await readDocument(entry);
      const calibration = blockConfidenceCalibration(golden, document);
      let falsePositives = 0;
      for (const score of blockKindDetection(golden, document).byKind.values()) {
        falsePositives += score.falsePositives.length;
      }
      expect(
        calibration.wrong,
        `${entry.id}: calibration and block_kind_f1 disagree on the errors`,
      ).toBe(falsePositives);
    }
  });

  for (const { entry, golden } of measured) {
    it.skipIf(!existsSync(entry.path))(
      `${entry.id}: confidence_calibration >= ${CONFIDENCE_CALIBRATION_TARGET}`,
      async () => {
        const document = await readDocument(entry);
        const result = blockConfidenceCalibration(golden, document);
        const context =
          result.wrong === 0
            ? `${entry.id}: no wrong block, score ${result.score.toFixed(4)}`
            : `${entry.id}: ${result.wrong} wrong of ${result.blocks} block(s), ` +
              `mean confidence ${result.meanRight?.toFixed(4)} right vs ` +
              `${result.meanWrong?.toFixed(4)} wrong (score ${result.score.toFixed(4)})`;
        expect(result.score, context).toBeGreaterThanOrEqual(CONFIDENCE_CALIBRATION_TARGET);
      },
    );
  }
});
