import type { RawDocument, RawTextItem } from "@pagepace/schema";
import { groupLines, type TextLine } from "./lines";
import { isMarginRefText } from "./marginrefs";
import { lineText } from "./spaces";
import { documentStats } from "./stats";
import { normalizeForReader } from "./unicode";

/**
 * Repeated regions — running heads, feet and page numbers (E3-T02, layer 3).
 *
 * A line leaves the reading flow when it is one of the two edges of its page
 * (first or last line), its font is not larger than the body
 * (`REPEATED_FONT_MAX_FACTOR` — the chapter title that opens a page is bigger,
 * so it can never be a candidate), its text repeats across pages at a stable
 * baseline (`REPEATED_BASELINE_TOLERANCE_FACTOR` of the line spacing) and it
 * does so on enough pages (`REPEATED_MIN_PAGES` and
 * `REPEATED_MIN_PAGE_SHARE`). Text "repeats" either exactly, or with every
 * digit run masked when the remaining decoration is at most
 * `PAGE_LABEL_DECORATION_MAX` characters — that is how "42", "- 42 -" and
 * "Page 42" are one region while "Chapter 1" and "Chapter 2" are not (they
 * would be a lost chapter title).
 *
 * What a region removes is the line, with every item that rides on it (spaces
 * and pdf.js line-end markers included). The printed number of a numbered
 * foot survives as `pageLabels[page]`, which `buildBook` writes to
 * `origin.originalPageLabel` (REQ-EXT-06).
 *
 * A folio the typesetter put in the **middle of the flow** (the `flow` band)
 * has no stable baseline and no edge to sit on, so it can not cluster like a
 * head or a foot. Its proof is the sequence itself: a numbered line, small
 * like the body, with blank space on one of its sides
 * (`FLOW_FOLIO_ISOLATION_FACTOR` of the line spacing) whose values increase
 * from page to page by at most `FLOW_FOLIO_MAX_STEP`, on at least the same
 * share of pages a region needs. Numbered edge lines the edge pass could not
 * cluster (their baseline wanders) join the same proof. Every qualifying
 * sequence is removed as one region and feeds `pageLabels` like a numbered
 * foot.
 *
 * A journal foot ("Filosofia Unisinos, 27(1):1-11, 2026 | e27103 3") carries
 * far more decoration than `PAGE_LABEL_DECORATION_MAX` allows, so its digits
 * never mask into one signature and every page looks unique — the signature
 * can not cluster it. It still qualifies as an edge candidate when it sits on
 * the **bottom** edge, starts or ends in a digit run and floats a blank line
 * above the text (the shape of furniture, never of a body line that happens
 * to end in a number): the sequence of printed values proves it, and each
 * page keeps its folio as a label. The value of any numbered line is the
 * digit run closest to the physical page (`page + 1`), which is what lets a
 * foot whose decoration contains its own numbers ("27(1):1-11 … 3") label
 * with the folio instead of the range.
 *
 * Known limits: only the first and the last line of a page are edge
 * candidates, and only isolated numbered lines are flow candidates, so a
 * repeated line that is neither is never found; the digit-at-the-foot rule
 * never fires on a head, so a folio printed at the top of the page relies on
 * its exact signature alone; a page whose only line repeats with the
 * neighbours loses it; a document with fewer than `REPEATED_MIN_PAGES` pages
 * keeps everything; and every public entry point strips once — feed these
 * functions the raw document, never one that already went through
 * `stripRepeatedRegions`.
 */

/** Smallest number of pages a region must appear on before it is removed. */
export const REPEATED_MIN_PAGES = 3;
/** Smallest share of the pages that hold text a region must appear on. */
export const REPEATED_MIN_PAGE_SHARE = 0.25;
/** Largest font size of a candidate, as a multiple of the body font size. */
export const REPEATED_FONT_MAX_FACTOR = 1.05;
/** Allowed spread of the baselines of a region, as a fraction of the line spacing. */
export const REPEATED_BASELINE_TOLERANCE_FACTOR = 0.5;
/** Non-digit characters a page label may carry around its number ("- 42 -"). */
export const PAGE_LABEL_DECORATION_MAX = 4;
/** Vertical whitespace (fraction of the line spacing) that must flank a folio on at least one side. */
export const FLOW_FOLIO_ISOLATION_FACTOR = 1.0;
/** Largest step between two consecutive values of one folio sequence (measured max: 4). */
export const FLOW_FOLIO_MAX_STEP = 5;

/** Which part of the page a region lives on. */
export type RepeatedBand = "top" | "bottom" | "flow";

/** One line a region removed, on one page. */
export interface RepeatedOccurrence {
  /** 0-based page index. */
  page: number;
  /** Text of the removed line. */
  text: string;
  /** Printed page number of the line, when the line is a page label. */
  pageLabel: string | null;
}

/** Lines that repeat in the same place of the same edge across pages. */
export interface RepeatedRegion {
  band: RepeatedBand;
  /** What makes the lines "the same" (see `signatureOf`). */
  signature: string;
  /** Pages the region was removed from, ascending. */
  occurrences: RepeatedOccurrence[];
}

export interface StrippedDocument {
  /** The document without the items of every removed line. */
  document: RawDocument;
  /** Regions that were found (empty when the document has none). */
  regions: RepeatedRegion[];
  /** Every removed line, in page order. */
  removed: RepeatedOccurrence[];
  /** Printed page label of each page (`null` when the page has none). */
  pageLabels: (string | null)[];
}

interface Candidate {
  band: RepeatedBand;
  page: number;
  line: TextLine;
  text: string;
  signature: string;
  numbered: boolean;
  /** Bottom edge whose long decoration still ends in a folio (see `isFolioFoot`). */
  edgeFolio: boolean;
}

interface RemovedLine {
  page: number;
  line: TextLine;
  occurrence: RepeatedOccurrence;
}

interface Analysis {
  regions: RepeatedRegion[];
  removedLines: RemovedLine[];
  pageLabels: (string | null)[];
}

/** Comparison form of a line: reader normalization, collapsed spaces, trimmed. */
function normalizeForCompare(text: string): string {
  return normalizeForReader(text).replace(/\s+/g, " ").trim();
}

/**
 * Printed page number of a line: the digit run whose value sits closest to
 * the physical position of the page (`page + 1`); the first run wins ties, so
 * a single-run line labels exactly as a first-run pick would, while a foot
 * that also carries the journal range ("27(1):1-11 … 3") labels with the
 * folio instead of the range.
 */
function labelOf(text: string, page: number): string | null {
  const normalized = normalizeForCompare(text);
  const target = page + 1;
  let label: string | null = null;
  let closest = Number.POSITIVE_INFINITY;
  for (const match of normalized.matchAll(/\d+/g)) {
    const distance = Math.abs(Number(match[0]) - target);
    if (distance < closest) {
      label = match[0];
      closest = distance;
    }
  }
  return label;
}

/**
 * Identity of a line across pages: its normalized text, or that text with
 * every digit run masked when the leftovers are decoration only — the mask is
 * what makes "42" and "- 42 -" one region and keeps "Chapter 1"/"Chapter 2"
 * apart.
 */
function signatureOf(text: string): { signature: string; numbered: boolean } {
  const normalized = normalizeForCompare(text);
  const withoutDigits = normalized.replace(/\d+/g, "");
  const numbered =
    normalized !== withoutDigits && withoutDigits.trim().length <= PAGE_LABEL_DECORATION_MAX;
  if (!numbered) return { signature: `=${normalized}`, numbered: false };
  return { signature: `#${normalized.replace(/\d+/g, "#")}`, numbered: true };
}

const contentOf = (line: TextLine): string => lineText(line.items);

/**
 * A foot whose decoration is too long for the digit mask of `signatureOf`
 * but which still carries a folio: the bottom edge, a digit run touching the
 * start or the end of the line, and a blank line between it and the text
 * above. The blank line is what keeps a body line that happens to end in a
 * number ("… see Table 3") out of the sequence — furniture floats free of the
 * text block, body lines touch their neighbours.
 */
function isFolioFoot(
  band: RepeatedBand,
  line: TextLine,
  lines: readonly TextLine[],
  isolation: number,
): boolean {
  if (band !== "bottom") return false;
  const normalized = normalizeForCompare(contentOf(line));
  if (!/^\d/.test(normalized) && !/\d$/.test(normalized)) return false;
  const previous = lines[lines.length - 2] as TextLine;
  return line.top - previous.bottom >= isolation;
}

/**
 * Edge candidates (first and last line of each page) plus the mid-flow
 * candidates: numbered lines, small like the body, with a blank line on at
 * least one side (`FLOW_FOLIO_ISOLATION_FACTOR` of the line spacing) — the
 * shape of a folio printed between paragraphs, whether or not the typesetter
 * left air on both sides of it.
 *
 * One page at a time (E8-T03, fatia 3): the caller builds the lines of a
 * page, takes its candidates out and lets the rest of the lines die with the
 * page — a document-wide line array used to stay alive here until every page
 * had been visited, doubling the transient cost of the pass that strips the
 * regions.
 */
function candidatesOfPage(
  lines: readonly TextLine[],
  page: number,
  bodyFontSize: number,
  lineHeight: number,
): Candidate[] {
  const candidates: Candidate[] = [];
  if (lines.length === 0) return candidates;
  const isolation = FLOW_FOLIO_ISOLATION_FACTOR * lineHeight;
  // A page with a single line can only lose it as a header: treating it as
  // a foot as well would let a one-line page be emptied by a page number.
  const edges: readonly (readonly [RepeatedBand, TextLine])[] =
    lines.length > 1
      ? [
          ["top", lines[0] as TextLine],
          ["bottom", lines[lines.length - 1] as TextLine],
        ]
      : [["top", lines[0] as TextLine]];
  for (const [band, line] of edges) {
    if (line.fontSize > REPEATED_FONT_MAX_FACTOR * bodyFontSize) continue;
    const text = contentOf(line);
    if (text.trim() === "") continue;
    // E5-T07: a Bekker/Stephanus number ("1094a") is margin numbering, not
    // furniture — a lettered sequence must never strip as a region.
    if (isMarginRefText(text)) continue;
    const { signature, numbered } = signatureOf(text);
    const edgeFolio = !numbered && isFolioFoot(band, line, lines, isolation);
    candidates.push({ band, page, line, text, signature, numbered, edgeFolio });
  }
  lines.forEach((line, index) => {
    if (index === 0 || index === lines.length - 1) return;
    if (line.fontSize > REPEATED_FONT_MAX_FACTOR * bodyFontSize) return;
    const text = contentOf(line);
    if (text.trim() === "") return;
    // E5-T07: same guard as the edge pass — a margin number is content.
    if (isMarginRefText(text)) return;
    const { signature, numbered } = signatureOf(text);
    if (!numbered) return;
    const above = line.top - (lines[index - 1] as TextLine).bottom;
    const below = (lines[index + 1] as TextLine).top - line.bottom;
    if (above < isolation && below < isolation) return;
    candidates.push({ band: "flow", page, line, text, signature, numbered, edgeFolio: false });
  });
  return candidates;
}

/**
 * Longest run of candidates whose baselines sit inside one window of
 * `tolerance` points. A stray body line that happens to share the text of a
 * running head sits elsewhere on the page and is left out of the region.
 */
function stableCluster(candidates: readonly Candidate[], tolerance: number): Candidate[] {
  const sorted = [...candidates].sort((a, b) => a.line.bottom - b.line.bottom || a.page - b.page);
  let best: Candidate[] = [];
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (
      (sorted[end] as Candidate).line.bottom - (sorted[start] as Candidate).line.bottom >
      tolerance
    ) {
      start++;
    }
    const window = sorted.slice(start, end + 1);
    if (window.length > best.length) best = window;
  }
  return best;
}

const BAND_RANK: Record<RepeatedBand, number> = { top: 0, bottom: 1, flow: 2 };

function compareRegions(a: RepeatedRegion, b: RepeatedRegion): number {
  const band = BAND_RANK[a.band] - BAND_RANK[b.band];
  if (band !== 0) return band;
  const firstA = a.occurrences[0]?.page ?? 0;
  const firstB = b.occurrences[0]?.page ?? 0;
  if (firstA !== firstB) return firstA - firstB;
  return a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0;
}

/**
 * Greedy runs of flow candidates whose printed values increase page after
 * page by at most `FLOW_FOLIO_MAX_STEP`: a value that repeats, decreases or
 * jumps too far starts a new run, and only a run long enough to be a region
 * (`minimum` pages) is kept. The sequence is the proof — the baselines of a
 * folio wander (chapter openings, part titles), so they can not cluster like
 * a head or a foot. Candidates are read top to bottom inside each page, the
 * way the book prints them.
 */
function flowRuns(candidates: readonly Candidate[], minimum: number): Candidate[][] {
  const sorted = [...candidates].sort((a, b) => a.page - b.page || a.line.top - b.line.top);
  const runs: Candidate[][] = [];
  let run: Candidate[] = [];
  let previousValue = Number.NaN;
  for (const candidate of sorted) {
    const value = Number(labelOf(candidate.text, candidate.page));
    const continues =
      run.length > 0 && value > previousValue && value - previousValue <= FLOW_FOLIO_MAX_STEP;
    if (!continues && run.length >= minimum) runs.push(run);
    if (!continues) run = [];
    run.push(candidate);
    previousValue = value;
  }
  if (run.length >= minimum) runs.push(run);
  return runs;
}

/**
 * Turns accepted candidates into a region, in reading order, and records the
 * removal. A line removed by the sequence is a proven page label even when
 * its decoration is too long for the digit mask; a line removed by the
 * signature alone only labels when the mask made it numbered.
 */
function acceptRegion(
  band: RepeatedBand,
  candidates: readonly Candidate[],
  regions: RepeatedRegion[],
  removedLines: RemovedLine[],
  sequenceProven: boolean,
): void {
  const occurrences: RepeatedOccurrence[] = [];
  for (const candidate of [...candidates].sort(
    (a, b) => a.page - b.page || a.line.top - b.line.top,
  )) {
    const pageLabel =
      candidate.numbered || (sequenceProven && candidate.edgeFolio)
        ? labelOf(candidate.text, candidate.page)
        : null;
    const occurrence: RepeatedOccurrence = {
      page: candidate.page,
      text: candidate.text,
      pageLabel,
    };
    occurrences.push(occurrence);
    removedLines.push({ page: candidate.page, line: candidate.line, occurrence });
  }
  regions.push({ band, signature: (candidates[0] as Candidate).signature, occurrences });
}

function analyze(document: RawDocument): Analysis {
  // A document with no items can not carry a region. This guard keeps
  // `documentStats` (which throws on an item-less document) out of that path,
  // exactly like the "no page has lines" early return always did.
  if (!document.pages.some((page) => page.items.length > 0)) {
    return { regions: [], removedLines: [], pageLabels: document.pages.map(() => null) };
  }

  const stats = documentStats(document);
  const tolerance = REPEATED_BASELINE_TOLERANCE_FACTOR * stats.lineHeight;

  const groups = new Map<string, Candidate[]>();
  const flowCandidates: Candidate[] = [];
  const numberedEdges: Candidate[] = [];
  const singleLinePages = new Set<number>();
  let pagesWithText = 0;
  document.pages.forEach((page, index) => {
    const lines = groupLines(page);
    if (lines.length > 0) pagesWithText++;
    if (lines.length <= 1) singleLinePages.add(index);
    // E8-T03 (fatia 3): the lines of this page die with it — only the
    // candidates keep a reference to the few lines that may still be removed.
    for (const candidate of candidatesOfPage(lines, index, stats.bodyFontSize, stats.lineHeight)) {
      if (candidate.band === "flow") {
        flowCandidates.push(candidate);
        continue;
      }
      if (candidate.numbered || candidate.edgeFolio) numberedEdges.push(candidate);
      const key = `${candidate.band}|${candidate.signature}`;
      const bucket = groups.get(key);
      if (bucket === undefined) groups.set(key, [candidate]);
      else bucket.push(candidate);
    }
  });
  if (pagesWithText === 0) {
    return { regions: [], removedLines: [], pageLabels: document.pages.map(() => null) };
  }

  const minimum = Math.max(REPEATED_MIN_PAGES, Math.ceil(REPEATED_MIN_PAGE_SHARE * pagesWithText));

  const regions: RepeatedRegion[] = [];
  const removedLines: RemovedLine[] = [];
  for (const bucket of groups.values()) {
    const cluster = stableCluster(bucket, tolerance);
    if (cluster.length < minimum) continue;
    acceptRegion((bucket[0] as Candidate).band, cluster, regions, removedLines, false);
  }
  // An edge folio whose baseline wanders (a chapter opening pushes it down)
  // or whose decoration defeats the signature (a journal foot) can not
  // cluster like a running head: the sequence picks up the numbered edges
  // the edge pass left behind — except on a page whose only line it is,
  // which no region may ever empty.
  const removedLineSet = new Set(removedLines.map((entry) => entry.line));
  for (const candidate of numberedEdges) {
    if (singleLinePages.has(candidate.page)) continue;
    if (!removedLineSet.has(candidate.line)) flowCandidates.push({ ...candidate, band: "flow" });
  }
  for (const run of flowRuns(flowCandidates, minimum)) {
    acceptRegion("flow", run, regions, removedLines, true);
  }
  regions.sort(compareRegions);
  removedLines.sort((a, b) => a.page - b.page);

  // A foot carries the printed number of its page; a numbered head only fills
  // the pages where no foot could (regions come out top first, so the foot
  // wins every page that has one).
  const pageLabels: (string | null)[] = document.pages.map(() => null);
  for (const { occurrence } of removedLines) {
    if (occurrence.pageLabel !== null) pageLabels[occurrence.page] = occurrence.pageLabel;
  }

  return { regions, removedLines, pageLabels };
}

/** Repeated regions of a document, empty when there is nothing to remove. */
export function detectRepeatedRegions(document: RawDocument): RepeatedRegion[] {
  return analyze(document).regions;
}

/**
 * The document without its repeated regions, plus what was taken out. Called
 * once per entry point (`documentParagraphs`, `buildBook`, the eval text) —
 * never feed the returned document back into the extractor.
 */
export function stripRepeatedRegions(document: RawDocument): StrippedDocument {
  const { regions, removedLines, pageLabels } = analyze(document);
  const drop = new Set<RawTextItem>();
  for (const { line } of removedLines) {
    for (const item of line.items) drop.add(item);
  }
  const pages = document.pages.map((page) => ({
    ...page,
    items: page.items.filter((item) => !drop.has(item)),
  }));
  return {
    document: { ...document, pages },
    regions,
    removed: removedLines.map(({ occurrence }) => occurrence),
    pageLabels,
  };
}
