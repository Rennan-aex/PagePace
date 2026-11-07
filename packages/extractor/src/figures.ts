import type { BBox, RawPage } from "@pagepace/schema";
import { BBOX_DECIMALS } from "./bbox";
import type { CaptionDecision } from "./captions";
import { paragraphHyphenText } from "./hyphen";
import type { JoinedParagraph } from "./pagejoin";
import { normalizeForReader } from "./unicode";

/**
 * Figures (E10-T01b — layer 4, "semântica", REQ-EXT-11).
 *
 * Turns the `page.nonText` regions of T01a into `figure` decisions: a region
 * between `FIGURE_MIN_PAGE_SHARE` and `FIGURE_MAX_PAGE_SHARE` of the page
 * area (a logo and a full-page background are not figures), neighbours closer
 * than `FIGURE_MERGE_GAP_FACTOR` x the body size in both axes merged into one
 * box (an image painted as tiles), the caption of E5-T05 linked when it sits
 * at most `FIGURE_CAPTION_GAP_FACTOR` x the body size **below** the figure
 * and overlaps it horizontally — its text goes to `placeholder.description`
 * (Opção A, no schema bump) while the caption keeps reading as its own block
 * — and an `insertBefore` anchor in reading order: a spanning figure before
 * the first paragraph below it, a figure of a column band inside that band
 * (or after the band's last paragraph when nothing sits below it).
 *
 * Known limits: the region gates are geometric, so a table drawn as vector
 * art reads as a figure until E10-T02 claims it; a caption above its figure
 * or beyond the gap stays unlinked; a region of a running head/foot is not
 * filtered (T01a never saw the repeated-region pass); and the bands come
 * from the paragraphs, so a page whose columns carry no text at all falls
 * back to the spanning rule.
 */

/** A region below this share of the page area is decoration, not a figure. */
export const FIGURE_MIN_PAGE_SHARE = 0.01;
/** A region above this share of the page area is the page itself, not a figure. */
export const FIGURE_MAX_PAGE_SHARE = 0.9;
/** Regions closer than this (x body font) in both axes merge into one figure. */
export const FIGURE_MERGE_GAP_FACTOR = 1.2;
/** A caption sits at most this (x body font) below its figure. */
export const FIGURE_CAPTION_GAP_FACTOR = 3;

/** One figure of one page, ready to become a `figure` block (E10-T01b). */
export interface FigureDecision {
  /** 0-based page index, like `origin.pageFrom`. */
  page: number;
  /** Merged region in top-left page coordinates. */
  bbox: BBox;
  /** Normalized text of the caption linked below the figure, when any. */
  caption?: string;
  /**
   * Index of the paragraph the figure reads before (document-wide order).
   * Absent = nothing sits below it: the figure goes after the page's last
   * block of its band (or of the page, when it spans).
   */
  insertBefore?: number;
}

/** Everything {@link detectFigures} reads, measured once by `analyzeDocument`. */
export interface FigureContext {
  /** The document's pages, with their `nonText` regions (T01a). */
  pages: readonly RawPage[];
  /** Paragraphs in reading order, the source of the bands and the anchor. */
  paragraphs: readonly JoinedParagraph[];
  /** One decision per paragraph, indexed like `paragraphs` (E5-T05). */
  captions: readonly CaptionDecision[];
  /** Body font size of the document (`documentStats().bodyFontSize`). */
  bodyFontSize: number;
}

/** One paragraph of the page, reduced to what the figure gates ask. */
interface ParagraphBox {
  /** Index of the paragraph in the document-wide list. */
  index: number;
  paragraph: JoinedParagraph;
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** Column band of the first line (`undefined` on a single-column page). */
  band?: number;
}

interface XRange {
  left: number;
  right: number;
}

function round(value: number): number {
  const factor = 10 ** BBOX_DECIMALS;
  return Math.round(value * factor) / factor;
}

function paragraphBox(paragraph: JoinedParagraph, index: number): ParagraphBox | null {
  const first = paragraph.lines[0];
  if (first === undefined) return null;
  let top = first.top;
  let bottom = first.bottom;
  let left = first.x;
  let right = first.x + first.width;
  for (const line of paragraph.lines) {
    top = Math.min(top, line.top);
    bottom = Math.max(bottom, line.bottom);
    left = Math.min(left, line.x);
    right = Math.max(right, line.x + line.width);
  }
  const band = first.band;
  return { index, paragraph, top, bottom, left, right, ...(band === undefined ? {} : { band }) };
}

/** Horizontal gap between two boxes (0 when they overlap). */
function gapX(a: BBox, b: BBox): number {
  return Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
}

/** Vertical gap between two boxes (0 when they overlap). */
function gapY(a: BBox, b: BBox): number {
  return Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
}

function union(a: BBox, b: BBox): BBox {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: round(left), y: round(top), width: round(right - left), height: round(bottom - top) };
}

/**
 * Clusters the boxes whose gap is at most `gap` on **both** axes into one
 * box each (an image painted as neighbouring tiles is one figure). The input
 * is read in top-left order, so the same regions always merge the same way.
 */
function mergeRegions(regions: readonly BBox[], gap: number): BBox[] {
  const boxes = [...regions].sort((a, b) => a.y - b.y || a.x - b.x);
  const taken = boxes.map(() => false);
  const merged: BBox[] = [];
  for (let index = 0; index < boxes.length; index++) {
    if (taken[index] === true) continue;
    taken[index] = true;
    let box = boxes[index] as BBox;
    let grew = true;
    while (grew) {
      grew = false;
      for (let other = 0; other < boxes.length; other++) {
        if (taken[other] === true) continue;
        const candidate = boxes[other] as BBox;
        if (gapX(box, candidate) > gap || gapY(box, candidate) > gap) continue;
        box = union(box, candidate);
        taken[other] = true;
        grew = true;
      }
    }
    merged.push(box);
  }
  return merged;
}

/** The x-range of every column band (`1..n`) of the page. */
function bandRangesOf(paragraphs: readonly ParagraphBox[]): Map<number, XRange> {
  const ranges = new Map<number, XRange>();
  for (const box of paragraphs) {
    if (box.band === undefined || box.band < 1) continue;
    const range = ranges.get(box.band);
    if (range === undefined) ranges.set(box.band, { left: box.left, right: box.right });
    else {
      range.left = Math.min(range.left, box.left);
      range.right = Math.max(range.right, box.right);
    }
  }
  return ranges;
}

/**
 * The band a figure sits in, or `undefined` when it spans: a figure that
 * overlaps exactly one column band belongs to it, a figure that crosses the
 * gutter (or misses every band, a figure in the margin) spans the page and
 * follows the spanning rule of the plan.
 */
function figureBandOf(bbox: BBox, ranges: ReadonlyMap<number, XRange>): number | undefined {
  const right = bbox.x + bbox.width;
  let found: number | undefined;
  let overlaps = 0;
  for (const [band, range] of ranges) {
    if (bbox.x >= range.right || right <= range.left) continue;
    overlaps++;
    found = band;
  }
  return overlaps === 1 ? found : undefined;
}

/**
 * The paragraph the figure reads before: the first one below it — of the
 * page when the figure spans, of its own band when it does not — or the
 * paragraph after the band's last one when nothing of the band sits below.
 */
function anchorOf(
  bbox: BBox,
  paragraphs: readonly ParagraphBox[],
  ranges: ReadonlyMap<number, XRange>,
): number | undefined {
  const bottom = bbox.y + bbox.height;
  const below = (boxes: readonly ParagraphBox[]): ParagraphBox | undefined =>
    boxes.find((box) => box.top >= bottom);
  const band = figureBandOf(bbox, ranges);
  if (band === undefined) return below(paragraphs)?.index;
  const inBand = paragraphs.filter((box) => box.band === band);
  const next = below(inBand);
  if (next !== undefined) return next.index;
  const last = inBand[inBand.length - 1];
  if (last === undefined) return below(paragraphs)?.index;
  return paragraphs[paragraphs.indexOf(last) + 1]?.index;
}

/**
 * The caption linked to the figure: the printed label of E5-T05 whose
 * paragraph starts below the figure, overlaps it horizontally and is the
 * closest one within `FIGURE_CAPTION_GAP_FACTOR` x the body size. The text
 * is normalized exactly like the caption block's runs, so the copy in
 * `placeholder.description` reads the same as the block itself.
 */
function captionOf(
  bbox: BBox,
  paragraphs: readonly ParagraphBox[],
  captions: readonly CaptionDecision[],
  bodyFontSize: number,
): string | undefined {
  const bottom = bbox.y + bbox.height;
  const maxGap = FIGURE_CAPTION_GAP_FACTOR * bodyFontSize;
  let best: ParagraphBox | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const box of paragraphs) {
    if (captions[box.index]?.caption !== true) continue;
    const gap = box.top - bottom;
    if (gap < 0 || gap > maxGap) continue;
    if (box.left >= bbox.x + bbox.width || box.right <= bbox.x) continue;
    if (gap >= bestGap) continue;
    best = box;
    bestGap = gap;
  }
  if (best === undefined) return undefined;
  return normalizeForReader(paragraphHyphenText(best.paragraph.lines).text);
}

/**
 * One decision per figure of the document, page by page and, inside a page,
 * top to bottom. Deterministic: same pages, paragraphs and captions, same
 * decisions — no clock, no ambient state.
 */
export function detectFigures(context: FigureContext): FigureDecision[] {
  const { pages, paragraphs, captions, bodyFontSize } = context;
  const byPage = new Map<number, ParagraphBox[]>();
  paragraphs.forEach((paragraph, index) => {
    const box = paragraphBox(paragraph, index);
    if (box === null) return;
    const page = paragraph.pageFrom;
    const list = byPage.get(page);
    if (list === undefined) byPage.set(page, [box]);
    else list.push(box);
  });

  const decisions: FigureDecision[] = [];
  for (const [pageIndex, page] of pages.entries()) {
    const regions = page.nonText;
    if (regions === undefined || regions.length === 0) continue;
    const pageArea = page.width * page.height;
    if (!(pageArea > 0)) continue;
    const kept = regions
      .map((region) => region.bbox)
      .filter((bbox) => {
        const share = (bbox.width * bbox.height) / pageArea;
        return share >= FIGURE_MIN_PAGE_SHARE && share <= FIGURE_MAX_PAGE_SHARE;
      });
    if (kept.length === 0) continue;
    const merged = mergeRegions(kept, FIGURE_MERGE_GAP_FACTOR * bodyFontSize);
    const pageParagraphs = byPage.get(pageIndex) ?? [];
    const ranges = bandRangesOf(pageParagraphs);
    for (const bbox of merged) {
      const caption = captionOf(bbox, pageParagraphs, captions, bodyFontSize);
      const insertBefore = anchorOf(bbox, pageParagraphs, ranges);
      decisions.push({
        page: pageIndex,
        bbox,
        ...(caption === undefined ? {} : { caption }),
        ...(insertBefore === undefined ? {} : { insertBefore }),
      });
    }
  }
  return decisions;
}
