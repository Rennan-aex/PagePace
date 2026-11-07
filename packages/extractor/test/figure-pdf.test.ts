// E10-T01b — figure blocks end to end through pdf.js.
//
// The synthetic cases always run: a page that paints an image between a
// paragraph and its printed label must deliver a `figure` block reading
// **before** the caption, carrying the caption's text in
// `placeholder.description` while the caption keeps its own block
// (REQ-EXT-11); and a page of art with no text at all must still deliver
// its figure as its own chunk, so a plate page never loses it.
//
// The corpus case needs `corpus/public` and is skipped when the file is
// absent: page 3 of the arXiv paper carries the heatmap of Fig. 1, and a
// real `figure` must reach the Book at the place it reads.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBook, ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

const BODY = 12;
/** Image at user (100,400)-(300,490): top310, bottom 400 on a 800pt page. */
const IMAGE = "q 200 0 0 90 100 400 cm /Im1 Do Q";

/** Page 0: paragraph, image, caption, paragraph — the figure reads between. */
const FIGURE_PAGE = [
  textStream("The chart below shows the growth of the sample.", { x: 100, y: 600, size: BODY }),
  IMAGE,
  // Baseline 380 → line top 420, twenty points under the image: the caption
  // gap of the plan (3 x body) is 36.
  textStream("Fig. 1 - Growth of the sample.", { x: 100, y: 380, size: BODY }),
  textStream("After the figure the text continues normally.", { x: 100, y: 340, size: BODY }),
].join("\n");

/** Page 1: art only — the plate page keeps its figure (REQ-EXT-11). */
const PLATE_PAGE = IMAGE;

function figurePdf(): Uint8Array {
  return buildPdf([FIGURE_PAGE, PLATE_PAGE], {
    fonts: { F1: "Helvetica" },
    images: { Im1: { width: 2, height: 2 } },
  });
}

describe("figure blocks through pdf.js (synthetic)", () => {
  it("reads the figure between its paragraph and its caption (E10-T01b)", async () => {
    const book = buildBook(await ingestPdfjs(figurePdf(), { fileName: "figure-block.pdf" }));

    const page = book.blocks.filter((block) => block.origin.pageFrom === 0);
    expect(page.map((block) => block.kind)).toEqual([
      "paragraph",
      "figure",
      "caption",
      "paragraph",
    ]);
    const figure = page[1];
    expect(figure?.origin.bbox).toEqual([{ x: 100, y: 310, width: 200, height: 90 }]);
    // The caption reads as its own block and a copy of its text sits in the
    // placeholder — the plan's Opção A, no schema bump.
    expect(figure?.runs).toEqual([]);
    const caption = page[2];
    expect(caption?.kind).toBe("caption");
    expect(figure?.placeholder?.description).toBe(caption?.runs[0]?.text);
    expect(figure?.placeholder?.description).toContain("Fig. 1");
    expect(book.blocks.map((block) => block.origin.pageFrom)).toEqual([0, 0, 0, 0, 1]);
  });

  it("keeps the figure of a page with no text as its own chunk", async () => {
    const book = buildBook(await ingestPdfjs(figurePdf(), { fileName: "plate.pdf" }));

    const plate = book.blocks.filter((block) => block.origin.pageFrom === 1);
    expect(plate).toHaveLength(1);
    expect(plate[0]?.kind).toBe("figure");
    expect(plate[0]?.origin.bbox).toEqual([{ x: 100, y: 310, width: 200, height: 90 }]);
    // Nothing sits under the plate, so no caption was claimed for it.
    expect(plate[0]?.placeholder).toBeUndefined();
    // Every id of the document stays unique (one id per block, REQ-EXT-01).
    expect(new Set(book.blocks.map((block) => block.id)).size).toBe(book.blocks.length);
  });
});

describe("figure blocks against the public corpus (skipped without corpus/public)", () => {
  const phobos = path.join(repoRoot, "corpus", "public", "n2-en-arxiv-phobos.pdf");

  it("reads a figure of page 3 of the arXiv paper into the Book", async (context) => {
    if (!existsSync(phobos)) {
      context.skip();
      return;
    }
    const bytes = new Uint8Array(readFileSync(phobos));
    const document = await ingestPdfjs(bytes, {
      fileName: "n2-en-arxiv-phobos.pdf",
      pageRange: { from: 3, to: 3 },
    });
    const book = buildBook(document);

    const figures = book.blocks.filter((block) => block.kind === "figure");
    expect(figures.length).toBeGreaterThanOrEqual(1);
    // The heatmap of Fig. 1 measured by E10-T01: left edge under 60pt, more
    // than 200pt wide, over 150pt tall.
    expect(
      figures.some((block) => {
        const box = block.origin.bbox?.[0];
        return box !== undefined && box.x < 60 && box.width > 200 && box.height > 150;
      }),
    ).toBe(true);
  });
});
