import type { BBox, TagFigureHint, TagHints, TagParagraphHint } from "@pagepace/schema";

/**
 * Normalizes the PDF struct tree into `TagHints` (ADR-025): paragraph
 * confirmations, figure boxes and the `reliable` flag of S3 §4.3. The raw
 * tree never leaves this module.
 *
 * Everything here is pure (no pdf.js, no I/O) so the rules can be unit tested
 * with plain objects; `pdfjs.ts` is responsible for feeding `page` data.
 */

interface StructContent {
  type: string;
  id: string;
}

interface StructNode {
  role?: string;
  type?: string;
  id?: string;
  children?: (StructNode | StructContent)[];
  bbox?: unknown;
  alt?: unknown;
}

export interface PageTagInput {
  /** 0-based page index. */
  index: number;
  /** `page.view` of the page (`[x0, y0, x1, y1]`, PDF space). */
  view: readonly [number, number, number, number];
  /** Root node returned by `page.getStructTree()`, or `null`. */
  tree: unknown;
  /** True when the page has at least one text item. */
  hasText: boolean;
  /** Box of each marked-content id on the page, already in top-left coords. */
  mcidBoxes: ReadonlyMap<string, BBox>;
}

export interface TagHintsInput {
  /** `MarkInfo.Marked` from `pdf.getMarkInfo()`. */
  marked: boolean;
  pages: readonly PageTagInput[];
}

const isContentNode = (node: StructNode | StructContent): node is StructContent =>
  node?.type === "content" || node?.type === "object";

/** Roles that are blocks: they may not sit under an inline/leaf parent (S3 §4.3). */
const BLOCK_ROLES = new Set([
  "Part",
  "Sect",
  "Document",
  "Div",
  "Aside",
  "Nav",
  "Section",
  "Artwork",
]);
const NON_BLOCK_PARENTS = new Set([
  "P",
  "Span",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "Caption",
  "Figure",
  "TD",
  "TH",
  "LI",
  "Label",
]);

/** Roles allowed by PDF 32000-1 table 322 (plus the ones pdf.js emits). */
const STANDARD_ROLES = new Set([
  "Document",
  "Part",
  "Sect",
  "Section",
  "Div",
  "Aside",
  "Nav",
  "Article",
  "BlockQuote",
  "Caption",
  "Index",
  "Header",
  "Footer",
  "Footnote",
  "Endnote",
  "L",
  "LI",
  "LBody",
  "Lbl",
  "Table",
  "TR",
  "TH",
  "TD",
  "THead",
  "TBody",
  "TFoot",
  "Span",
  "Quote",
  "Note",
  "Reference",
  "Bibliography",
  "BibliographyEntry",
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "Title",
  "Subtitle",
  "Em",
  "Strong",
  "Link",
  "Annot",
  "Form",
  "Figure",
  "Formula",
  "Artifact",
  "Ruby",
  "RB",
  "RT",
  "RP",
  "Line",
  "Label",
  "Superscript",
  "Subscript",
  "Math",
  "Lbl",
]);

/**
 * Roles counted as **block structure** for the share behind `reliable`
 * (S3 §4.3, read as "structure of the block, not of the inline run" —
 * ADR-028): paragraphs, headings, sections, lists, tables, figures, notes and
 * quotes. Inline roles (`Span`, `Link`, `Reference`, ...) and nodes without a
 * role stay out of the numerator while still counting in the denominator, so
 * a document made mostly of inline markup never looks trustworthy and the
 * rule errs towards "do not trust" (the geometric path of E2 is the main one).
 */
export const BLOCK_STRUCTURE_ROLES: ReadonlySet<string> = new Set([
  "Document",
  "Part",
  "Sect",
  "Section",
  "Div",
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "L",
  "LI",
  "LBody",
  "Lbl",
  "Table",
  "TR",
  "TH",
  "TD",
  "Figure",
  "Caption",
  "Note",
  "BlockQuote",
]);

const MIN_COVERAGE = 0.9;
/**
 * Minimum share of block-structure nodes among the counted roles.
 *
 * **Provisional** (ADR-028): calibrated with the four tagged PDFs of the
 * corpus — `n1-en-sofia` 99,0% · `n4-en-fisica` 70,3% · `n1-en-rebus` 58,8%
 * pass; `n1-en-curinga` 16,5% fails. Revisit when a fifth tagged PDF lands.
 */
export const MIN_BLOCK_SHARE = 0.5;

interface PageStats {
  contentNodes: number;
  roleNodes: number;
  blockNodes: number;
  nonStandardNodes: number;
  invalidNesting: number;
  nonStandardRoles: Set<string>;
}

const emptyStats = (): PageStats => ({
  contentNodes: 0,
  roleNodes: 0,
  blockNodes: 0,
  nonStandardNodes: 0,
  invalidNesting: 0,
  nonStandardRoles: new Set<string>(),
});

function unionBox(target: BBox | null, source: BBox): BBox {
  if (!target) return { ...source };
  const x1 = Math.min(target.x, source.x);
  const y1 = Math.min(target.y, source.y);
  const x2 = Math.max(target.x + target.width, source.x + source.width);
  const y2 = Math.max(target.y + target.height, source.y + source.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Union of the marked-content boxes of every content node below `node`. */
function boxOf(
  node: StructNode | StructContent,
  mcidBoxes: ReadonlyMap<string, BBox>,
): BBox | null {
  if (isContentNode(node)) {
    const id = (node as StructContent).id;
    return (id && mcidBoxes.get(id)) || null;
  }
  let box: BBox | null = null;
  for (const child of (node as StructNode).children ?? []) {
    const childBox = boxOf(child, mcidBoxes);
    if (childBox) box = unionBox(box, childBox);
  }
  return box;
}

/**
 * A figure's `bbox` comes from the PDF in user space (origin at the bottom
 * left, y growing up); the schema wants top-left coordinates.
 */
function convertPdfBox(
  bbox: readonly number[],
  view: readonly [number, number, number, number],
): BBox | null {
  if (bbox.length !== 4) return null;
  const x1 = bbox[0];
  const y1 = bbox[1];
  const x2 = bbox[2];
  const y2 = bbox[3];
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return null;
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  const left = Math.min(x1, x2) - view[0];
  const right = Math.max(x1, x2) - view[0];
  const bottom = Math.min(y1, y2);
  const top = Math.max(y1, y2);
  return {
    x: left,
    y: view[3] - top,
    width: right - left,
    height: top - bottom,
  };
}

interface WalkResult {
  stats: PageStats;
  paragraphs: TagParagraphHint[];
  figures: TagFigureHint[];
}

function walkPage(page: PageTagInput, tree: StructNode): WalkResult {
  const stats = emptyStats();
  const paragraphs: TagParagraphHint[] = [];
  const figures: TagFigureHint[] = [];

  const visit = (node: StructNode | StructContent, parentRole: string | null): void => {
    if (isContentNode(node)) {
      stats.contentNodes += 1;
      return;
    }
    const role = node.role ?? "(none)";
    // pdf.js synthesizes the wrapper it hands back with the role `Root`; the
    // top node is not part of the document structure proper, so it is not
    // counted towards the role statistics.
    if (parentRole !== null) {
      stats.roleNodes += 1;
      if (BLOCK_STRUCTURE_ROLES.has(role)) stats.blockNodes += 1;
      if (role !== "(none)" && !STANDARD_ROLES.has(role)) {
        stats.nonStandardNodes += 1;
        stats.nonStandardRoles.add(role);
      }
      if (BLOCK_ROLES.has(role) && NON_BLOCK_PARENTS.has(parentRole)) stats.invalidNesting += 1;
    }

    if (role === "P") {
      const box = boxOf(node, page.mcidBoxes);
      if (box) paragraphs.push({ page: page.index, bbox: box });
    } else if (role === "Figure") {
      const fromPdf = Array.isArray(node.bbox)
        ? convertPdfBox(node.bbox as number[], page.view)
        : null;
      const box = fromPdf ?? boxOf(node, page.mcidBoxes);
      if (box) {
        const alt = typeof node.alt === "string" ? node.alt.trim() : "";
        const hint: TagFigureHint = { page: page.index, bbox: box };
        if (alt) hint.alt = alt;
        figures.push(hint);
      }
    }

    for (const child of node.children ?? []) visit(child, role);
  };

  visit(tree, null);
  return { stats, paragraphs, figures };
}

interface Collected {
  stats: PageStats;
  paragraphs: TagParagraphHint[];
  figures: TagFigureHint[];
  pagesWithText: number;
  pagesWithUsableTree: number;
  anyTree: boolean;
}

function collect(input: TagHintsInput): Collected {
  const paragraphs: TagParagraphHint[] = [];
  const figures: TagFigureHint[] = [];
  const totals = emptyStats();
  let pagesWithText = 0;
  let pagesWithUsableTree = 0;
  let anyTree = false;

  for (const page of input.pages) {
    if (page.hasText) pagesWithText += 1;
    if (!page.tree || typeof page.tree !== "object") continue;
    anyTree = true;
    const result = walkPage(page, page.tree as StructNode);
    if (result.stats.contentNodes > 0) pagesWithUsableTree += 1;
    paragraphs.push(...result.paragraphs);
    figures.push(...result.figures);
    totals.contentNodes += result.stats.contentNodes;
    totals.roleNodes += result.stats.roleNodes;
    totals.blockNodes += result.stats.blockNodes;
    totals.nonStandardNodes += result.stats.nonStandardNodes;
    totals.invalidNesting += result.stats.invalidNesting;
    for (const role of result.stats.nonStandardRoles) totals.nonStandardRoles.add(role);
  }

  return { stats: totals, paragraphs, figures, pagesWithText, pagesWithUsableTree, anyTree };
}

export interface TagStats {
  marked: boolean;
  /** Pages with at least one text item. */
  pagesWithText: number;
  /** Pages with a tree that reaches at least one content node. */
  pagesWithUsableTree: number;
  /** `pagesWithUsableTree / pagesWithText`. */
  coverage: number;
  /** Share of `BLOCK_STRUCTURE_ROLES` nodes among the counted roles. */
  blockShare: number;
  roleNodes: number;
  blockNodes: number;
  nonStandardNodes: number;
  invalidNesting: number;
  /** Non-standard roles found, sorted; empty when none. */
  nonStandardRoles: string[];
  /** Machine-readable reasons why `reliable` is false (empty when reliable). */
  reasons: readonly string[];
  reliable: boolean;
}

function summarise(marked: boolean, collected: Collected): TagStats {
  const { stats, pagesWithText, pagesWithUsableTree } = collected;
  const coverage = pagesWithText > 0 ? pagesWithUsableTree / pagesWithText : 0;
  const blockShare = stats.roleNodes > 0 ? stats.blockNodes / stats.roleNodes : 0;

  const reasons: string[] = [];
  if (!marked) reasons.push("not-marked");
  if (pagesWithText === 0) reasons.push("no-text");
  if (pagesWithText > 0 && coverage < MIN_COVERAGE) reasons.push("low-coverage");
  // A single inverted pair (`Sect` inside `P`) is enough on its own: the
  // document's structure contradicts itself, no percentage can excuse that
  // (condition of the PO's answer to OPEN-QUESTIONS #6).
  if (stats.invalidNesting > 0) reasons.push("inverted-hierarchy");
  if (stats.nonStandardNodes > 0) reasons.push("non-standard-role");
  if (blockShare < MIN_BLOCK_SHARE) reasons.push("low-block-share");

  return {
    marked,
    pagesWithText,
    pagesWithUsableTree,
    coverage,
    blockShare,
    roleNodes: stats.roleNodes,
    blockNodes: stats.blockNodes,
    nonStandardNodes: stats.nonStandardNodes,
    invalidNesting: stats.invalidNesting,
    nonStandardRoles: [...stats.nonStandardRoles].sort(),
    reasons,
    reliable: reasons.length === 0,
  };
}

/** Full statistics behind `reliable`; used by tests and the debug tooling. */
export function evaluateTagStats(input: TagHintsInput): TagStats {
  const collected = collect(input);
  return summarise(input.marked, collected);
}

/**
 * Builds `TagHints` (or `undefined` when the document declares no marking and
 * no page returned a tree).
 *
 * `reliable` follows S3 §4.3 as decided in ADR-028: `MarkInfo.Marked = true`,
 * a non-empty tree on at least 90% of the pages with text, no inverted
 * hierarchy (which alone is always disqualifying), no non-standard role and at
 * least `MIN_BLOCK_SHARE` of the counted roles being block structure. Nodes
 * without a role are "no information" (S3 §4.4), not a defect, but they still
 * count against the share.
 *
 * The hints themselves (`paragraphs`, `figures`) are emitted regardless of
 * `reliable`: they are confirmations, never the only source (E2, E10).
 */
export function buildTagHints(input: TagHintsInput): TagHints | undefined {
  const collected = collect(input);
  if (!input.marked && !collected.anyTree) return undefined;
  const stats = summarise(input.marked, collected);
  return { reliable: stats.reliable, paragraphs: collected.paragraphs, figures: collected.figures };
}
