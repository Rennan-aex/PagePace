// E6-T03 — side regions and sidebars, end to end through pdf.js.
//
// The synthetic case always runs in CI: one page whose outer margin holds a
// three-line sidebar beside ten lines of body text, on the same baselines.
// The ingestion must deliver items that `buildBook` reads as two blocks —
// the body first, the sidebar last with `flags: ["sidebar"]` and no text
// glued across the corridor (the acceptance of the task: "fixture").
import { buildBook, ingestPdfjs, SIDEBAR_FLAG } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

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
    expect(side?.origin).toEqual({ pageFrom: 0, pageTo: 0 });
  });
});
