import type { RawDocument, RawNonTextRegion, RawPage, RawTextItem } from "@pagepace/schema";
import { groupItemLines } from "./lines";
import { documentStats } from "./stats";

/**
 * Column detection (E6-T01 — layer 3, "layout").
 *
 * The page is projected onto the x axis at the **item** level — the
 * projection itself cannot use visual lines because `groupLines` joins
 * same-baseline items across the gutter (the single-column assumption E6
 * removes; the later line-gap gate does use them, one page at a time). An
 * item votes on a bin when its center sits inside it or when it fully
 * crosses it; items that
 * merely clip a bin edge never vote (measured on `n2-en-arxiv-phobos`, where
 * per-character math items would otherwise smear every band). A band where
 * almost nobody votes — at most `COLUMNS_SPANNING_MAX_SHARE` of the busiest
 * bin — is a candidate gutter. A gutter must be at least
 * `COLUMNS_MIN_GUTTER_FACTOR` body fonts wide and must have text on both
 * sides; a column must hold at least `COLUMNS_MIN_COLUMN_SHARE` of the
 * non-spanning items and of the content width, which is what keeps ragged
 * verse, a block-quote indent, printed margin numbers and stray slivers from
 * splitting a single-column page.
 *
 * Items that cross a kept gutter (a title or an abstract spanning the
 * columns) are reported in `spanningItems`, and so are `nonText` regions —
 * a figure that sits across the columns must never be cut in half. The count
 * is capped at `COLUMNS_MAX`; extra gutters are dropped widest-last.
 *
 * A page the plain projection reads as one column gets a second pass with
 * the spanning rows cut out of it (`projectColumns` with `rowCut`), accepted
 * only when the visual lines carry an interior gap at the gutter
 * (`lineGapCarriesGutter`): that is how the two-column body under the
 * full-width abstract of `n2-en-astrofisica` p1 is recovered while the
 * single-column pages of full-width lines stay whole.
 *
 * Known limits: the decision is per page and per projection only (no XY-cut
 * recursion — the reading order of E6-T02 consumes `columns`/`gutters` and
 * `spanningItems` as a flat "spanning band first, then columns left to
 * right" rule), a page whose columns are severely unbalanced falls back to
 * one column on purpose, and a two-column page whose baselines never align
 * across the gutter has no line with a companion and stays one column.
 */

/** Largest column count the detector reports (3 — books and papers rarely use more). */
export const COLUMNS_MAX = 3;
/** Width of one projection bin, in points — fine bins keep the reported gutter edges exact. */
export const COLUMNS_BIN_WIDTH = 1;
/** Crossing items above this share of the busiest bin disqualify the gutter (a spanning title is fine, a wall of full-width items is not). */
export const COLUMNS_SPANNING_MAX_SHARE = 0.3;
/** Even the smallest page tolerates one crossing item (the title). */
export const COLUMNS_MIN_CROSSING_LINES = 1;
/** Minimum gutter width as a multiple of the body font size. */
export const COLUMNS_MIN_GUTTER_FACTOR = 1;
/** Minimum non-spanning items a column must hold. */
export const COLUMNS_MIN_COLUMN_LINES = 2;
/** Minimum share of the non-spanning items a column must hold. */
export const COLUMNS_MIN_COLUMN_SHARE = 0.25;
/** Minimum share of the content width a column must occupy (a stray sliver is not a column). */
export const COLUMNS_MIN_COLUMN_WIDTH_SHARE = 0.2;
/** Items wider than this share of the content width belong to no column: they are the band that spans the page (title, abstract, running foot). */
export const COLUMNS_SPANNING_MIN_WIDTH_SHARE = 0.6;
/** Interior whitespace a line must show at the gutter to prove the cut: a multiple of the body font, so word spacing (below half a font) never counts. */
export const COLUMNS_LINE_GAP_MIN_FACTOR = 0.75;
/** Share of the lines with a companion that must carry that gap (measured 0,53 on `n2-en-astrofisica` p1, at most 0,25 on the corpus false positives of the cut). */
export const COLUMNS_LINE_GAP_MIN_SHARE = 0.35;
/** Absolute floor of gap-carrying lines: two lines of evidence prove nothing. */
export const COLUMNS_LINE_GAP_MIN_LINES = 3;

/** A detected column or gutter: a horizontal span in page coordinates (points). */
export interface ColumnRange {
  x: number;
  width: number;
}

/** Column layout of one page. */
export interface PageColumns {
  /** Number of text columns (1..`COLUMNS_MAX`; 1 when the page has no items). */
  count: number;
  /** Column boxes left to right (empty when the page has no items). */
  columns: ColumnRange[];
  /** Gutter boxes left to right; empty on a single-column page. */
  gutters: ColumnRange[];
  /** Per input item (same order as `page.items`): the item crosses a gutter (spanning title/abstract). */
  spanningItems: boolean[];
  /** Per `nonText` region: the region crosses a gutter (spanning figure/table). */
  regionSpanning: boolean[];
}

export interface ColumnDetectionOptions {
  /** Body font size of the document (pt) — the minimum gutter is relative to it. */
  bodyFontSize: number;
  /** Non-text regions of the page, flagged the same way as spanning items. */
  nonText?: readonly RawNonTextRegion[];
}

function singleColumn(
  items: readonly RawTextItem[],
  nonText: readonly RawNonTextRegion[],
): PageColumns {
  const left = items.length === 0 ? 0 : Math.min(...items.map((entry) => entry.x));
  const right = items.length === 0 ? 0 : Math.max(...items.map((entry) => entry.x + entry.width));
  return {
    count: 1,
    columns: items.length === 0 ? [] : [{ x: left, width: right - left }],
    gutters: [],
    spanningItems: items.map(() => false),
    regionSpanning: nonText.map(() => false),
  };
}

/**
 * Whether an item votes on the bin `[start, end)`: its center sits inside or
 * it spans the whole bin (closed edges, so an item that starts exactly on a
 * column edge still votes on that edge bin). Items that merely clip a bin
 * never vote — per-character math runs of `n2-en-arxiv-phobos` end a
 * fraction of a point past a column edge and would otherwise smear every
 * band with phantom crossings.
 */
function votesOnBin(entry: RawTextItem, start: number, end: number): boolean {
  const center = entry.x + entry.width / 2;
  if (center >= start && center < end) return true;
  return entry.x <= start && entry.x + entry.width >= end;
}

/** Whether a spanning item (or region) crosses the gutter at all. */
function crosses(box: { x: number; width: number }, gutter: ColumnRange): boolean {
  const center = box.x + box.width / 2;
  if (center >= gutter.x && center < gutter.x + gutter.width) return true;
  return box.x <= gutter.x && box.x + box.width >= gutter.x + gutter.width;
}

/** Splits the content box at the gutters, left to right. */
function splitColumns(left: number, right: number, gutters: readonly ColumnRange[]): ColumnRange[] {
  const columns: ColumnRange[] = [];
  let cursor = left;
  for (const gutter of gutters) {
    columns.push({ x: cursor, width: gutter.x - cursor });
    cursor = gutter.x + gutter.width;
  }
  columns.push({ x: cursor, width: right - cursor });
  return columns;
}

interface RowSpan {
  top: number;
  bottom: number;
}

/**
 * Vertical intervals of the rows opened by an item wider than
 * `COLUMNS_SPANNING_MIN_WIDTH_SHARE` of the content width, merged where they
 * touch: one spanning item opens the whole row (every item on that baseline
 * belongs to the spanning band, not to a column).
 */
function spanningRowSpans(items: readonly RawTextItem[], contentWidth: number): RowSpan[] {
  const limit = COLUMNS_SPANNING_MIN_WIDTH_SHARE * contentWidth;
  const wide = items
    .filter((entry) => entry.width >= limit)
    .map((entry) => ({ top: entry.y, bottom: entry.y + entry.height }))
    .sort((a, b) => a.top - b.top);
  const spans: RowSpan[] = [];
  for (const span of wide) {
    const last = spans[spans.length - 1];
    if (last !== undefined && span.top <= last.bottom) {
      last.bottom = Math.max(last.bottom, span.bottom);
      continue;
    }
    spans.push({ ...span });
  }
  return spans;
}

/** Whether an item sits on (or touches) one of the spanning rows. */
function onSpanningRow(entry: RawTextItem, spans: readonly RowSpan[]): boolean {
  const top = entry.y;
  const bottom = entry.y + entry.height;
  for (const span of spans) {
    if (span.top > bottom) return false;
    if (bottom >= span.top && top <= span.bottom) return true;
  }
  return false;
}

/**
 * Detects the columns of one page from its raw text items (layer 3).
 *
 * Two passes: the plain projection runs first and any page it reads as two or
 * three columns is returned untouched; only a page it reads as one column is
 * projected again with the spanning rows cut out of it, and the cut result is
 * accepted only when the visual lines actually carry an interior gap inside
 * the gutter (`lineGapCarriesGutter`). The cut alone flips real pages
 * (`n2-en-astrofisica` p1) and false ones (`n3-en-scielo-climatejustice` p3)
 * alike; the line gap is what tells them apart.
 *
 * Pure and deterministic: the same items always produce the same result and
 * the input is never mutated.
 */
export function detectColumns(
  items: readonly RawTextItem[],
  options: ColumnDetectionOptions,
): PageColumns {
  const nonText = options.nonText ?? [];
  // No measurable body size: a gutter as narrow as a space would "count".
  if (items.length === 0 || !(options.bodyFontSize > 0)) {
    return singleColumn(items, nonText);
  }

  const base = projectColumns(items, options, false);
  if (base.count > 1) return base;
  const cut = projectColumns(items, options, true);
  if (cut.count > 1 && lineGapCarriesGutter(items, cut.gutters, options.bodyFontSize)) {
    return cut;
  }
  return base;
}

/**
 * Whether the visual lines of the page carry the gutter: at least
 * `COLUMNS_LINE_GAP_MIN_SHARE` of the lines that have a companion on the
 * other side show an interior gap of `COLUMNS_LINE_GAP_MIN_FACTOR` body
 * fonts inside one of the gutters. Word spacing stays below that floor, so a
 * single-column page of full-width lines never qualifies — while the
 * two-column body of `n2-en-astrofisica` p1 breaks at the same x on every
 * line (measured: 0,53 there against at most 0,25 on the corpus false
 * positives of the row cut).
 */
function lineGapCarriesGutter(
  items: readonly RawTextItem[],
  gutters: readonly ColumnRange[],
  bodyFontSize: number,
): boolean {
  const floor = COLUMNS_LINE_GAP_MIN_FACTOR * bodyFontSize;
  let eligible = 0;
  let hits = 0;
  for (const line of groupItemLines(items)) {
    // A line of one item (the full-width rows) proves nothing either way.
    if (line.items.length < 2) continue;
    eligible += 1;
    const sorted = [...line.items].sort((a, b) => a.x - b.x);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous === undefined || current === undefined) continue;
      const gapStart = previous.x + previous.width;
      const gapEnd = current.x;
      if (gapEnd - gapStart < floor) continue;
      if (gutters.some((gutter) => gapStart < gutter.x + gutter.width && gapEnd > gutter.x)) {
        hits += 1;
        break;
      }
    }
  }
  return hits >= COLUMNS_LINE_GAP_MIN_LINES && hits >= COLUMNS_LINE_GAP_MIN_SHARE * eligible;
}

/**
 * One projection pass of `detectColumns`. With `rowCut` the rows opened by a
 * spanning item leave the projection (the horizontal cut of an XY-cut taken
 * before the x projection): on `n2-en-astrofisica` p1 those rows vote on
 * every bin and push a real gutter past the crossing gate; on a
 * single-column page almost every row is full width, the projection empties
 * out and the page keeps its one column.
 */
function projectColumns(
  items: readonly RawTextItem[],
  options: ColumnDetectionOptions,
  rowCut: boolean,
): PageColumns {
  const nonText = options.nonText ?? [];

  const contentLeft = Math.min(...items.map((entry) => entry.x));
  const contentRight = Math.max(...items.map((entry) => entry.x + entry.width));
  const contentWidth = contentRight - contentLeft;
  if (contentWidth <= COLUMNS_BIN_WIDTH) return singleColumn(items, nonText);

  const rowSpans = rowCut ? spanningRowSpans(items, contentWidth) : [];
  const projection = items.filter((entry) => !onSpanningRow(entry, rowSpans));
  if (projection.length === 0) return singleColumn(items, nonText);

  // 1. Projection: how many items vote on each bin of the content box.
  const binCount = Math.ceil(contentWidth / COLUMNS_BIN_WIDTH);
  const coverage: number[] = [];
  for (let bin = 0; bin < binCount; bin++) {
    const start = contentLeft + bin * COLUMNS_BIN_WIDTH;
    const end = start + COLUMNS_BIN_WIDTH;
    let votes = 0;
    for (const entry of projection) {
      if (votesOnBin(entry, start, end)) votes += 1;
    }
    coverage.push(votes);
  }
  // The gate is relative to the busiest bin (the body of a column), not to
  // the item count: per-character pages carry hundreds of items that never
  // pile up on one band.
  const peak = coverage.length === 0 ? 0 : Math.max(...coverage);
  const maxCrossings = Math.max(COLUMNS_MIN_CROSSING_LINES, COLUMNS_SPANNING_MAX_SHARE * peak);

  // 2. Merge contiguous candidates; keep only gutters wide enough and with
  // text on both sides (a band touching a content edge is a margin, not a
  // gutter — that is what keeps printed margin numbers out).
  const minGutter = COLUMNS_MIN_GUTTER_FACTOR * options.bodyFontSize;
  const gutters: ColumnRange[] = [];
  let runStart = -1;
  for (let bin = 0; bin <= binCount; bin++) {
    const candidate = bin < binCount && (coverage[bin] ?? 0) <= maxCrossings;
    if (candidate && runStart === -1) runStart = bin;
    if (!candidate && runStart !== -1) {
      const x = contentLeft + runStart * COLUMNS_BIN_WIDTH;
      const width = (bin - runStart) * COLUMNS_BIN_WIDTH;
      const touchesEdge = x <= contentLeft || x + width >= contentRight;
      if (!touchesEdge && width >= minGutter) gutters.push({ x, width });
      runStart = -1;
    }
  }
  if (gutters.length === 0) return singleColumn(items, nonText);

  // 3. Cap at COLUMNS_MAX: the widest gutters survive (ties: leftmost).
  const kept = [...gutters]
    .sort((a, b) => b.width - a.width || a.x - b.x)
    .slice(0, COLUMNS_MAX - 1)
    .sort((a, b) => a.x - b.x);

  // 4. Every column must hold a real share of the non-spanning items and of
  // the content width — otherwise the gutter was an artifact (ragged edge,
  // deep indent, stray sliver beside the text block).
  const spanningItems = items.map((entry) => kept.some((gutter) => crosses(entry, gutter)));
  const columns = splitColumns(contentLeft, contentRight, kept);
  const voters = items.filter((_, index) => spanningItems[index] !== true);
  const required = Math.max(
    COLUMNS_MIN_COLUMN_LINES,
    Math.ceil(COLUMNS_MIN_COLUMN_SHARE * voters.length),
  );
  const minWidth = COLUMNS_MIN_COLUMN_WIDTH_SHARE * contentWidth;
  for (const column of columns) {
    if (column.width < minWidth) return singleColumn(items, nonText);
    const inside = voters.filter(
      (entry) =>
        entry.x + entry.width / 2 >= column.x &&
        entry.x + entry.width / 2 < column.x + column.width,
    ).length;
    if (inside < required) return singleColumn(items, nonText);
  }

  const regionSpanning = nonText.map((region) =>
    kept.some((gutter) => crosses(region.bbox, gutter)),
  );
  return { count: columns.length, columns, gutters: kept, spanningItems, regionSpanning };
}

/** Detects the columns of one page from its raw text items. */
export function detectPageColumns(page: RawPage, options: ColumnDetectionOptions): PageColumns {
  return detectColumns(page.items, {
    bodyFontSize: options.bodyFontSize,
    nonText: page.nonText ?? [],
  });
}

/** Detects the columns of every page, in page order (body size measured from the document when omitted). */
export function detectDocumentColumns(
  document: RawDocument,
  options?: { bodyFontSize?: number },
): PageColumns[] {
  const bodyFontSize = options?.bodyFontSize ?? documentStats(document).bodyFontSize;
  return document.pages.map((page) => detectPageColumns(page, { bodyFontSize }));
}
