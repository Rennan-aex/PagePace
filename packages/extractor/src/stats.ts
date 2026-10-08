import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";

export class StatsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatsError";
  }
}

export interface DocumentMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DocumentStats {
  /** Weighted mode of the item font sizes (weight = non-space characters). */
  bodyFontSize: number;
  /** Typical distance between consecutive text lines, in points. */
  lineHeight: number;
  /** Text box of the document relative to the page box, in points. */
  margins: DocumentMargins;
  /** Width of the text column (`xMax - xMin`), in points. */
  columnWidth: number;
  pagesMeasured: number;
  itemsMeasured: number;
}

export const LINE_HEIGHT_MIN_FACTOR = 0.5;
export const LINE_HEIGHT_MAX_FACTOR = 3;
export const LINE_HEIGHT_FALLBACK_FACTOR = 1.2;

const round2 = (value: number): number => Math.round(value * 100) / 100;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

function weightOf(text: string): number {
  let weight = 0;
  for (const char of text) {
    if (!/\s/.test(char)) weight++;
  }
  return weight > 0 ? weight : 1;
}

function bodyFontSizeOf(items: readonly RawTextItem[]): number {
  const weights = new Map<number, number>();
  for (const item of items) {
    const size = round2(item.fontSize);
    weights.set(size, (weights.get(size) ?? 0) + weightOf(item.text));
  }
  let best = 0;
  let bestWeight = -1;
  for (const [size, weight] of [...weights].sort((a, b) => a[0] - b[0])) {
    if (weight > bestWeight) {
      best = size;
      bestWeight = weight;
    }
  }
  return best;
}

function overlapsHorizontally(a: RawTextItem, b: RawTextItem): boolean {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0;
}

function lineGapsOf(pages: readonly RawPage[], body: number): number[] {
  const minGap = LINE_HEIGHT_MIN_FACTOR * body;
  const maxGap = LINE_HEIGHT_MAX_FACTOR * body;
  const gaps: number[] = [];
  for (const page of pages) {
    const sorted = [...page.items].sort((a, b) => a.y - b.y || a.x - b.x);
    for (let index = 0; index < sorted.length; index++) {
      const above = sorted[index] as RawTextItem;
      for (let next = index + 1; next < sorted.length; next++) {
        const below = sorted[next] as RawTextItem;
        const gap = below.y - above.y;
        if (gap < minGap) continue;
        if (gap > maxGap) break;
        if (overlapsHorizontally(above, below)) {
          gaps.push(gap);
          break;
        }
      }
    }
  }
  return gaps;
}

interface PageBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
  columnWidth: number;
}

function pageBoxOf(page: RawPage): PageBox {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  for (const item of page.items) {
    xMin = Math.min(xMin, item.x);
    xMax = Math.max(xMax, item.x + item.width);
    yMin = Math.min(yMin, item.y);
    yMax = Math.max(yMax, item.y + item.height);
  }
  return {
    top: yMin,
    right: page.width - xMax,
    bottom: page.height - yMax,
    left: xMin,
    columnWidth: xMax - xMin,
  };
}

export function documentStats(document: RawDocument): DocumentStats {
  const pages = document.pages.filter((page) => page.items.length > 0);
  let itemsMeasured = 0;
  for (const page of pages) itemsMeasured += page.items.length;
  if (itemsMeasured === 0) throw new StatsError("document has no text items");

  const body = bodyFontSizeOf(pages.flatMap((page) => page.items));
  const gaps = lineGapsOf(pages, body);
  const lineHeight =
    gaps.length > 0 ? round2(median(gaps)) : round2(body * LINE_HEIGHT_FALLBACK_FACTOR);

  const boxes = pages.map(pageBoxOf);
  return {
    bodyFontSize: body,
    lineHeight,
    margins: {
      top: round2(median(boxes.map((box) => box.top))),
      right: round2(median(boxes.map((box) => box.right))),
      bottom: round2(median(boxes.map((box) => box.bottom))),
      left: round2(median(boxes.map((box) => box.left))),
    },
    columnWidth: round2(median(boxes.map((box) => box.columnWidth))),
    pagesMeasured: pages.length,
    itemsMeasured,
  };
}
