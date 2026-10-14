// E4-T02 acceptance: on N1 the headings the `Book` builder emits must be the
// ones the golden declares — `heading_f1` >= 0.95 — and at the depth the
// golden places them — `heading_level_acc` >= 0.95. The report of the
// acceptance lists the false positives, the missed headings and the wrong
// levels per document, because the criterion asks for exactly that.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { type CorpusEntry, loadCorpus, REPO_ROOT } from "./corpus";
import { blockHeadingDetection } from "./eval";
import { type Golden, hasGolden, parseGolden, resolveGoldenPath } from "./golden";

/** E4-T02: minimum `heading_f1` of an N1 document (EVALUATION.md). */
const HEADING_F1_TARGET_N1 = 0.95;
/** E4-T02: minimum `heading_level_acc` of an N1 document (EVALUATION.md). */
const HEADING_LEVEL_ACC_TARGET_N1 = 0.95;

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

function short(text: string): string {
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

describe("E4-T02: N1 heading detection against the golden", () => {
  it("checks at least one N1 document (the acceptance must stay alive)", () => {
    expect(measured.map(({ entry }) => entry.id)).not.toHaveLength(0);
  });

  it("holds N1 goldens with headings to detect (two empty sides score 1)", () => {
    for (const { entry, golden } of measured) {
      expect(
        golden.blocks.some((block) => block.kind === "heading"),
        `${entry.id}: the golden declares no heading, the acceptance would pass on nothing`,
      ).toBe(true);
    }
  });

  for (const { entry, golden } of measured) {
    it.skipIf(!existsSync(entry.path))(
      `${entry.id}: heading_f1 >= ${HEADING_F1_TARGET_N1} and heading_level_acc >= ${HEADING_LEVEL_ACC_TARGET_N1}`,
      async () => {
        const document = await readDocument(entry);
        const headings = blockHeadingDetection(golden, document);
        const falsePositives = headings.falsePositives.map((heading) => short(heading.text));
        const falseNegatives = headings.falseNegatives.map((heading) => short(heading.text));
        const wrongLevels = headings.levelMismatches.map(
          (mismatch) =>
            `${short(mismatch.text)} (expected ${mismatch.expected}, got ${mismatch.actual})`,
        );
        const context =
          `${entry.id}: false positive(s) ${falsePositives.join(", ") || "none"}, ` +
          `missed ${falseNegatives.join(", ") || "none"}, ` +
          `wrong level ${wrongLevels.join(", ") || "none"}`;
        expect(
          headings.f1,
          `${context} (heading_level_acc ${headings.levelAcc.toFixed(4)})`,
        ).toBeGreaterThanOrEqual(HEADING_F1_TARGET_N1);
        expect(headings.levelAcc, context).toBeGreaterThanOrEqual(HEADING_LEVEL_ACC_TARGET_N1);
      },
    );
  }
});
