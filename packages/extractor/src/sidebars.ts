import type { RawTextItem } from "@pagepace/schema";
import { COLUMNS_MIN_COLUMN_SHARE } from "./columns";
import { groupItemLines, type TextLine } from "./lines";

/**
 * Side regions and sidebars (E6-T03 — layer 3, "layout").
 *
 * A band of prose sitting in the outer margin — a sidebar box, an editorial
 * note — is not a reading column: `groupItemLines` (E2-T02) joins
 * same-baseline items, so a side item glued to the body line it shares a
 * baseline with comes out interleaved in the text. The splitter claims the
 * band **before** the lines are built; `groupPageParagraphs` then groups the
 * lines of each band separately, reads the main flow first and the side
 * paragraphs last, and `buildBook` marks those blocks with
 * `flags: ["sidebar"]` (`SIDEBAR_FLAG`) — the block leaves the reading flow
 * by order and by flag, never by removal (the same contract as `margin_ref`,
 * E5-T07).
 *
 * The decision is geometric and deterministic (same items, same split):
 *
 * 1. **Bands** — the item intervals merged across gaps narrower than
 *    `SIDEBAR_MIN_GAP_FACTOR` body fonts (word gaps merge, a real corridor
 *    does not; the corridor is the same measure as a column gutter).
 * 2. **Main band** — the band holding the most items (ties: the widest);
 *    it must hold at least `SIDEBAR_MIN_MAIN_SHARE` of the items or the page
 *    is a multi-band layout and nothing is claimed.
 * 3. **Side band** — any other band whose width clears
 *    `SIDEBAR_MIN_WIDTH_FACTOR` body fonts (a margin-number column is
 *    narrower — E5-T07 keeps it) and `SIDEBAR_MAX_WIDTH_SHARE` of the
 *    content width (wider is a real column — E6-T01/T04's turf). The band
 *    is then cut into contiguous blocks (consecutive gaps ≤
 *    `SIDEBAR_MAX_LINE_GAP_FACTOR` times the typical leading) and each
 *    block is claimed on its own when it holds at least
 *    `SIDEBAR_MIN_LINES` visual lines and fewer items than
 *    `COLUMNS_MIN_COLUMN_SHARE` of the page (a block with a column's share
 *    is a column, and columns belong to `detectColumns`): an editorial
 *    panel and a citation box separated by big gaps are two side regions of
 *    one band, while scattered margin notes — single lines with gaps
 *    dwarfing the leading — claim nothing (ADR-081).
 *
 * The split runs **before** the column detector (`groupPageParagraphs`
 * calls it on every page, then `detectColumns` on what is left): a real
 * column never clears the item-share gate, so the column acceptance of
 * E6-T01/T02 cannot regress — a two-column page comes out of the splitter
 * untouched and is read exactly as E6-T02 read it.
 *
 * Known limits: a block holding a column's share of the items
 * (≥ `COLUMNS_MIN_COLUMN_SHARE`) is left to the column detector, even when
 * its band is narrow enough to look like a sidebar; a side paragraph still
 * goes through the kind heuristics of `buildBook` (a smaller side band at
 * the page foot may read as a footnote); a margin number that sits inside
 * the side band moves to the page end with it (the corpus has no such page
 * today).
 */

/** Value written to `Block.flags` for a side-region block. */
export const SIDEBAR_FLAG = "sidebar";
/** Corridor between a side band and the body, in body fonts (same measure as a column gutter). */
export const SIDEBAR_MIN_GAP_FACTOR = 1;
/** Visual lines a band needs to count as a side region. */
export const SIDEBAR_MIN_LINES = 3;
/** Minimum band width, in body fonts (a margin-number column is ~2–3). */
export const SIDEBAR_MIN_WIDTH_FACTOR = 4;
/** Maximum band width as a share of the content width (wider is a column). */
export const SIDEBAR_MAX_WIDTH_SHARE = 0.35;
/** Share of the items the main band must hold or nothing is claimed. */
export const SIDEBAR_MIN_MAIN_SHARE = 0.5;
/** Maximum gap between consecutive lines of a side region, in typical leadings. */
export const SIDEBAR_MAX_LINE_GAP_FACTOR = 1.5;

/** Which outer margin a side region sits in. */
export type SideBand = "left" | "right";

/** One claimed side region: its side and the raw items it holds. */
export interface SideRegion {
  side: SideBand;
  items: RawTextItem[];
}

/** The page split into the main flow (reading columns) and the side regions. */
export interface SideSplit {
  /** Items of the main flow, in input order. */
  main: RawTextItem[];
  /** Claimed side regions, left region before right region. */
  regions: SideRegion[];
}

export interface SideSplitOptions {
  /** Body font size of the document (pt) — the corridor and the width floor are relative to it. */
  bodyFontSize: number;
  /** Typical line spacing of the document (pt) — the contiguity gate compares to it. */
  lineHeight: number;
}

interface Band {
  x: number;
  right: number;
  items: RawTextItem[];
}

/** Merges item intervals across gaps narrower than `minGap`, left to right. */
function bandsOf(items: readonly RawTextItem[], minGap: number): Band[] {
  const ordered = [...items].sort((a, b) => a.x - b.x || a.width - b.width);
  const bands: Band[] = [];
  for (const entry of ordered) {
    const last = bands[bands.length - 1];
    if (last !== undefined && entry.x - last.right < minGap) {
      last.right = Math.max(last.right, entry.x + entry.width);
      last.items.push(entry);
      continue;
    }
    bands.push({ x: entry.x, right: entry.x + entry.width, items: [entry] });
  }
  return bands;
}

/**
 * The lines of a band cut into runs whose inner gaps stay within the limit;
 * runs shorter than `SIDEBAR_MIN_LINES` are not text blocks and drop out.
 * The whole-band contiguity rule, now per block: a band holding an
 * editorial panel and a citation box separated by big gaps claims each
 * block, while scattered margin notes (one line every few body lines) yield
 * only single-line runs and claim nothing.
 */
function clustersOf(lines: readonly TextLine[], lineHeight: number): TextLine[][] {
  if (lines.length === 0) return [];
  const limit =
    lineHeight > 0 ? SIDEBAR_MAX_LINE_GAP_FACTOR * lineHeight : Number.POSITIVE_INFINITY;
  const clusters: TextLine[][] = [[lines[0] as TextLine]];
  for (let index = 1; index < lines.length; index++) {
    const previous = lines[index - 1] as TextLine;
    const next = lines[index] as TextLine;
    if (next.top - previous.bottom > limit) clusters.push([]);
    (clusters[clusters.length - 1] as TextLine[]).push(next);
  }
  return clusters.filter((cluster) => cluster.length >= SIDEBAR_MIN_LINES);
}

/**
 * Splits the raw items of one page into the main flow and the side regions
 * that clear every gate (pure, deterministic, input never mutated). Returns
 * every item in `main` and no regions when any gate refuses.
 */
export function splitSideRegions(
  items: readonly RawTextItem[],
  options: SideSplitOptions,
): SideSplit {
  if (items.length === 0 || !(options.bodyFontSize > 0)) {
    return { main: [...items], regions: [] };
  }
  const contentLeft = Math.min(...items.map((entry) => entry.x));
  const contentRight = Math.max(...items.map((entry) => entry.x + entry.width));
  const contentWidth = contentRight - contentLeft;
  if (contentWidth <= 0) return { main: [...items], regions: [] };

  const bands = bandsOf(items, SIDEBAR_MIN_GAP_FACTOR * options.bodyFontSize);
  if (bands.length < 2) return { main: [...items], regions: [] };

  // The busiest band is the main flow; ties go to the wider one. Without a
  // clear majority the page is a multi-band layout, not a sidebar page.
  let mainIndex = 0;
  for (let index = 1; index < bands.length; index++) {
    const band = bands[index];
    const current = bands[mainIndex];
    if (band === undefined || current === undefined) continue;
    const moreItems = band.items.length > current.items.length;
    const sameItems = band.items.length === current.items.length;
    const wider = band.right - band.x > current.right - current.x;
    if (moreItems || (sameItems && wider)) mainIndex = index;
  }
  const mainBand = bands[mainIndex];
  if (mainBand === undefined || mainBand.items.length < SIDEBAR_MIN_MAIN_SHARE * items.length) {
    return { main: [...items], regions: [] };
  }

  const minWidth = SIDEBAR_MIN_WIDTH_FACTOR * options.bodyFontSize;
  const maxWidth = SIDEBAR_MAX_WIDTH_SHARE * contentWidth;
  const regions: SideRegion[] = [];
  for (const [index, band] of bands.entries()) {
    if (index === mainIndex || band === undefined) continue;
    const width = band.right - band.x;
    if (width < minWidth || width > maxWidth) continue;
    const side: SideBand = band.x < mainBand.x ? "left" : "right";
    for (const cluster of clustersOf(groupItemLines(band.items), options.lineHeight)) {
      const clusterItems = cluster.flatMap((line) => line.items);
      // A block with a column's share of the page's items is a column
      // (`COLUMNS_MIN_COLUMN_SHARE`), and columns belong to E6-T01.
      if (clusterItems.length >= COLUMNS_MIN_COLUMN_SHARE * items.length) continue;
      regions.push({ side, items: clusterItems });
    }
  }
  if (regions.length === 0) return { main: [...items], regions: [] };
  regions.sort((a, b) => (a.side === b.side ? 0 : a.side === "left" ? -1 : 1));

  const claimed = new Set(regions.flatMap((region) => region.items));
  return { main: items.filter((entry) => !claimed.has(entry)), regions };
}
