// E6-T03 — side regions and sidebars, end to end through pdf.js.
//
// The synthetic case always runs in CI: one page whose outer margin holds a
// three-line sidebar beside ten lines of body text, on the same baselines.
// The ingestion must deliver items that `buildBook` reads as two blocks —
// the body first, the sidebar last with `flags: ["sidebar"]` and no text
// glued across the corridor (the acceptance of the task: "fixture").
//
// The corpus case needs `corpus/public` and is skipped when the file is
// absent: on the SciLO article the left band of page 1 holds three blocks
// (editorial panel, stamp, citation box) with huge gaps between them, and
// the footer that used to fuse the page into one band is stripped first
// (ADR-081) — the citation box must leave the RESUMO as a flagged sidebar.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBook, ingestPdfjs, SIDEBAR_FLAG } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

const BODY = 11;
/** Body text pushed right so the corridor to the side band clears a body font. */
const SIDE_X = 72;
const MAIN_X = 180;
const LINE = "The quick brown fox jumps over the lazy dog and keeps running.";
const SIDE = "Side note line.";

function sidebarStream(): string {
  const side = [760, 745, 730].map((y) => textStream(SIDE, { x: SIDE_X, y, size: BODY }));
  const main = Array.from({ length: 10 }, (_, index) =>
    textStream(LINE, { x: MAIN_X, y: 760 - index * 15, size: BODY }),
  );
  return [...side, ...main].join("\n");
}

describe("sidebars through pdf.js (synthetic, E6-T03 acceptance)", () => {
  it("reads the side band last, flagged and out of the body text", async () => {
    const bytes = buildPdf([sidebarStream()], { fonts: { F1: "Helvetica" } });
    const document = await ingestPdfjs(bytes, { fileName: "sidebar.pdf" });

    const book = buildBook(document);
    expect(book.blocks).toHaveLength(2);
    const [main, side] = [book.blocks[0], book.blocks[1]];
    expect(main?.flags).toEqual([]);
    expect(main?.runs[0]?.text).toContain("The quick brown fox");
    expect(main?.runs[0]?.text).not.toContain("Side note");
    expect(side?.flags).toEqual([SIDEBAR_FLAG]);
    expect(side?.runs[0]?.text).toBe(`${SIDE} ${SIDE} ${SIDE}`);
    expect(side?.origin).toMatchObject({ pageFrom: 0, pageTo: 0 });
  });
});

describe("E6-T03 acceptance against the public corpus (skipped without corpus/public)", () => {
  const wittgenstein = path.join(repoRoot, "corpus", "public", "n3-pt-scielo-wittgenstein.pdf");

  it.skipIf(!existsSync(wittgenstein))(
    "n3-pt-scielo-wittgenstein: the left band of page 1 reads as flagged sidebars",
    async () => {
      const bytes = new Uint8Array(readFileSync(wittgenstein));
      const document = await ingestPdfjs(bytes, { fileName: "n3-pt-scielo-wittgenstein.pdf" });

      const book = buildBook(document);
      const holding = (needle: string) =>
        book.blocks.filter((block) => block.runs.some((run) => run.text.includes(needle)));
      const editors = holding("Editores respons");
      const cite = holding("Como citar");
      // Both blocks of the left band are claimed, never left in the flow.
      expect(editors.length).toBeGreaterThan(0);
      expect(cite.length).toBeGreaterThan(0);
      for (const block of [...editors, ...cite]) {
        expect(block.flags).toContain(SIDEBAR_FLAG);
      }
    },
    180_000,
  );
});
