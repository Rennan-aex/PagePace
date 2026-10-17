// E5-T02 acceptance: on N3 the note→call links the `Book` builder emits must
// be the ones the golden declares — `footnote_link_acc` >= 0.90 — and the
// synthetic document, whose every artefact is generated from its
// specification, must score exactly 1. The report of the acceptance lists
// the invented links and the missed ones per document, because the criterion
// asks for exactly that.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { type CorpusEntry, loadCorpus, REPO_ROOT } from "./corpus";
import { footnoteLinks } from "./eval";
import { type Golden, hasGolden, parseGolden, resolveGoldenPath } from "./golden";

/** E5-T02: minimum `footnote_link_acc` of an N3 document (EVALUATION.md). */
const FOOTNOTE_LINK_ACC_TARGET_N3 = 0.9;

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
  if (entry.level !== "N3" || !hasGolden(entry)) continue;
  const golden = readGolden(entry);
  if (golden !== null) measured.push({ entry, golden });
}

function readDocument(entry: CorpusEntry) {
  return ingestPdfjs(new Uint8Array(readFileSync(entry.path)), {
    fileName: path.basename(entry.path),
  });
}

describe("E5-T02: N3 footnote call links against the golden", () => {
  it("checks at least one N3 document (the acceptance must stay alive)", () => {
    expect(measured.map(({ entry }) => entry.id)).not.toHaveLength(0);
  });

  it("holds an N3 golden with a call to link (two empty sides score 1)", () => {
    const withCalls = measured.filter(({ golden }) =>
      golden.blocks.some((block) => block.runs.some((run) => run.noteRef !== undefined)),
    );
    expect(withCalls.map(({ entry }) => entry.id)).not.toHaveLength(0);
  });

  for (const { entry, golden } of measured) {
    it.skipIf(!existsSync(entry.path))(
      `${entry.id}: footnote_link_acc >= ${FOOTNOTE_LINK_ACC_TARGET_N3}`,
      async () => {
        const document = await readDocument(entry);
        const links = footnoteLinks(golden, document);
        const invented = links.falsePositives.map((link) => `${link.page}:${link.label}`);
        const missed = links.falseNegatives.map((link) => `${link.page}:${link.label}`);
        const context =
          `${entry.id}: invented ${invented.join(", ") || "none"}, ` +
          `missed ${missed.join(", ") || "none"}`;
        expect(links.acc, context).toBeGreaterThanOrEqual(FOOTNOTE_LINK_ACC_TARGET_N3);
      },
    );
  }

  const synthetic = measured.find(({ entry }) => entry.id === "syn-n3-en-footnotes");
  it.skipIf(synthetic === undefined || !existsSync(synthetic.entry.path))(
    "syn-n3-en-footnotes: every declared call is linked (footnote_link_acc === 1)",
    async () => {
      if (synthetic === undefined) return;
      const document = await readDocument(synthetic.entry);
      const links = footnoteLinks(synthetic.golden, document);
      expect(links.falsePositives).toEqual([]);
      expect(links.falseNegatives).toEqual([]);
      expect(links.acc).toBe(1);
    },
  );
});
