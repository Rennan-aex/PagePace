// E10-T01 — non-text regions end to end through pdf.js.
//
// The synthetic cases always run: a page that paints one image XObject
// must deliver `page.nonText` with the painted box in top-left page
// coordinates (the same space `RawTextItem` uses), and a page without art
// must keep the key absent — the exact JSON it produced before E10. The
// corpus case needs `corpus/public` and is skipped when the file is absent:
// page 3 of the arXiv paper carries the heatmap of Fig. 1 (measured box
// x=37 y=56 255x191 on 2026-10-26).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/** Image at (100,300)-(220,390) in user space, y up: y=800-390=410 from the top. */
const FIGURE_STREAM = [
  textStream("A caption under the figure", { x: 100, y: 280, size: 11 }),
  "q 120 0 0 90 100 300 cm /Im1 Do Q",
].join("\n");

describe("page.nonText through pdf.js (synthetic)", () => {
  it("delivers the painted image box in top-left page coordinates", async () => {
    const bytes = buildPdf([FIGURE_STREAM], {
      fonts: { F1: "Helvetica" },
      images: { Im1: { width: 2, height: 2 } },
    });
    const document = await ingestPdfjs(bytes, { fileName: "figure.pdf" });

    expect(document.pages[0]?.nonText).toEqual([
      { bbox: { x: 100, y: 410, width: 120, height: 90 }, kind: "image" },
    ]);
  });

  it("keeps the key absent on a page with no art (byte-identical to pre-E10)", async () => {
    const bytes = buildPdf([textStream("Just words.", { x: 72, y: 700 })], {
      fonts: { F1: "Helvetica" },
    });
    const document = await ingestPdfjs(bytes, { fileName: "plain.pdf" });

    expect(document.pages[0]?.nonText).toBeUndefined();
  });
});

describe("page.nonText against the public corpus (skipped without corpus/public)", () => {
  const phobos = path.join(repoRoot, "corpus", "public", "n2-en-arxiv-phobos.pdf");

  it("reads the heatmap of Fig. 1 on page 3", async (context) => {
    if (!existsSync(phobos)) {
      context.skip();
      return;
    }
    const bytes = new Uint8Array(readFileSync(phobos));
    const document = await ingestPdfjs(bytes, {
      fileName: "n2-en-arxiv-phobos.pdf",
      pageRange: { from: 3, to: 3 },
    });

    const regions = document.pages[0]?.nonText ?? [];
    expect(
      regions.some(
        (region) =>
          region.kind === "image" &&
          region.bbox.x < 60 &&
          region.bbox.y < 80 &&
          region.bbox.width > 200 &&
          region.bbox.height > 150,
      ),
    ).toBe(true);
  });
});
