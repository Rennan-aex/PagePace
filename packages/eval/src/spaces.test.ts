// E2-T03 acceptance: `text_cer` on N1 must stay inside the target of
// docs/extractor/EVALUATION.md (≤ 0.5%) with the real space inference of the
// extractor core in the loop. Documents without a golden are skipped (the
// first hand-written goldens of real books arrive with the later phases), and
// a guardian test fails if no N1 can be checked at all, so the acceptance can
// never die quietly.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { type CorpusEntry, loadCorpus, REPO_ROOT } from "./corpus";
import { type Golden, goldenText, hasGolden, parseGolden, resolveGoldenPath } from "./golden";
import { textCer } from "./metrics";
import { documentText } from "./text";

/** E2-T03: `text_cer` target for N1 (EVALUATION.md, provisional table). */
const N1_TEXT_CER_TARGET = 0.005;

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

const measurable: { entry: CorpusEntry; golden: Golden }[] = [];
for (const entry of corpus.entries) {
  if (entry.level !== "N1" || !hasGolden(entry)) continue;
  const golden = readGolden(entry);
  if (golden !== null) measurable.push({ entry, golden });
}

describe("E2-T03: text_cer on N1 against the golden", () => {
  it("checks at least one N1 document (the acceptance must stay alive)", () => {
    expect(measurable.map(({ entry }) => entry.id)).not.toHaveLength(0);
  });

  for (const { entry, golden } of measurable) {
    it.skipIf(!existsSync(entry.path))(`${entry.id}: text_cer within the N1 target`, async () => {
      const raw = await ingestPdfjs(new Uint8Array(readFileSync(entry.path)), {
        fileName: path.basename(entry.path),
      });
      const result = textCer(goldenText(golden), documentText(raw, golden.coverage));
      expect(
        result.cer,
        `${entry.id}: text_cer ${result.cer.toFixed(4)} over ${result.refChars} chars ` +
          `(${result.edits} edits) — target ${N1_TEXT_CER_TARGET}`,
      ).toBeLessThanOrEqual(N1_TEXT_CER_TARGET);
    });
  }
});
