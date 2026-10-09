// E2-T04 acceptance: on N1 the paragraph boundaries the extractor builds must
// match the golden — `para_boundary_f1` >= 0.98 — and the errors have to be
// readable per document (false cuts / false merges). Page breaks are left out
// of both sides of the comparison (ADR-041): at the foot of a page there is
// no spacing signal left, and the join between pages belongs to E2-T05.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { type CorpusEntry, loadCorpus, REPO_ROOT } from "./corpus";
import { paragraphBoundaries } from "./eval";
import { type Golden, hasGolden, parseGolden, resolveGoldenPath } from "./golden";

/** E2-T04: minimum `para_boundary_f1` of an N1 document (EVALUATION.md). */
const PARA_BOUNDARY_F1_TARGET_N1 = 0.98;

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

describe("E2-T04: N1 paragraph boundaries against the golden", () => {
  it("checks at least one N1 document (the acceptance must stay alive)", () => {
    expect(measured.map(({ entry }) => entry.id)).not.toHaveLength(0);
  });

  for (const { entry, golden } of measured) {
    it.skipIf(!existsSync(entry.path))(
      `${entry.id}: para_boundary_f1 >= ${PARA_BOUNDARY_F1_TARGET_N1}`,
      async () => {
        const document = await readDocument(entry);
        const boundaries = paragraphBoundaries(golden, document);
        expect(
          boundaries.f1,
          `${entry.id}: ${boundaries.falseCuts} false cut(s), ` +
            `${boundaries.falseMerges} false merge(s), ` +
            `${boundaries.truePositives} of ${boundaries.truePositives + boundaries.falseMerges} ` +
            "golden boundaries found",
        ).toBeGreaterThanOrEqual(PARA_BOUNDARY_F1_TARGET_N1);
      },
    );
  }
});
