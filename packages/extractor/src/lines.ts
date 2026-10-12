import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";

/**
 * Items → visual lines (E2-T02).
 *
 * An item joins the closest line above it when one of two signals holds: its
 * baseline (`y + height` — the ingestion keeps the box anchored on the PDF
 * baseline) is within `LINE_BASELINE_TOLERANCE_FACTOR` of its own font size,
 * or the two boxes overlap by `LINE_OVERLAP_MIN_FACTOR` of the item's height
 * (raised/lowered items: superscripts, subscripts, mixed sizes on a line).
 *
 * pdf.js also emits zero-height items for spaces and line ends; they join a
 * line whose box fits them vertically but never open one, so a marker can not
 * create a phantom line. Lines come out top to bottom, items left to right.
 *
 * Known limits: the page is treated as one column, so two-column pages
 * interleave until E6; the tolerance never sees the page statistics, only the
 * item itself, which keeps the function pure and per page.
 */

/** Baseline distance (as a fraction of the item's font size) that still joins a line. */
export const LINE_BASELINE_TOLERANCE_FACTOR = 0.5;
/** Vertical overlap (as a fraction of the item's height) that still joins a line. */
export const LINE_OVERLAP_MIN_FACTOR = 0.5;

export interface TextLine {
  /** Items of the line ordered left to right (spaces and markers included). */
  items: RawTextItem[];
  /** Top edge of the line's text, in points. */
  top: number;
  /** Baseline of the line (`y + height` of its items), in points. */
  bottom: number;
  /** Left edge of the items that carry text, in points. */
  x: number;
  /** Width of the items that carry text (`right - left`), in points. */
  width: number;
  /** Largest font size of the items that carry text, in points. */
  fontSize: number;
}

interface MutableLine extends LineBox {
  items: RawTextItem[];
}

const hasContent = (item: RawTextItem): boolean => item.text.trim() !== "";
const baselineOf = (item: RawTextItem): number => item.y + item.height;

/**
 * Vertical box a line accumulates as items join it: the anchor baseline the
 * candidates compare to, plus the outermost top and bottom so far.
 */
export interface LineBox {
  /** Baseline of the first (topmost) item — the reference new items compare to. */
  anchor: number;
  top: number;
  bottom: number;
}

/**
 * Whether `item` belongs to the line box: the baseline test `groupLines` joins
 * by, plus the overlap fallback for raised/lowered items (superscripts). This
 * is one rule for both callers — `groupLines` builds lines with it and
 * `itemsText` asks it before a pdf.js line-end marker may break the text, so
 * a marker can never break where the line grouping itself would not.
 */
export function joinsLineBox(item: RawTextItem, box: LineBox): boolean {
  const tolerance = LINE_BASELINE_TOLERANCE_FACTOR * item.fontSize;
  if (Math.abs(baselineOf(item) - box.anchor) <= tolerance) return true;
  const overlap = Math.min(baselineOf(item), box.bottom) - Math.max(item.y, box.top);
  return overlap >= LINE_OVERLAP_MIN_FACTOR * item.height;
}

function joinsLine(item: RawTextItem, line: LineBox): boolean {
  return joinsLineBox(item, line);
}

function startLine(item: RawTextItem): MutableLine {
  return {
    anchor: baselineOf(item),
    top: item.y,
    bottom: baselineOf(item),
    items: [item],
  };
}

function growLine(line: MutableLine, item: RawTextItem): void {
  line.items.push(item);
  line.top = Math.min(line.top, item.y);
  line.bottom = Math.max(line.bottom, baselineOf(item));
}

/** Content first on ties, then font size and text: order never depends on input order. */
function compareItems(a: RawTextItem, b: RawTextItem): number {
  const rankA = hasContent(a) ? 0 : 1;
  const rankB = hasContent(b) ? 0 : 1;
  if (a.x !== b.x) return a.x - b.x;
  if (rankA !== rankB) return rankA - rankB;
  if (a.fontSize !== b.fontSize) return a.fontSize - b.fontSize;
  return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
}

function toTextLine(line: MutableLine): TextLine {
  const items = [...line.items].sort(compareItems);
  const content = items.filter(hasContent);
  const left = Math.min(...content.map((entry) => entry.x));
  const right = Math.max(...content.map((entry) => entry.x + entry.width));
  return {
    items,
    top: line.top,
    bottom: line.bottom,
    x: left,
    width: right - left,
    fontSize: Math.max(...content.map((entry) => entry.fontSize)),
  };
}

/** Groups the text items of one page into visual lines, top to bottom. */
export function groupLines(page: RawPage): TextLine[] {
  const ordered = [...page.items]
    .filter(hasContent)
    .sort((a, b) => baselineOf(a) - baselineOf(b) || a.x - b.x);
  const lines: MutableLine[] = [];
  for (const item of ordered) {
    let target: MutableLine | undefined;
    for (let index = lines.length - 1; index >= 0; index--) {
      const line = lines[index] as MutableLine;
      if (joinsLine(item, line)) {
        target = line;
        break;
      }
    }
    if (target === undefined) lines.push(startLine(item));
    else growLine(target, item);
  }

  // Spaces and pdf.js line-end markers (no content) ride along with the line
  // they sit in; without content they can not open a line of their own.
  for (const item of page.items) {
    if (hasContent(item)) continue;
    const baseline = baselineOf(item);
    const inside = lines.find((line) => baseline >= line.top && baseline <= line.bottom);
    if (inside !== undefined) {
      inside.items.push(item);
      continue;
    }
    const tolerance = LINE_BASELINE_TOLERANCE_FACTOR * item.fontSize;
    let nearest: MutableLine | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const distance = Math.abs(baseline - line.anchor);
      if (distance <= tolerance && distance < nearestDistance) {
        nearest = line;
        nearestDistance = distance;
      }
    }
    if (nearest !== undefined) nearest.items.push(item);
  }

  return lines.map(toTextLine).sort((a, b) => a.top - b.top || a.bottom - b.bottom || a.x - b.x);
}

/** Groups every page of a document, in page order. */
export function documentLines(document: RawDocument): TextLine[][] {
  return document.pages.map(groupLines);
}
