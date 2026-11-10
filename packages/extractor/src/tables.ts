import type { RawTextItem } from "@pagepace/schema";
import { claimsByLine, splitParagraphsAtClaims } from "./claims";
import type { TextLine } from "./lines";
import type { JoinedParagraph } from "./pagejoin";
import { spaceBetween } from "./spaces";
import { normalizeForReader } from "./unicode";

/**
 * Tables (E10-T02 — layer 4, "semântica").
 *
 * Rows of one band chain into a table when their cells sit at least
 * `TABLE_GAP_FACTOR` x the line font (never below the body size) apart and at
 * least `TABLE_MIN_GAPS` of those gaps align with the previous row's — 50% of
 * the smaller gap (`TABLE_LINK_OVERLAP`). A gap-less short row in the table's
 * font (the wrapped label of a stacked cell) is absorbed when it is close
 * (`TABLE_ABSORB_GAP_FACTOR` x body below) and narrow
 * (`TABLE_ABSORB_WIDTH_SHARE` of the table's span); prose, side lines, rows
 * under `TABLE_MIN_FONT_FACTOR` of the body, dot-leader contents lines and
 * rows carrying a relation symbol (`MATH_RELATION` — an equation line, which
 * is what keeps the aligned derivations of a paper out) never join. A gap
 * counts as a cell gap when a letter or a digit sits on both sides
 * (`CELL_ANCHOR`), or when one side is a standalone sign (`CELL_SIGN` — the
 * minus before a negative cell), so the bracket rows of a multi-line
 * formula and the tick labels of a plot never seed while a negative column
 * edge still anchors — and at claim time most of the chain's words must sit
 * in the document's dominant font family (`TABLE_ALNUM_FAMILY_SHARE` over
 * the items carrying a letter or a digit — figure annotations are set in
 * another family than the body, while the symbols of a math cell stay out
 * of the vote). A region
 * of `TABLE_MIN_LINES` lines carrying at least `TABLE_MIN_GAPS` gap rows
 * becomes one decision; its columns come from the gap-richest row and the
 * cells go out as TSV for `placeholder.description`.
 * `splitParagraphsAtTables` cuts the paragraphs at the claim, so a table
 * reads as one `table` block instead of prose lines glued to it.
 *
 * Known limits: a two-column table (one gap per row) never seeds, a single
 * cell row breaks the chain instead of joining it, and an equation grid
 * that carries no relation symbol at all still reads as a table until
 * E10-T03 claims it (ADR-100 priority: `table` above `equation`).
 */

/** Horizontal gap (x the line's font size) that separates two cells; never below the body size. */
export const TABLE_GAP_FACTOR = 1.2;
/** A row below this (x the body font) is figure annotation, not table text. */
export const TABLE_MIN_FONT_FACTOR = 0.55;
/** Cell gaps a row needs to seed a table, and aligned gaps to extend it. */
export const TABLE_MIN_GAPS = 2;
/** Overlap (share of the smaller gap) that counts two gaps as the same column. */
export const TABLE_LINK_OVERLAP = 0.5;
/** Vertical space (x body) still allowed between two rows of one table. */
export const TABLE_ROW_GAP_FACTOR = 1.5;
/** Vertical space (x body) still allowed above a gap-less row being absorbed. */
export const TABLE_ABSORB_GAP_FACTOR = 1.0;
/** An absorbed row is at most this share of the table's span (prose is wider). */
export const TABLE_ABSORB_WIDTH_SHARE = 0.75;
/** An absorbed row's font stays this close to the row carrying the gaps (lower bound). */
export const TABLE_ABSORB_FONT_MIN = 0.75;
/** An absorbed row's font stays this close to the row carrying the gaps (upper bound). */
export const TABLE_ABSORB_FONT_MAX = 1.15;
/** A dot-only item at least this wide (x body) is a contents leader, not content. */
export const TABLE_DOT_LEADER_FACTOR = 1.0;
/** A table needs at least this many lines to claim (a lone row is not a table). */
export const TABLE_MIN_LINES = 3;
/** Share of a table's letter/digit items that must sit in the dominant font family. */
export const TABLE_ALNUM_FAMILY_SHARE = 0.35;

/** One horizontal interval between two cells of a row, in points. */
type Gap = readonly [number, number];

/** A dot-only item wide enough to be a contents leader. */
const DOT_LEADER = /^[.·•‥…]+$/;

/** A relation symbol: the row is part of an equation, never a table row. */
const MATH_RELATION = /[=≈≃≡≤≥≪≫]/;

/** A letter or a digit: both sides of a cell gap need one — brackets are not cells. */
const CELL_ANCHOR = /[\p{L}\p{N}]/u;

/** A standalone sign: the negative cell beside it still anchors the gap. */
const CELL_SIGN = /^[-−–—]$/;

/** One table of the document, ready to become a `table` block (E10-T02). */
export interface TableDecision {
  /** Marks the decision, like `quote`/`list`/`caption`. */
  table: true;
  /** Lines of the table in reading order — one cell row each. */
  lines: TextLine[];
  /** Cells of each line, columns left to right ("" when the row has none). */
  cells: string[][];
}

/** Whether the line may take part in a table at all (E10-T02). */
function eligible(line: TextLine, bodyFontSize: number): boolean {
  if (line.side === true) return false;
  if (line.fontSize < TABLE_MIN_FONT_FACTOR * bodyFontSize) return false;
  const minWidth = TABLE_DOT_LEADER_FACTOR * bodyFontSize;
  for (const entry of line.items) {
    const text = entry.text.trim();
    if (text === "") continue;
    if (MATH_RELATION.test(text)) return false;
    if (DOT_LEADER.test(text) && entry.width >= minWidth) return false;
  }
  return true;
}

/** The cell gaps of one row: empty text is not content, small gaps are kerning. */
function cellGaps(line: TextLine, bodyFontSize: number): Gap[] {
  const items = line.items.filter((entry) => entry.text.trim() !== "");
  const min = Math.max(TABLE_GAP_FACTOR * line.fontSize, bodyFontSize);
  const gaps: Gap[] = [];
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1] as RawTextItem;
    const current = items[index] as RawTextItem;
    const start = previous.x + previous.width;
    const end = current.x;
    if (end - start < min) continue;
    const leftAlnum = CELL_ANCHOR.test(previous.text);
    const rightAlnum = CELL_ANCHOR.test(current.text);
    const anchored =
      (leftAlnum && (rightAlnum || CELL_SIGN.test(current.text))) ||
      (rightAlnum && CELL_SIGN.test(previous.text));
    if (!anchored) continue;
    gaps.push([start, end]);
  }
  return gaps;
}

/** Gaps of `candidate` that sit on a gap of `reference` — the column grid. */
function alignedGaps(reference: readonly Gap[], candidate: readonly Gap[]): number {
  let count = 0;
  for (const gap of reference) {
    for (const other of candidate) {
      const overlap = Math.min(gap[1], other[1]) - Math.max(gap[0], other[0]);
      if (overlap <= 0) continue;
      const smaller = Math.min(gap[1] - gap[0], other[1] - other[0]);
      if (overlap >= TABLE_LINK_OVERLAP * smaller) {
        count++;
        break;
      }
    }
  }
  return count;
}

/** Vertical space between the ink of two consecutive lines, in points. */
function verticalGap(above: TextLine, below: TextLine): number {
  return below.top - above.bottom;
}

/** Horizontal extent of the lines claimed so far, in points. */
function spanWidth(lines: readonly TextLine[]): number {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    left = Math.min(left, line.x);
    right = Math.max(right, line.x + line.width);
  }
  return right - left;
}

/**
 * Whether a gap-less line joins the chain: close under the table, narrow
 * against its span and in the font of the row carrying the gaps — the three
 * gates that keep the prose around a table out of it.
 */
function absorbs(
  chain: readonly TextLine[],
  candidate: TextLine,
  reference: TextLine,
  gap: number,
  bodyFontSize: number,
): boolean {
  if (gap > TABLE_ABSORB_GAP_FACTOR * bodyFontSize) return false;
  if (candidate.width > TABLE_ABSORB_WIDTH_SHARE * spanWidth(chain)) return false;
  return (
    candidate.fontSize >= TABLE_ABSORB_FONT_MIN * reference.fontSize &&
    candidate.fontSize <= TABLE_ABSORB_FONT_MAX * reference.fontSize
  );
}

/** Which column of `columns` holds the item: most overlap, then the nearest. */
function columnOf(entry: RawTextItem, columns: readonly (readonly [number, number])[]): number {
  let best = 0;
  let bestOverlap = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index] as readonly [number, number];
    const overlap = Math.min(entry.x + entry.width, column[1]) - Math.max(entry.x, column[0]);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = index;
    }
  }
  if (bestOverlap > 0) return best;
  let nearest = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index] as readonly [number, number];
    const distance =
      entry.x + entry.width <= column[0]
        ? column[0] - (entry.x + entry.width)
        : entry.x >= column[1]
          ? entry.x - column[1]
          : 0;
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = index;
    }
  }
  return nearest;
}

/**
 * The cell grid of one table: the columns come from the row with most gaps
 * (the most structured row of the table), every other row's items land in the
 * column they overlap most and a row without an item for a column keeps it
 * empty — the TSV of `placeholder.description`.
 */
function tableCells(lines: readonly TextLine[], bodyFontSize: number): string[][] {
  const gapsPerLine = lines.map((line) => cellGaps(line, bodyFontSize));
  let referenceIndex = 0;
  for (let index = 1; index < gapsPerLine.length; index++) {
    if ((gapsPerLine[index]?.length ?? 0) > (gapsPerLine[referenceIndex]?.length ?? 0)) {
      referenceIndex = index;
    }
  }
  const referenceGaps = gapsPerLine[referenceIndex] as Gap[];
  const left = Math.min(...lines.map((line) => line.x));
  const right = Math.max(...lines.map((line) => line.x + line.width));
  const columns: [number, number][] = [];
  let cursor = left;
  for (const gap of referenceGaps) {
    columns.push([cursor, gap[0]]);
    cursor = gap[1];
  }
  columns.push([cursor, right]);

  return lines.map((line) => {
    const buckets: RawTextItem[][] = columns.map(() => []);
    for (const entry of line.items) {
      if (entry.text.trim() === "") continue;
      (buckets[columnOf(entry, columns)] as RawTextItem[]).push(entry);
    }
    return buckets.map((bucket) => {
      let text = "";
      for (let index = 0; index < bucket.length; index++) {
        const entry = bucket[index] as RawTextItem;
        const previous = bucket[index - 1];
        if (previous !== undefined && spaceBetween(previous, entry)) text += " ";
        text += entry.text;
      }
      return normalizeForReader(text);
    });
  });
}

/** The font family of a pdf.js name: subset prefix, size and style out. */
function familyOf(fontName: string): string {
  return fontName
    .replace(/^[A-Z]{6}\+/, "")
    .replace(/\d+$/, "")
    .replace(/[-_](BoldItalic|Bold|Italic|Oblique)MT$/i, "")
    .replace(/[-_](BoldItalic|Bold|Italic|Oblique)$/i, "")
    .replace(/MT$/, "");
}

/** The family most items of the document are set in (body text, not figures). */
function dominantFamily(pages: readonly (readonly (readonly TextLine[])[])[]): string {
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const band of page) {
      for (const line of band) {
        for (const item of line.items) {
          if (item.text.trim() === "") continue;
          const family = familyOf(item.fontName);
          counts.set(family, (counts.get(family) ?? 0) + 1);
        }
      }
    }
  }
  let dominant = "";
  let best = -1;
  for (const [family, count] of counts) {
    if (count > best) {
      dominant = family;
      best = count;
    }
  }
  return dominant;
}

/** Whether the chain's words mostly sit in the document's dominant family. */
function inDominantFamily(lines: readonly TextLine[], dominant: string): boolean {
  let total = 0;
  let matched = 0;
  for (const line of lines) {
    for (const item of line.items) {
      if (!CELL_ANCHOR.test(item.text)) continue;
      total++;
      if (familyOf(item.fontName) === dominant) matched++;
    }
  }
  return total > 0 && matched / total >= TABLE_ALNUM_FAMILY_SHARE;
}

/**
 * Scans one band (the lines of a page that share a column band) for tables:
 * every line with `TABLE_MIN_GAPS` cell gaps starts a chain that grows row by
 * row while the gaps align, absorbs the gap-less rows around it and is
 * claimed once it is long enough.
 */
function scanBand(
  lines: readonly TextLine[],
  bodyFontSize: number,
  dominant: string,
  out: TableDecision[],
): void {
  let index = 0;
  while (index < lines.length) {
    const seed = lines[index] as TextLine;
    if (!eligible(seed, bodyFontSize)) {
      index++;
      continue;
    }
    const seedGaps = cellGaps(seed, bodyFontSize);
    if (seedGaps.length < TABLE_MIN_GAPS) {
      index++;
      continue;
    }

    const chain: TextLine[] = [seed];
    let reference = seed;
    let referenceGaps = seedGaps;
    let gapped = 1;
    let end = index + 1;
    while (end < lines.length) {
      const next = lines[end] as TextLine;
      if (!eligible(next, bodyFontSize)) break;
      const gaps = cellGaps(next, bodyFontSize);
      if (gaps.length >= TABLE_MIN_GAPS) {
        if (alignedGaps(referenceGaps, gaps) < TABLE_MIN_GAPS) break;
        const above = chain[chain.length - 1] as TextLine;
        if (verticalGap(above, next) > TABLE_ROW_GAP_FACTOR * bodyFontSize) break;
        chain.push(next);
        reference = next;
        referenceGaps = gaps;
        gapped++;
        end++;
        continue;
      }
      if (gaps.length === 0) {
        const above = chain[chain.length - 1] as TextLine;
        if (!absorbs(chain, next, reference, verticalGap(above, next), bodyFontSize)) break;
        chain.push(next);
        end++;
        continue;
      }
      break;
    }

    // The wrapped header or label above the seed joins the same way.
    let start = index;
    while (start > 0) {
      const previous = lines[start - 1] as TextLine;
      if (!eligible(previous, bodyFontSize)) break;
      if (cellGaps(previous, bodyFontSize).length !== 0) break;
      const first = chain[0] as TextLine;
      if (!absorbs(chain, previous, reference, verticalGap(previous, first), bodyFontSize)) break;
      chain.unshift(previous);
      start--;
    }

    const passes =
      chain.length >= TABLE_MIN_LINES &&
      gapped >= TABLE_MIN_GAPS &&
      inDominantFamily(chain, dominant);
    if (passes) {
      out.push({ table: true, lines: chain, cells: tableCells(chain, bodyFontSize) });
      index = end;
    } else {
      index++;
    }
  }
}

/**
 * Every table of the document, in reading order. The pages come in reading
 * order and a chain never crosses a band (a column change) or a page, so a
 * table of one column can not swallow the rows of the next one.
 */
export function detectTables(
  pages: readonly (readonly (readonly TextLine[])[])[],
  options: { bodyFontSize: number },
): TableDecision[] {
  const decisions: TableDecision[] = [];
  const dominant = dominantFamily(pages);
  for (const page of pages) {
    const lines = page.flat();
    let band: TextLine[] = [];
    const flush = (): void => {
      if (band.length > 0) scanBand(band, options.bodyFontSize, dominant, decisions);
      band = [];
    };
    for (const line of lines) {
      if (band.length > 0 && line.band !== (band[band.length - 1] as TextLine).band) flush();
      band.push(line);
    }
    flush();
  }
  return decisions;
}

/** The cells of one table as tab-separated values, one row per line. */
export function tableTsv(decision: TableDecision): string {
  return decision.cells.map((row) => row.join("\t")).join("\n");
}

/**
 * Cuts every paragraph at the tables claimed inside it (E10-T02): the claimed
 * runs become their own fragments — one decision per table, merged when the
 * table spans two paragraphs — and the untouched paragraphs keep their
 * identity, so the per-paragraph passes downstream stay index-parallel.
 */
export function splitParagraphsAtTables(
  paragraphs: readonly JoinedParagraph[],
  decisions: readonly TableDecision[],
  linePages: ReadonlyMap<TextLine, number>,
): { paragraphs: JoinedParagraph[]; tables: (TableDecision | undefined)[] } {
  const split = splitParagraphsAtClaims(paragraphs, claimsByLine(decisions), linePages);
  return { paragraphs: split.paragraphs, tables: split.claims };
}
