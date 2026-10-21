import { createCanvas } from "@napi-rs/canvas";
import { renderPageRegion } from "@pagepace/extractor";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Node adapter that renders PDF pages to PNG for `pagepace inspect` (E7-T05).
 *
 * The extractor never touches `fs` or a canvas implementation (rule 6); the
 * CLI is the adapter: it opens the bytes with pdf.js and draws through
 * `renderPageRegion` (ADR-075) onto an `@napi-rs/canvas` surface, then
 * encodes the pixels as PNG. The dependency is Apache-2.0 and Node-only,
 * which the CLI layer may carry (recorded with the task).
 */

/** Default width of one rendered page image, in canvas pixels. */
export const RENDER_PAGE_WIDTH = 720;

/**
 * Renders each 1-based page of `pages` into a PNG buffer at `width` canvas
 * pixels wide (height by the page's own ratio), opening the PDF once.
 */
export async function renderPagesPng(
  bytes: Uint8Array,
  pages: readonly number[],
  width: number = RENDER_PAGE_WIDTH,
): Promise<Map<number, Buffer>> {
  const output = new Map<number, Buffer>();
  if (pages.length === 0) return output;
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  try {
    const pdf = await task.promise;
    for (const pageNumber of pages) {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      await renderPageRegion(
        page,
        {
          width: canvas.width,
          height: canvas.height,
          getContext: () => context,
        },
        { scale },
      ).promise;
      output.set(pageNumber, canvas.toBuffer("image/png"));
    }
    return output;
  } finally {
    await task.destroy();
  }
}
