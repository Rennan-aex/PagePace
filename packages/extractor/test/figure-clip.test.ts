// E10-T04 — the figure clip of ADR-016, end to end.
//
// ADR-016 lets the reader show an image crop of figure/table/equation
// blocks in normal reading — the page itself stays forbidden — and skips
// them in dynamic reading. The extractor's half of that promise is the
// block's `origin.bbox`: feed it to `renderPageRegion` and the canvas
// comes back with the block's pixels. The control renders a region of the
// same page with no ink and must stay white, so the crop follows the
// block's area and never the whole page. The mode gate (normal only,
// dynamic skips non-textual blocks) lives in the app — A-015.
import { createCanvas } from "@napi-rs/canvas";
import { buildBook, ingestPdfjs, renderPageRegion } from "@pagepace/extractor";
import type { BBox } from "@pagepace/schema";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

const BODY = 12;
/** Image at user (100,400)-(300,490): top 310, bottom 400 on a 600x800 page. */
const IMAGE = "q 200 0 0 90 100 400 cm /Im1 Do Q";

/** Page: paragraph, image, caption, paragraph — the figure sits between. */
const FIGURE_PAGE = [
  textStream("The chart below shows the growth of the sample.", { x: 100, y: 600, size: BODY }),
  IMAGE,
  textStream("Fig. 1 - Growth of the sample.", { x: 100, y: 380, size: BODY }),
  textStream("After the figure the text continues normally.", { x: 100, y: 340, size: BODY }),
].join("\n");

/** Right margin below every line of text: no ink at all on the page. */
const BLANK_REGION: BBox = { x: 430, y: 550, width: 120, height: 180 };

const TARGET = { width: 400, height: 300 };

function figurePdf(): Uint8Array {
  return buildPdf([FIGURE_PAGE], {
    fonts: { F1: "Helvetica" },
    images: { Im1: { width: 2, height: 2 } },
  });
}

/** Renders one region of page 1 onto a real canvas; counts non-white pixels. */
async function countNonWhitePixels(pdf: PDFDocumentProxy, region: BBox): Promise<number> {
  const page = await pdf.getPage(1);
  const canvas = createCanvas(TARGET.width, TARGET.height);
  const context = canvas.getContext("2d");
  // Paper under the clip: outside `frame.clip` the canvas stays untouched
  // (transparent), and only the framed region is expected to carry ink.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await renderPageRegion(
    page,
    { width: canvas.width, height: canvas.height, getContext: () => context },
    { region },
  ).promise;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonWhite = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] !== 255 || pixels[index + 1] !== 255 || pixels[index + 2] !== 255) {
      nonWhite++;
    }
  }
  return nonWhite;
}

async function withPdf<T>(run: (pdf: PDFDocumentProxy) => Promise<T>): Promise<T> {
  const task = getDocument({ data: figurePdf(), verbosity: 0 });
  try {
    return await run(await task.promise);
  } finally {
    await task.destroy();
  }
}

describe("figure clip through renderPageRegion (ADR-016)", () => {
  it("renders the figure block's origin.bbox into non-white pixels", async () => {
    const book = buildBook(await ingestPdfjs(figurePdf(), { fileName: "figure-clip.pdf" }));
    const figure = book.blocks.find((block) => block.kind === "figure");
    expect(figure).toBeDefined();
    const region = figure?.origin.bbox?.[0];
    expect(region).toEqual({ x: 100, y: 310, width: 200, height: 90 });
    if (region === undefined) throw new Error("figure block without origin.bbox");

    const nonWhite = await withPdf((pdf) => countNonWhitePixels(pdf, region));
    expect(nonWhite).toBeGreaterThan(0);
  });

  it("keeps the crop on the block area: a blank region of the same page stays white", async () => {
    const nonWhite = await withPdf((pdf) => countNonWhitePixels(pdf, BLANK_REGION));
    expect(nonWhite).toBe(0);
  });
});
