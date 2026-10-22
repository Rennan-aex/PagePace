import type { RawTextItem, Run } from "@pagepace/schema";
import { classifyFontName, type FontStyle } from "./fontstyle";
import { HEADING_BOLD_SHARE } from "./headings";
import { hyphenSiteBetween } from "./hyphen";
import type { TextLine } from "./lines";
import { spaceBetween } from "./spaces";
import { normalizeForReader } from "./unicode";

/**
 * Styled runs of one paragraph (E4-T01 — REQ-EXT-05, layer 5 "estilos
 * inline"): every text item becomes a run segment carrying bold/italic from
 * its font name (`classifyFontName`, spike S2) and sup/sub from geometry.
 * The reader gets the same characters the plain join produced — spaces by
 * the gap rule, hyphen sites by `hyphenSiteBetween` — with the style of the
 * item each character came from, and adjacent segments with one style are
 * merged into a single `Run`.
 *
 * Signals, in order:
 * - **bold/italic** — the embedded font name only (the pdf.js flags are
 *   `undefined` for embedded fonts; see `fontstyle.ts`).
 * - **sup/sub** — an item at most `SUPSUB_MAX_SIZE_RATIO` of the line's body
 *   size whose baseline is raised/lowered by `SUPSUB_RISE_FACTOR` of its own
 *   size against the body baseline (the largest item of the line).
 * - **spaces** — the gap rule of `spaceBetween`; an inferred space is a
 *   neutral character (it belongs to no style), which keeps the golden
 *   convention of regular runs holding the surrounding blanks.
 *
 * An OCR text layer (`ocr-text-layer`, ADR-019) carries no real style: the
 * caller passes `styles: false` and every run comes out plain.
 *
 * Headings (E4-T05 — ADR-058): the runs of a `kind: "heading"` block pass
 * through `headingRuns` before reaching the `Book`. When the block's
 * non-space characters are bold-dominant (share ≥ `HEADING_BOLD_SHARE`, the
 * same weight that itself marks a bold title) the bold is the **title
 * style** — `kind` + `level` already carry that meaning — so every run loses
 * it and the plain neighbors merge back; a heading that is not bold-dominant
 * keeps its word-level bold (emphasis of the original text). `italic`, `sup`
 * and `sub` are never touched: they are always emphasis of the text.
 *
 * Known limits: style is per item, so a word drawn as one item with an inner
 * style change (rare) stays uniform; normalization runs per segment, so a
 * combining sequence split across two items would stay decomposed (the
 * accent composer of E3-T01b merges those items at ingestion); shear-simulated
 * itálico (107 letters in the whole corpus, S2 §4) is not detected yet.
 */

/** An item at most this fraction of the line's body size can be sup/sub. */
export const SUPSUB_MAX_SIZE_RATIO = 0.8;
/** Raised/lowered baseline (fraction of the item's own size) that marks sup/sub. */
export const SUPSUB_RISE_FACTOR = 0.25;

const baselineOf = (item: RawTextItem): number => item.y + item.height;
const hasContent = (item: RawTextItem): boolean => item.text !== "";

/** Inline style of one item inside one line. */
export interface ItemStyle {
  bold: boolean;
  italic: boolean;
  sup: boolean;
  sub: boolean;
}

const PLAIN: ItemStyle = { bold: false, italic: false, sup: false, sub: false };

interface Segment {
  text: string;
  style: ItemStyle;
}

/** Baseline of the largest content item of a line: the body reference sup/sub compare to. */
function bodyBaselineOf(items: readonly RawTextItem[]): number {
  let baseline = 0;
  let largest = -1;
  for (const item of items) {
    if (!hasContent(item)) continue;
    if (item.fontSize > largest) {
      largest = item.fontSize;
      baseline = baselineOf(item);
    }
  }
  return baseline;
}

/**
 * Style of one item: font name for bold/italic, size and baseline for
 * sup/sub. `styles: false` (OCR layer) forces everything plain.
 */
export function itemRunStyle(
  item: RawTextItem,
  bodyFontSize: number,
  bodyBaseline: number,
  styles = true,
): ItemStyle {
  if (!styles) return { ...PLAIN };
  const font: FontStyle = classifyFontName(item.fontName);
  let sup = false;
  let sub = false;
  if (item.fontSize <= SUPSUB_MAX_SIZE_RATIO * bodyFontSize) {
    const rise = bodyBaseline - baselineOf(item);
    if (rise >= SUPSUB_RISE_FACTOR * item.fontSize) sup = true;
    else if (-rise >= SUPSUB_RISE_FACTOR * item.fontSize) sub = true;
  }
  return { bold: font.bold, italic: font.italic, sup, sub };
}

/** Style of an item, or the neutral style for an inferred separator space. */
function segmentOf(text: string, style: ItemStyle): Segment {
  return { text, style };
}

function lineSegments(line: TextLine, styles: boolean): Segment[] {
  const bodyFontSize = line.fontSize;
  const bodyBaseline = bodyBaselineOf(line.items);
  const segments: Segment[] = [];
  let previous: RawTextItem | null = null;
  for (const item of line.items) {
    if (!hasContent(item)) continue;
    if (previous !== null && spaceBetween(previous, item)) {
      segments.push(segmentOf(" ", { ...PLAIN }));
    }
    // pdf.js splits the trailing/leading space of a run into its own item
    // and that item inherits the run's font (a bold space after a bold run).
    // The golden puts every boundary space on the regular side, so a
    // whitespace-only item never carries style.
    const style = /^\s+$/.test(item.text)
      ? PLAIN
      : itemRunStyle(item, bodyFontSize, bodyBaseline, styles);
    segments.push(segmentOf(item.text, style));
    previous = item;
  }
  return segments;
}

function segmentsText(segments: readonly Segment[]): string {
  let output = "";
  for (const segment of segments) output += segment.text;
  return output;
}

/** Drops the trailing character (a printed hyphen) from the accumulated segments. */
function dropTrailingHyphen(segments: Segment[]): void {
  const last = segments[segments.length - 1];
  if (last === undefined) return;
  last.text = last.text.slice(0, -1);
  if (last.text === "") segments.pop();
}

/** Drops the leading character (a reprinted hyphen) from the incoming segments. */
function dropLeadingHyphen(segments: Segment[]): void {
  const first = segments[0];
  if (first === undefined) return;
  first.text = first.text.slice(1);
  if (first.text === "") segments.shift();
}

/**
 * Line join with the hyphen decisions of `joinHyphenatedLines` (E3-T03),
 * kept segment by segment so every character stays attached to the item it
 * came from. The site test runs against the accumulated text exactly like
 * the plain join, so both paths always decide the same way.
 */
function joinLineSegments(lines: readonly Segment[][]): Segment[] {
  let accumulated: Segment[] = [];
  let accumulatedText = "";
  for (const [index, segments] of lines.entries()) {
    const lineText = segmentsText(segments);
    if (index === 0) {
      accumulated = segments.map((segment) => ({ ...segment }));
      accumulatedText = lineText;
      continue;
    }
    const site = hyphenSiteBetween(accumulatedText, lineText);
    if (site === null) {
      accumulated.push(segmentOf(" ", { ...PLAIN }));
      accumulated.push(...segments.map((segment) => ({ ...segment })));
      accumulatedText += ` ${lineText}`;
    } else if (site.decision === "join") {
      dropTrailingHyphen(accumulated);
      accumulated.push(...segments.map((segment) => ({ ...segment })));
      accumulatedText = accumulatedText.slice(0, -1) + lineText;
    } else if (site.decision === "keep" && lineText.startsWith("-")) {
      // A compound broken at its own hyphen reprints the hyphen on both sides
      // of the break (`não-` + `-teórico`, backlog 3A): the reprint is dropped
      // so the reader gets a single hyphen, exactly like the plain join.
      dropLeadingHyphen(segments);
      accumulated.push(...segments.map((segment) => ({ ...segment })));
      accumulatedText += lineText.slice(1);
    } else {
      accumulated.push(...segments.map((segment) => ({ ...segment })));
      accumulatedText += lineText;
    }
  }
  return accumulated;
}

/** Merges neighbors with the same style and turns segments into schema runs. */
function mergeRuns(segments: readonly Segment[]): Run[] {
  const runs: Run[] = [];
  for (const segment of segments) {
    const text = normalizeForReader(segment.text);
    if (text === "") continue;
    const previous = runs[runs.length - 1];
    if (
      previous !== undefined &&
      (previous.bold === true) === segment.style.bold &&
      (previous.italic === true) === segment.style.italic &&
      (previous.sup === true) === segment.style.sup &&
      (previous.sub === true) === segment.style.sub
    ) {
      previous.text += text;
      continue;
    }
    runs.push({
      text,
      ...(segment.style.bold ? { bold: true } : {}),
      ...(segment.style.italic ? { italic: true } : {}),
      ...(segment.style.sup ? { sup: true } : {}),
      ...(segment.style.sub ? { sub: true } : {}),
    });
  }
  return runs;
}

/**
 * Styled runs of one paragraph: the reader's text of `paragraphHyphenText`,
 * split by the style of the item each character came from. Adjacent runs
 * with the same style are one run; a plain paragraph is a single run with no
 * flags, exactly like the builder produced before E4-T01.
 */
export function paragraphRuns(
  paragraph: readonly TextLine[],
  options: { styles?: boolean } = {},
): Run[] {
  const styles = options.styles ?? true;
  const lines = paragraph.map((line) => lineSegments(line, styles));
  return mergeRuns(joinLineSegments(lines));
}

/** Two neighbors merge when every style field of the schema agrees. */
function sameRunStyle(a: Run, b: Run): boolean {
  return (
    (a.bold === true) === (b.bold === true) &&
    (a.italic === true) === (b.italic === true) &&
    (a.sup === true) === (b.sup === true) &&
    (a.sub === true) === (b.sub === true) &&
    (a.smallCaps === true) === (b.smallCaps === true) &&
    a.noteRef === b.noteRef &&
    a.lang === b.lang
  );
}

/**
 * Heading runs without the title style's bold (E4-T05, ADR-058): when the
 * non-space characters of the block are bold-dominant (share ≥
 * `HEADING_BOLD_SHARE` — the same weight that on its own marks a bold
 * title), the weight is the **title style** and `kind` + `level` already say
 * it, so every run loses `bold` and the neighbors left plain merge back. A
 * heading that is not bold-dominant keeps its word-level bold (emphasis of
 * the original text); `italic`, `sup` and `sub` are never touched. The text
 * of every run is the text it received, and the input is never mutated.
 */
export function headingRuns(runs: readonly Run[]): Run[] {
  let boldChars = 0;
  let totalChars = 0;
  for (const run of runs) {
    const chars = run.text.replace(/\s+/g, "").length;
    totalChars += chars;
    if (run.bold === true) boldChars += chars;
  }
  const titleStyleIsBold = totalChars > 0 && boldChars / totalChars >= HEADING_BOLD_SHARE;
  if (!titleStyleIsBold) return [...runs];
  const merged: Run[] = [];
  for (const run of runs) {
    let current: Run = run;
    if (run.bold === true) {
      const { bold: _bold, ...rest } = run;
      current = rest;
    }
    const previous = merged[merged.length - 1];
    if (previous !== undefined && sameRunStyle(previous, current)) {
      previous.text += current.text;
      continue;
    }
    merged.push({ ...current });
  }
  return merged;
}
