// E5-T04 acceptance: on N3 the kinds of the blocks the `Book` builder emits
// must be the kinds the golden declares — `block_kind_f1` >= 0.95. The report
// of the acceptance lists the invented and the missed kinds per document,
// because the criterion asks for exactly that.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { type CorpusEntry, loadCorpus, REPO_ROOT } from "./corpus";
import { blockKindDetection } from "./eval";
import { type Golden, hasGolden, parseGolden, resolveGoldenPath } from "./golden";

/** E5-T04: minimum `block_kind_f1` of an N3 document (EVALUATION.md). */
const BLOCK_KIND_F1_TARGET_N3 = 0.95;

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

function short(text: string): string {
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

describe("E5-T04: N3 block kind detection against the golden", () => {
  it("checks at least one N3 document (the acceptance must stay alive)", () => {
    expect(measured.map(({ entry }) => entry.id)).not.toHaveLength(0);
  });

  it("holds N3 goldens with more than one kind to detect (two empty sides score 1)", () => {
    for (const { entry, golden } of measured) {
      const kinds = new Set(golden.blocks.map((block) => block.kind));
      expect(
        kinds.size,
        `${entry.id}: the golden declares only one kind, the acceptance would pass on nothing`,
      ).toBeGreaterThan(1);
    }
  });

  for (const { entry, golden } of measured) {
    it.skipIf(!existsSync(entry.path))(
      `${entry.id}: block_kind_f1 >= ${BLOCK_KIND_F1_TARGET_N3}`,
      async () => {
        const document = await readDocument(entry);
        const result = blockKindDetection(golden, document);
        const errors: string[] = [];
        for (const [kind, score] of result.byKind) {
          const invented = score.falsePositives.map((block) => `${kind}:${short(block.text)}`);
          const missed = score.falseNegatives.map((block) => `${kind}:${short(block.text)}`);
          if (invented.length > 0) errors.push(`invented ${invented.join(", ")}`);
          if (missed.length > 0) errors.push(`missed ${missed.join(", ")}`);
        }
        const context =
          errors.length === 0 ? "no kind errors" : `${entry.id}: ${errors.join("; ")}`;
        expect(result.f1, context).toBeGreaterThanOrEqual(BLOCK_KIND_F1_TARGET_N3);
      },
    );
  }
});

// E5-T05 acceptance: the list/caption documents — the N2 spec written for
// this task (marked and numbered lists, figure/table captions) and the N2
// styles spec whose `list_item` blocks were the remaining baseline gap —
// must score the same target. The other N2 golden (`syn-n2-en-columns`)
// belongs to E6 and is not gated here.
//
// E5-T06 acceptance: the N2 bibliography document — the titled section with
// its indented entries, the flush-left numbered entry and the heading that
// closes the section — must score it too: every `reference` of the golden
// detected, no entry missed as `list_item`/`paragraph` and no prose of the
// section invented as `reference`.
//
// E5-T07 acceptance: the N2 margin-numbering document — printed Bekker/
// Stephanus numbers in both outer margins, a heading that opens it and the
// "42." guard — must score it too: every `margin_ref` of the golden detected
// (no number missed as `heading`/`paragraph`), the guard left alone and the
// body around the numbers kept as `paragraph`.
const E5_T05_T06_T07_IDS = [
  "syn-n2-en-lists",
  "syn-n2-pt-estilos",
  "syn-n2-en-references",
  "syn-n2-en-marginrefs",
];

describe("E5-T05/T06/T07: block kinds of the list, caption, bibliography and margin documents", () => {
  for (const id of E5_T05_T06_T07_IDS) {
    const found = corpus.entries.find((entry) => entry.id === id);
    it.skipIf(found === undefined || !existsSync(found.path))(
      `${id}: block_kind_f1 >= ${BLOCK_KIND_F1_TARGET_N3}`,
      async () => {
        const entry = found as CorpusEntry;
        const golden = readGolden(entry);
        expect(golden, `${id}: the golden must exist for the acceptance`).not.toBeNull();
        const document = await readDocument(entry);
        const result = blockKindDetection(golden as Golden, document);
        const errors: string[] = [];
        for (const [kind, score] of result.byKind) {
          const invented = score.falsePositives.map((block) => `${kind}:${short(block.text)}`);
          const missed = score.falseNegatives.map((block) => `${kind}:${short(block.text)}`);
          if (invented.length > 0) errors.push(`invented ${invented.join(", ")}`);
          if (missed.length > 0) errors.push(`missed ${missed.join(", ")}`);
        }
        const context = errors.length === 0 ? "no kind errors" : `${id}: ${errors.join("; ")}`;
        expect(result.f1, context).toBeGreaterThanOrEqual(BLOCK_KIND_F1_TARGET_N3);
      },
    );
  }
});
