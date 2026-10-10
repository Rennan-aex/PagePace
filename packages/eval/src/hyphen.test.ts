// E3-T03 acceptance: on N1 the words the extractor produces at every
// line-end hyphen site must be words the golden holds — `hyphen_join_acc`
// >= 0.98. The metric scores both directions with one number: a wrong join
// (`guardachuva`) and a wrong keep (`pala-vra`) both fail the membership
// test, so a rule that joins everything or keeps everything cannot pass.
//
// The synthetic document `syn-n1-pt-hifenizacao` is the deterministic proof:
// its golden was built from the same specification that prints the breaks,
// so every site is known and the score must be exactly 1.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { type CorpusEntry, loadCorpus, REPO_ROOT } from "./corpus";
import { hyphenJoinAccuracy } from "./eval";
import { type Golden, hasGolden, parseGolden, resolveGoldenPath } from "./golden";

/** E3-T03: minimum `hyphen_join_acc` of an N1 document (EVALUATION.md). */
const HYPHEN_JOIN_ACC_TARGET_N1 = 0.98;
/** The synthetic hyphenation document must decide every site correctly. */
const SYNTHETIC_ID = "syn-n1-pt-hifenizacao";

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

describe("E3-T03: N1 hyphen joins against the golden", () => {
  it("checks at least one N1 document (the acceptance must stay alive)", () => {
    expect(measured.map(({ entry }) => entry.id)).not.toHaveLength(0);
  });

  for (const { entry, golden } of measured) {
    const synthetic = entry.id === SYNTHETIC_ID;
    it.skipIf(!existsSync(entry.path))(
      synthetic
        ? `${entry.id}: hyphen_join_acc === 1 (every site decided as the golden writes it)`
        : `${entry.id}: hyphen_join_acc >= ${HYPHEN_JOIN_ACC_TARGET_N1}`,
      async () => {
        const document = await readDocument(entry);
        const result = hyphenJoinAccuracy(golden, document);
        const target = synthetic ? 1 : HYPHEN_JOIN_ACC_TARGET_N1;
        expect(
          result.acc,
          `${entry.id}: ${result.total - result.correct} wrong join(s) of ${result.total} ` +
            `site(s), ${result.uncertain} uncertain`,
        ).toBeGreaterThanOrEqual(target);
      },
    );
  }
});
