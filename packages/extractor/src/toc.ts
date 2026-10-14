import type { Block, RawOutlineItem, TocEntry } from "@pagepace/schema";
import { HEADING_MAX_LEVEL } from "./headings";
import { normalizeForReader } from "./unicode";

/**
 * Table of contents (E4-T03 — REQ-EXT-04, layer 4 "semântica").
 *
 * The PDF's own bookmarks (`raw.outline`) are the book's real hierarchy, so
 * when the document has them every bookmark becomes a `Book.toc` entry and
 * its depth (1 = top level) becomes the level of the heading it lands on.
 * That is the hierarchy ADR-055 left to this task: the font-size clusters
 * still set the level of a heading no bookmark reaches, and the reading
 * order fallback of ADR-055 only matters for documents without an outline.
 * Without bookmarks the table falls back to the headings the layout
 * detected, in reading order, each with its own level.
 *
 * Every entry points at a `blockId`. A bookmark is resolved in four steps,
 * in order:
 *
 * 1. a heading **on the destination page** whose title answers to the bookmark;
 * 2. an answering heading **anywhere after the last match** (the destination
 *    can sit a page away from the heading);
 * 3. the first heading on the destination page (titles disagree);
 * 4. the first block on the destination page (no heading was detected there).
 *
 * Nothing fits — a bookmark with no destination, or a page with no text —
 * and the entry is dropped. Steps 3 and 4 and the drop are the discrepancies
 * and set `toc-outline-unmatched`, the only warning this module raises: a
 * heading the bookmark list does not mention is **not** a discrepancy (the
 * outline is legitimately a subset of the headings — measured on the corpus,
 * ADR-056). The code goes to `extraction.warnings` (the schema accepts any
 * code — decision d1 of ADR-049, so `@pagepace/schema` is not touched here).
 *
 * Titles are compared as **keys**: reader normalization, lower case, folded
 * accents, collapsed whitespace, dot leaders with their folio and trailing
 * punctuation removed. Two keys answer to each other when they are equal or
 * one is a prefix of the other at a word boundary, and the leading numbering
 * (`Capítulo 3`, `1.2`, `IV.`) may be present on one side only — never with
 * two different numbers.
 *
 * Deterministic: same blocks and same outline give the same table (pre-order
 * walk of the bookmark tree, first candidate wins).
 */

/** Document warning: a bookmark that no detected heading answers to. */
export const TOC_OUTLINE_UNMATCHED = "toc-outline-unmatched";
/** Shortest key (chars) two titles need to answer to each other as prefixes. */
export const TOC_MIN_MATCH_CHARS = 4;

/** Dot leaders with the folio they carry (`Chapter 1 .... 17`). */
const TOC_DOT_LEADER = /(?:\.[\s.]*\d{1,4})+[\s.]*$/;
/** Trailing punctuation and spaces a title carries as typography. */
const TOC_TRAILING_PUNCT = /[….:;!,\s]+$/;
/** A chapter/section word opening a title (`Chapter 3`). */
const TOC_NUMBERING_WORD =
  /^(?:cap[ií]tulo|chapter|parte|part|se[çc][ãa]o|section|anexo|appendix|ap[eê]ndice)\s+/;
/** Leading numbering in digits (`1`, `1.2`, `12)`) plus its separator. */
const TOC_NUMBER_DIGITS = /^(\d+(?:\.\d+)*)(?:[.):-]+\s*|\s+|$)/;
/**
 * Leading numbering in roman numerals (`IV.`, `xii)`, `iv the war`). Only a
 * token the roman grammar accepts is stripped, so words built from the same
 * letters (`civil`, `did`, `mid`) keep their meaning.
 */
const TOC_NUMBER_ROMAN =
  /^(?=[ivxlcdm])m{0,4}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})(?:[.)]|\s)\s*/i;

/** One bookmark flattened to its pre-order position; `depth` starts at 1. */
export interface FlatOutlineItem {
  title: string;
  pageIndex: number | null;
  depth: number;
}

/** Everything `buildToc` writes into the `Book`. */
export interface TocResult {
  /** The table itself, in bookmark order (or reading order without a bookmark list). */
  toc: TocEntry[];
  /** Bookmark level of every heading a bookmark answered to, keyed by block id. */
  outlineLevels: ReadonlyMap<string, number>;
  /** Warning codes, each at most once (like `extraction.warnings`). */
  warnings: string[];
}

/** Text of a block: the concatenation the schema defines for `Block`. */
function blockText(block: Block): string {
  return block.runs.map((run) => run.text).join("");
}

/** The level the schema accepts for a heading or a table entry (1..6). */
function clampLevel(depth: number): number {
  return Math.min(Math.max(depth, 1), HEADING_MAX_LEVEL);
}

/** Pre-order walk of the bookmark tree (a parent comes before its children). */
export function flattenOutline(outline: readonly RawOutlineItem[]): FlatOutlineItem[] {
  const flat: FlatOutlineItem[] = [];
  const walk = (items: readonly RawOutlineItem[], depth: number): void => {
    for (const item of items) {
      flat.push({ title: item.title, pageIndex: item.pageIndex, depth });
      if (item.children !== undefined && item.children.length > 0) walk(item.children, depth + 1);
    }
  };
  walk(outline, 1);
  return flat;
}

/**
 * Comparison key of a title: what the two sides have to agree on, with
 * typography removed. Idempotent and pure.
 */
export function tocTitleKey(text: string): string {
  return normalizeForReader(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(TOC_DOT_LEADER, "")
    .replace(TOC_TRAILING_PUNCT, "")
    .trim();
}

interface SplitNumbering {
  /** The leading number (`"3"`, `"1.2"`, `"iv"`), or `null` when there is none. */
  number: string | null;
  /** What is left of the key after the number and its separator. */
  rest: string;
}

/** Splits the leading numbering of a key from the words that follow it. */
function splitNumbering(key: string): SplitNumbering {
  const withoutWord = key.replace(TOC_NUMBERING_WORD, "");
  const digits = TOC_NUMBER_DIGITS.exec(withoutWord);
  if (digits !== null) {
    return { number: digits[1] ?? null, rest: withoutWord.slice(digits[0].length).trim() };
  }
  const roman = TOC_NUMBER_ROMAN.exec(withoutWord);
  if (roman !== null) {
    const token = roman[0].replace(/[.)\s]+$/, "").toLowerCase();
    return { number: token === "" ? null : token, rest: withoutWord.slice(roman[0].length).trim() };
  }
  return { number: null, rest: withoutWord.trim() };
}

/** Two keys answer to each other when they are equal or one ends the other's word. */
function keysAnswer(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  if (a === b) return true;
  if (a.length < TOC_MIN_MATCH_CHARS || b.length < TOC_MIN_MATCH_CHARS) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (!long.startsWith(short)) return false;
  const rest = long.charAt(short.length);
  return rest === " " || rest === ":" || rest === "-";
}

/**
 * Whether a bookmark title answers to a heading title: equal, one a prefix of
 * the other, or equal once the leading numbering of either side is removed
 * (the numbers themselves may never disagree).
 */
export function titlesAnswer(a: string, b: string): boolean {
  if (keysAnswer(a, b)) return true;
  const left = splitNumbering(a);
  const right = splitNumbering(b);
  if (left.number !== null && right.number !== null && left.number !== right.number) return false;
  if (left.rest.length < TOC_MIN_MATCH_CHARS || right.rest.length < TOC_MIN_MATCH_CHARS) {
    return false;
  }
  return keysAnswer(left.rest, right.rest);
}

interface HeadingCandidate {
  block: Block;
  /** Index of the heading in `headings` (its position among the headings). */
  index: number;
  key: string;
}

interface TocTarget {
  block: Block;
  /** Index of the heading in `headings`, when the target is one. */
  heading: number | null;
  /** Whether the bookmark title answered to the target's title. */
  answered: boolean;
}

function coversPage(block: Block, pageIndex: number | null): boolean {
  if (pageIndex === null) return false;
  return block.origin.pageFrom <= pageIndex && pageIndex <= block.origin.pageTo;
}

/** The four resolution steps, in order; `null` when the entry has to go. */
function resolveTarget(
  headings: readonly HeadingCandidate[],
  blocks: readonly Block[],
  key: string,
  pageIndex: number | null,
  claimed: ReadonlySet<string>,
  after: number,
): TocTarget | null {
  // 1. A heading on the destination page that answers to the bookmark.
  for (const candidate of headings) {
    if (claimed.has(candidate.block.id)) continue;
    if (coversPage(candidate.block, pageIndex) && titlesAnswer(key, candidate.key)) {
      return { block: candidate.block, heading: candidate.index, answered: true };
    }
  }
  // 2. An answering heading after the last match, wherever it sits.
  for (const candidate of headings) {
    if (candidate.index <= after || claimed.has(candidate.block.id)) continue;
    if (titlesAnswer(key, candidate.key)) {
      return { block: candidate.block, heading: candidate.index, answered: true };
    }
  }
  // 3. The first heading of the destination page (the titles disagree).
  for (const candidate of headings) {
    if (claimed.has(candidate.block.id)) continue;
    if (coversPage(candidate.block, pageIndex)) {
      return { block: candidate.block, heading: candidate.index, answered: false };
    }
  }
  // 4. The first block of the destination page (no heading was found there).
  for (const block of blocks) {
    if (claimed.has(block.id)) continue;
    if (coversPage(block, pageIndex)) return { block, heading: null, answered: false };
  }
  return null;
}

/**
 * Builds the table of contents of a `Book`: from the PDF bookmarks when the
 * document has them (cross-checked against the detected headings), from the
 * detected headings otherwise. Every entry points at a `blockId`.
 */
export function buildToc(blocks: readonly Block[], outline?: readonly RawOutlineItem[]): TocResult {
  const headings: HeadingCandidate[] = [];
  blocks.forEach((block, index) => {
    if (block.kind === "heading") {
      headings.push({ block, index, key: tocTitleKey(blockText(block)) });
    }
  });

  // Without bookmarks the detected headings are the table (E4-T02 levels).
  if (outline === undefined || outline.length === 0) {
    return {
      toc: headings.map(({ block }) => ({
        title: blockText(block),
        blockId: block.id,
        level: block.level ?? 1,
      })),
      outlineLevels: new Map(),
      warnings: [],
    };
  }

  const toc: TocEntry[] = [];
  const outlineLevels = new Map<string, number>();
  const claimed = new Set<string>();
  /** Position of the last heading a bookmark answered to (forward search only). */
  let after = -1;
  let discrepancy = false;

  for (const item of flattenOutline(outline)) {
    const level = clampLevel(item.depth);
    const target = resolveTarget(
      headings,
      blocks,
      tocTitleKey(item.title),
      item.pageIndex,
      claimed,
      after,
    );
    if (target === null) {
      discrepancy = true;
      continue;
    }
    if (target.heading !== null) after = target.heading;
    claimed.add(target.block.id);
    if (target.answered) outlineLevels.set(target.block.id, level);
    else discrepancy = true;
    const title = item.title.trim() === "" ? blockText(target.block) : item.title;
    toc.push({ title, blockId: target.block.id, level });
  }

  const warnings = discrepancy ? [TOC_OUTLINE_UNMATCHED] : [];
  return { toc, outlineLevels, warnings };
}
