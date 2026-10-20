import type { BBox } from "@pagepace/schema";
import type { TextLine } from "./lines";
import type { JoinedParagraph } from "./pagejoin";

/**
 * Block bounding boxes (E7-T04 — REQ-EXT-12).
 *
 * Every block of the `Book` carries `origin.bbox`: one box per page the
 * block touches, in page order, in top-left page coordinates (the same
 * coordinates `RawTextItem` uses — the schema's `BBox`). A box is the union
 * of the lines of the block on that page, so "ver original" can frame the
 * region without re-running the extraction (ADR-074; generalises the
 * margin_ref-only box of ADR-065, whose value is unchanged — the union of a
 * one-line block is that line's own box).
 *
 * A cross-page paragraph gets one box per page (`bbox[0]` is the box on
 * `origin.pageFrom`, `bbox[n]` the one on `origin.pageTo`), which is the
 * order `applyOverlay`'s merge keeps concatenating (ADR-072).
 *
 * Coordinates are rounded to `BBOX_DECIMALS` places so the same bytes always
 * produce the same JSON (REQ-EXT-16).
 */

/** Decimal places kept in every `origin.bbox` coordinate (deterministic rounding). */
export const BBOX_DECIMALS = 2;

function roundCoordinate(value: number): number {
  const factor = 10 ** BBOX_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * Union of the boxes of `lines`: leftmost `x`, topmost `top`, and the width
 * and height that reach the rightmost and lowest edges. `null` when there is
 * nothing to frame (a block never has zero lines, the guard is for callers).
 */
export function linesBBox(lines: readonly TextLine[]): BBox | null {
  if (lines.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    left = Math.min(left, line.x);
    top = Math.min(top, line.top);
    right = Math.max(right, line.x + line.width);
    bottom = Math.max(bottom, line.bottom);
  }
  return {
    x: roundCoordinate(left),
    y: roundCoordinate(top),
    width: roundCoordinate(right - left),
    height: roundCoordinate(bottom - top),
  };
}

/**
 * Maps every line of the document to the page it sits on. `joinCrossPageParagraphs`
 * keeps the line objects of `groupDocumentParagraphs`, so identity lookup is
 * exact — no re-measurement, no guesswork.
 */
export function linePageMap(
  pages: readonly (readonly (readonly TextLine[])[])[],
): Map<TextLine, number> {
  const map = new Map<TextLine, number>();
  for (const [pageIndex, page] of pages.entries()) {
    for (const paragraph of page) {
      for (const line of paragraph) {
        map.set(line, pageIndex);
      }
    }
  }
  return map;
}

/**
 * One box per page of `paragraph`, in page order. The page of each line
 * comes from `linePages` (`linePageMap`); a line missing from the map (a
 * caller built the paragraph by hand) falls back to the paragraph's first
 * page instead of dropping content.
 */
export function paragraphBBoxes(
  paragraph: JoinedParagraph,
  linePages: ReadonlyMap<TextLine, number>,
): BBox[] {
  const byPage = new Map<number, TextLine[]>();
  for (const line of paragraph.lines) {
    const pageIndex = linePages.get(line) ?? paragraph.pageFrom;
    const bucket = byPage.get(pageIndex);
    if (bucket === undefined) byPage.set(pageIndex, [line]);
    else bucket.push(line);
  }
  const boxes: BBox[] = [];
  for (const pageIndex of [...byPage.keys()].sort((a, b) => a - b)) {
    const box = linesBBox(byPage.get(pageIndex) ?? []);
    if (box !== null) boxes.push(box);
  }
  return boxes;
}
