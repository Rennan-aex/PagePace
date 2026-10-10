// E3-T02 acceptance: on N1 the lines the extractor removes as a repeated
// region must be exactly the heads, feet and page numbers the golden leaves
// out of the reading flow — `header_footer_f1` >= 0.98 — and the extraction
// must never take golden content out of the flow (that is what `overRemoved`
// counts: a lost body line, never a repeated region).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { type CorpusEntry, loadCorpus, REPO_ROOT } from "./corpus";
import { headerFooterRemoval } from "./eval";
import { type Golden, hasGolden, parseGolden, resolveGoldenPath } from "./golden";

/** E3-T02: minimum `header_footer_f1` of an N1 document (EVALUATION.md). */
const HEADER_FOOTER_F1_TARGET_N1 = 0.98;

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

describe("E3-T02: N1 repeated region removal against the golden", () => {
  it("checks at least one N1 document (the acceptance must stay alive)", () => {
    expect(measured.map(({ entry }) => entry.id)).not.toHaveLength(0);
  });

  for (const { entry, golden } of measured) {
    it.skipIf(!existsSync(entry.path))(
      `${entry.id}: header_footer_f1 >= ${HEADER_FOOTER_F1_TARGET_N1} and no golden content removed`,
      async () => {
        const document = await readDocument(entry);
        const removal = headerFooterRemoval(golden, document);
        expect(
          removal.f1,
          `${entry.id}: ${removal.missed} missed removal(s), ` +
            `${removal.overRemoved} over-removed line(s), ` +
            `${removal.truePositives} of ${removal.truePositives + removal.missed} ` +
            "expected removal(s) found",
        ).toBeGreaterThanOrEqual(HEADER_FOOTER_F1_TARGET_N1);
        // Guardian: the reading flow never loses a line the golden holds.
        expect(removal.overRemoved, `${entry.id}: golden content left the flow`).toBe(0);
      },
    );
  }
});
