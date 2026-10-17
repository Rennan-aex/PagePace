// `pnpm eval` — evaluation runner (E1-T06, ADR-035) plus the baseline gate
// (E1-T08, ADR-008).
//
// For every corpus document that declares a golden: ingest the PDF, take the
// raw text, compare it with the golden and report `text_cer`. Documents
// without a golden are listed but not measured. `--update-baseline` records
// the run as accepted, `--diff` shows it against the baseline and `--ci`
// fails when a metric got worse than the tolerance.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBook,
  documentLines,
  documentParagraphs,
  ingestPdfjs,
  lineText,
  noteMarkerLabel,
  paragraphHyphenText,
  paragraphText,
  ScannedPdfError,
  stripRepeatedRegions,
} from "@pagepace/extractor";
import type { RawDocument } from "@pagepace/schema";
import {
  BASELINE_FORMAT_VERSION,
  BASELINE_RELATIVE_PATH,
  BASELINE_TOLERANCE,
  type Baseline,
  type BaselineComparison,
  type BaselineDocuments,
  compareBaseline,
  readBaseline,
  writeBaseline,
} from "./baseline";
import { type CorpusEntry, CorpusError, loadCorpus, REPO_ROOT } from "./corpus";
import { type Golden, GoldenError, goldenText, parseGolden, resolveGoldenPath } from "./golden";
import {
  type BlockKindF1Result,
  type BlockKindLike,
  blockKindF1,
  type FootnoteLinkResult,
  footnoteLinkAcc,
  type HeaderFooterResult,
  type HeadingDetectionResult,
  type HeadingLike,
  type HyphenJoinAccResult,
  headerFooterF1,
  headingDetection,
  hyphenJoinAcc,
  type NoteLinkLike,
  normalizeText,
  type ParaBoundaryResult,
  paraBoundaryF1,
  type ReadingOrderResult,
  readingOrder,
  type StyleF1Result,
  styleF1,
  textCer,
} from "./metrics";
import { documentText } from "./text";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

export const HELP = `Usage:
  pnpm eval
  pnpm eval --diff
  pnpm eval --ci
  pnpm eval --update-baseline
  pnpm eval --help

Runs the extraction pipeline over the corpus and measures these metrics for
every document that declares a golden in its manifest entry (goldens live in
corpus/golden/ and, for private documents, in $CORPUS_PRIVATE_DIR/golden/):

  text_cer          character error rate (the extracted text vs the golden)
  para_boundary_f1  F1 of the paragraph boundaries (E2-T04), with the false
                    cuts and false merges reported per document
  reading_order     normalized edit distance between the block order of the
                    extraction and of the golden (E2-T06), 1 = same order
  header_footer_f1  precision and recall of the repeated-region removal
                    (E3-T02), 1 = every head, foot and page number left the
                    reading flow and nothing else did
  hyphen_join_acc   share of line-end hyphen sites the join decided the way
                    the golden writes the word (E3-T03), 1 = every break
                    hyphen joined and every legitimate hyphen kept
  style_f1          mean of the per-character F1 of bold and of italic
                    (E4-T01), 1 = every styled character in the right place
  heading_f1        F1 of the headings the Book builder emits against the
                    ones the golden declares (E4-T02), 1 = same headings
  heading_level_acc share of the matched headings whose level (1..6) also
                    agreed (E4-T02), 1 = every heading at the right depth
  footnote_link_acc F1 of the note-to-call links the Book builder emits
                    against the ones the golden declares (E5-T02), 1 = every
                    note linked to its call
  block_kind_f1     macro-average of the per-kind F1s over the kinds the
                    Book builder emits against the ones the golden declares
                    (E5-T04), 1 = every block at the right kind

  - reads corpus/manifest.yaml plus the private manifest resolved through
    CORPUS_PRIVATE_DIR (environment variable, then the .env file at the root);
  - documents with "golden: none" are listed as "no golden" and not measured;
  - prints a table per document and per level and writes
    packages/eval/out/report.json (ignored by git).

Baseline flags (packages/eval/baseline.json, task E1-T08):
  --diff              prints this run side by side with the baseline
  --ci                exits 1 when a metric is worse than the baseline by more
                      than 0.002 absolute (the golden rule, ADR-008)
  --update-baseline   rewrites the baseline with this run (not combinable)

Exit codes:
  0  success (a run with nothing measured still exits 0, with a warning)
  1  a document failed: missing PDF or golden, ingestion error, digest
     mismatch, or a metric worse than the baseline (--ci)
  2  usage error
`;

export type IngestFn = (bytes: Uint8Array, fileName: string) => Promise<RawDocument>;

export interface EvalIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

export interface EvalOptions {
  repoRoot?: string;
  /** Pass `{}` in tests to ignore the ambient process environment. */
  env?: Record<string, string | undefined>;
  out?: (text: string) => void;
  err?: (text: string) => void;
  /** Defaults to `ingestPdfjs`; tests inject a deterministic reader. */
  ingest?: IngestFn;
  /** Write `packages/eval/out/report.json` (default `true`). */
  writeReport?: boolean;
  /** Rewrite `packages/eval/baseline.json` with this run. */
  updateBaseline?: boolean;
  /** Fail (exit 1) when a metric is worse than the baseline (ADR-008). */
  ci?: boolean;
  /** Print this run side by side with the baseline. */
  diff?: boolean;
}

export type DocumentStatus = "measured" | "no-golden" | "error";

export interface DocumentResult {
  id: string;
  level: string | null;
  lang: string | null;
  visibility: string | null;
  pages: number | null;
  status: DocumentStatus;
  cer: number | null;
  edits: number | null;
  refChars: number | null;
  hypChars: number | null;
  /** Paragraph boundary F1 of the extraction (E2-T04), `null` when not measured. */
  boundaries: ParaBoundaryResult | null;
  /** Reading order score of the block sequence (E2-T06), `null` when not measured. */
  order: ReadingOrderResult | null;
  /** Repeated-region removal (E3-T02), `null` when not measured. */
  headerFooter: HeaderFooterResult | null;
  /** Hyphenation join accuracy (E3-T03), `null` when not measured. */
  hyphens: HyphenJoinAccResult | null;
  /** Inline style F1 (E4-T01), `null` when not measured. */
  styles: StyleF1Result | null;
  /** Heading detection and levels (E4-T02), `null` when not measured. */
  headings: HeadingDetectionResult | null;
  /** Footnote call links (E5-T02), `null` when not measured. */
  footnotes: FootnoteLinkResult | null;
  /** Block kind F1 (E5-T04), `null` when not measured. */
  blockKinds: BlockKindF1Result | null;
  error: string | null;
}

export interface LevelSummary {
  level: string;
  documents: number;
  measured: number;
  cer: number | null;
}

export interface EvalResult {
  code: number;
  documents: DocumentResult[];
  levels: LevelSummary[];
  measured: number;
  errors: number;
  withGolden: number;
  warnings: string[];
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function defaultIngest(bytes: Uint8Array, fileName: string): Promise<RawDocument> {
  return ingestPdfjs(bytes, { fileName });
}

function statusLabel(result: DocumentResult): string {
  if (result.status === "measured") return "ok";
  if (result.status === "no-golden") return "no golden";
  return "error";
}

function formatCer(value: number | null): string {
  return value === null ? "-" : value.toFixed(4);
}

function formatNumber(value: number | null): string {
  return value === null ? "-" : String(value);
}

function formatBoundary(value: ParaBoundaryResult | null): string {
  return value === null ? "-" : value.f1.toFixed(4);
}

function formatOrder(value: ReadingOrderResult | null): string {
  return value === null ? "-" : value.score.toFixed(4);
}

function formatHeaderFooter(value: HeaderFooterResult | null): string {
  return value === null ? "-" : value.f1.toFixed(4);
}

function formatHyphen(value: HyphenJoinAccResult | null): string {
  return value === null ? "-" : value.acc.toFixed(4);
}

function formatStyle(value: StyleF1Result | null): string {
  return value === null ? "-" : value.f1.toFixed(4);
}

function formatHeading(value: HeadingDetectionResult | null): string {
  return value === null ? "-" : value.f1.toFixed(4);
}

function formatFootnote(value: FootnoteLinkResult | null): string {
  return value === null ? "-" : value.acc.toFixed(4);
}

function formatBlockKind(value: BlockKindF1Result | null): string {
  return value === null ? "-" : value.f1.toFixed(4);
}

/** Left/right aligned text table, ASCII only (deterministic on any terminal). */
function renderTable(
  columns: { name: string; align: "left" | "right" }[],
  rows: string[][],
): string {
  const widths = columns.map((column, index) =>
    Math.max(column.name.length, ...rows.map((row) => (row[index] ?? "").length)),
  );
  const line = (cells: string[]): string =>
    cells
      .map((cell, index) =>
        columns[index]?.align === "right"
          ? (cell ?? "").padStart(widths[index] ?? 0)
          : (cell ?? "").padEnd(widths[index] ?? 0),
      )
      .join("  ")
      .trimEnd();
  return [
    line(columns.map((column) => column.name)),
    line(columns.map((_, index) => "-".repeat(widths[index] ?? 0))),
    ...rows.map(line),
  ].join("\n");
}

function levelKey(level: string | null): string {
  return level ?? "?";
}

/** N1..N5 first (numeric part), anything else after, alphabetically. */
function compareLevels(a: string, b: string): number {
  const numberA = /^N(\d+)$/.exec(a);
  const numberB = /^N(\d+)$/.exec(b);
  if (numberA && numberB) return Number(numberA[1]) - Number(numberB[1]);
  if (numberA) return -1;
  if (numberB) return 1;
  return a.localeCompare(b);
}

async function measure(
  entry: CorpusEntry,
  golden: Golden,
  ingest: IngestFn,
): Promise<Omit<DocumentResult, "id" | "level" | "lang" | "visibility" | "pages">> {
  const coverage = golden.coverage;
  const totalPages = entry.pages;
  if (coverage && totalPages !== null) {
    const outside = coverage.filter((page) => page > totalPages);
    if (outside.length > 0) {
      throw new GoldenError(
        `${entry.id}: coverage.page(s) ${outside.join(", ")} beyond the document (${totalPages} pages)`,
      );
    }
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(entry.path));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      const hint =
        entry.visibility === "private" ? "check CORPUS_PRIVATE_DIR" : "run `pnpm corpus:fetch`";
      throw new Error(`PDF not found at ${entry.path} (${hint})`);
    }
    throw error;
  }

  let document: RawDocument;
  try {
    document = await ingest(bytes, path.basename(entry.path));
  } catch (error) {
    if (error instanceof ScannedPdfError) throw new Error(error.message);
    throw error;
  }

  if (entry.sha256 && document.source.sha256 !== entry.sha256) {
    throw new Error(
      `SHA-256 mismatch for ${entry.path}\n    manifest: ${entry.sha256}\n    file:     ${document.source.sha256}`,
    );
  }

  const extracted = documentText(document, coverage);
  const result = textCer(goldenText(golden), extracted);
  return {
    status: "measured",
    cer: result.cer,
    edits: result.edits,
    refChars: result.refChars,
    hypChars: result.hypChars,
    boundaries: paragraphBoundaries(golden, document, coverage),
    order: blockReadingOrder(golden, document, coverage),
    headerFooter: headerFooterRemoval(golden, document, coverage),
    hyphens: hyphenJoinAccuracy(golden, document, coverage),
    styles: blockStyleF1(golden, document, coverage),
    headings: blockHeadingDetection(golden, document, coverage),
    footnotes: footnoteLinks(golden, document, coverage),
    blockKinds: blockKindDetection(golden, document, coverage),
    error: null,
  };
}

/**
 * `para_boundary_f1` of one document (E2-T04): the golden blocks against the
 * paragraphs the extractor builds, with page breaks left out of both sides.
 * The acceptance test calls the very function the runner measures with.
 */
export function paragraphBoundaries(
  golden: Golden,
  document: RawDocument,
  coverage: number[] | null = golden.coverage,
): ParaBoundaryResult {
  const reference = referenceParagraphs(golden);
  const hypothesis = extractedParagraphs(document, coverage);
  return paraBoundaryF1(reference.texts, hypothesis.texts, {
    referencePageBreaks: reference.pageBreaks,
    hypothesisPageBreaks: hypothesis.pageBreaks,
  });
}

interface ParagraphSegments {
  /** One string per paragraph, in reading order. */
  texts: string[];
  /** Indexes whose preceding boundary is a page break (out of the metric). */
  pageBreaks: number[];
}

/** Golden blocks, one string per block: the paragraph boundaries to look for. */
function referenceParagraphs(golden: Golden): ParagraphSegments {
  const texts = golden.blocks.map((block) => block.runs.map((run) => run.text).join(""));
  const pageBreaks: number[] = [];
  golden.blocks.forEach((block, index) => {
    const previous = golden.blocks[index - 1];
    if (index === 0 || previous === undefined || block.origin === null) return;
    if (previous.origin !== null && block.origin.pageFrom > previous.origin.pageTo) {
      pageBreaks.push(index);
    }
  });
  return { texts, pageBreaks };
}

/** Extracted paragraphs of the covered pages (1-based), one string per paragraph. */
function extractedParagraphs(document: RawDocument, coverage: number[] | null): ParagraphSegments {
  const texts: string[] = [];
  const pageBreaks: number[] = [];
  documentParagraphs(document).forEach((page, index) => {
    if (coverage !== null && !coverage.includes(index + 1)) return;
    if (texts.length > 0) pageBreaks.push(texts.length);
    for (const paragraph of page) texts.push(paragraphText(paragraph));
  });
  return { texts, pageBreaks };
}

/**
 * `reading_order` of one document (E2-T06): the golden block sequence against
 * the blocks the `Book` builder emits for the covered pages, in the order the
 * reader would meet them. The acceptance test calls the very function the
 * runner measures with.
 *
 * The golden side needs no crop: `parseGolden` already refuses a block whose
 * `origin` falls outside `coverage.pages`. `Book` origins are 0-based while
 * `coverage.pages` is 1-based (the golden convention), hence the `+ 1`.
 */
export function blockReadingOrder(
  golden: Golden,
  document: RawDocument,
  coverage: number[] | null = golden.coverage,
): ReadingOrderResult {
  const wanted = coverage === null ? null : new Set(coverage);
  const extracted = buildBook(document)
    .blocks.filter((block) => wanted === null || wanted.has(block.origin.pageFrom + 1))
    .map((block) => block.runs.map((run) => run.text).join(""));
  return readingOrder(
    golden.blocks.map((block) => block.runs.map((run) => run.text).join("")),
    extracted,
  );
}

/**
 * `style_f1` of one document (E4-T01): the bold/italic of the golden runs
 * against the runs the `Book` builder emits for the covered pages. The
 * acceptance test calls the very function the runner measures with.
 *
 * The hypothesis is the `Book` — the runs the reader receives — cropped by
 * `coverage.pages` exactly like `blockReadingOrder`. The golden side needs
 * no crop (`parseGolden` already refuses a block outside the coverage).
 */
export function blockStyleF1(
  golden: Golden,
  document: RawDocument,
  coverage: number[] | null = golden.coverage,
): StyleF1Result {
  const wanted = coverage === null ? null : new Set(coverage);
  const extracted = buildBook(document)
    .blocks.filter((block) => wanted === null || wanted.has(block.origin.pageFrom + 1))
    .map((block) =>
      block.runs.map((run) => ({ text: run.text, bold: run.bold, italic: run.italic })),
    );
  return styleF1(
    golden.blocks.map((block) =>
      block.runs.map((run) => ({ text: run.text, bold: run.bold, italic: run.italic })),
    ),
    extracted,
  );
}

function headingOf(text: string, level: number | undefined): HeadingLike {
  return level === undefined ? { text } : { text, level };
}

/**
 * `heading_f1` and `heading_level_acc` of one document (E4-T02): the headings
 * the golden declares against the heading blocks the `Book` builder emits for
 * the covered pages. The acceptance test calls the very function the runner
 * measures with.
 *
 * Both sides are the `kind: "heading"` blocks (their text and level), cropped
 * by `coverage.pages` exactly like `blockReadingOrder`; a paragraph the
 * builder kept as a paragraph is simply not a heading, so a missed title is a
 * false negative and an invented one is a false positive.
 */
export function blockHeadingDetection(
  golden: Golden,
  document: RawDocument,
  coverage: number[] | null = golden.coverage,
): HeadingDetectionResult {
  const wanted = coverage === null ? null : new Set(coverage);
  const extracted = buildBook(document)
    .blocks.filter(
      (block) =>
        block.kind === "heading" && (wanted === null || wanted.has(block.origin.pageFrom + 1)),
    )
    .map((block) => headingOf(block.runs.map((run) => run.text).join(""), block.level));
  return headingDetection(
    golden.blocks
      .filter((block) => block.kind === "heading")
      .map((block) => headingOf(block.runs.map((run) => run.text).join(""), block.level)),
    extracted,
  );
}

/**
 * `footnote_link_acc` of one document (E5-T02): the note→call links the
 * golden declares against the links the `Book` builder emits for the covered
 * pages. The acceptance test calls the very function the runner measures
 * with.
 *
 * Reference: every golden run carrying `noteRef` — the pair is the block's
 * 1-based page and the label the run points at. Hypothesis: every extracted
 * run carrying `noteRef` (the id of a note block) — the pair is the calling
 * block's page and the label of the marker its target note opens with
 * (`noteMarkerLabel`); a target the coverage crop removed keeps the raw id
 * as its label, which never matches a golden label and counts as invented.
 */
export function footnoteLinks(
  golden: Golden,
  document: RawDocument,
  coverage: number[] | null = golden.coverage,
): FootnoteLinkResult {
  const wanted = coverage === null ? null : new Set(coverage);
  const blocks = buildBook(document).blocks.filter(
    (block) => wanted === null || wanted.has(block.origin.pageFrom + 1),
  );
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const hypothesis: NoteLinkLike[] = [];
  for (const block of blocks) {
    for (const run of block.runs) {
      if (run.noteRef === undefined) continue;
      const note = byId.get(run.noteRef);
      const label =
        note === undefined
          ? run.noteRef
          : (noteMarkerLabel(note.runs.map((inner) => inner.text).join("")) ?? run.noteRef);
      hypothesis.push({ page: block.origin.pageFrom + 1, label });
    }
  }
  const reference: NoteLinkLike[] = [];
  for (const block of golden.blocks) {
    if (block.origin === null) continue;
    for (const run of block.runs) {
      if (run.noteRef !== undefined) {
        reference.push({ page: block.origin.pageFrom, label: run.noteRef });
      }
    }
  }
  return footnoteLinkAcc(reference, hypothesis);
}

/**
 * `block_kind_f1` of one document (E5-T04): the kinds of the golden blocks
 * against the kinds the `Book` builder emits for the covered pages. Both
 * sides carry every block with its `kind` and its text, matched per kind on
 * the normalized text (a multiset). The acceptance test calls the very
 * function the runner measures with.
 *
 * Reference: every golden block. Hypothesis: every extracted block, cropped
 * by `coverage.pages` exactly like `blockReadingOrder`. A paragraph the
 * builder wrongly emits as a blockquote is a false positive for `blockquote`
 * and a false negative for `paragraph` — the two counts are the report.
 */
export function blockKindDetection(
  golden: Golden,
  document: RawDocument,
  coverage: number[] | null = golden.coverage,
): BlockKindF1Result {
  const wanted = coverage === null ? null : new Set(coverage);
  const text = (runs: readonly { text: string }[]): string => runs.map((run) => run.text).join("");
  const reference: BlockKindLike[] = golden.blocks.map((block) => ({
    text: text(block.runs),
    kind: block.kind,
  }));
  const hypothesis: BlockKindLike[] = buildBook(document)
    .blocks.filter((block) => wanted === null || wanted.has(block.origin.pageFrom + 1))
    .map((block) => ({ text: text(block.runs), kind: block.kind }));
  return blockKindF1(reference, hypothesis);
}

/**
 * Smallest fraction of a line's trigrams that must also appear in the golden
 * text for the line to count as golden content (E3-T02). A body line with a
 * character error keeps almost every trigram; a real head or foot shares
 * almost none.
 */
export const HEADER_FOOTER_TRIGRAM_HOLD = 0.7;

/** Every trigram of a text, built once per page of golden content. */
function trigramsOf(text: string): Set<string> {
  const trigrams = new Set<string>();
  for (let i = 0; i + 3 <= text.length; i++) trigrams.add(text.slice(i, i + 3));
  return trigrams;
}

/**
 * Typo-tolerant containment: enough trigrams of the line sit in the golden
 * (`HEADER_FOOTER_TRIGRAM_HOLD`). Lines shorter than four characters never
 * take this path — they would match by chance — so they need the exact match.
 */
function holdsByTrigrams(line: string, goldenTrigrams: ReadonlySet<string>): boolean {
  if (line.length < 4) return false;
  const total = line.length - 2;
  let hits = 0;
  for (let i = 0; i + 3 <= line.length; i++) {
    if (goldenTrigrams.has(line.slice(i, i + 3))) hits++;
  }
  return hits >= Math.floor(total * HEADER_FOOTER_TRIGRAM_HOLD);
}

/**
 * `header_footer_f1` of one document (E3-T02): what the extractor removes as a
 * repeated region against what the golden leaves out of the reading flow.
 *
 * Reference: the lines of the covered pages the golden does not hold — a
 * running head, a foot or a page number never enters the golden blocks. The
 * golden text is read **per page** when its blocks carry `origin`s, and falls
 * back to the whole-document text for a page the golden does not describe
 * (the only view a golden anchored entirely on page 1 can offer). Matching is
 * exact on tokens first, then trigram-tolerant, so a body line with a
 * character error still counts as golden content and `text_cer` noise never
 * becomes a fake "missed removal". Hypothesis: the lines
 * `stripRepeatedRegions` actually removed. Keys are `"<1-based page>:<text>"`,
 * so a region is judged page by page and a removal on the wrong page counts as
 * an error.
 *
 * Limits: a header whose text nearly matches a body line of the same page is
 * not counted (containment can only be conservative), and line boundaries are
 * the PDF's, not the reader's paragraph breaks. The acceptance test calls the
 * very function the runner measures with.
 */
export function headerFooterRemoval(
  golden: Golden,
  document: RawDocument,
  coverage: number[] | null = golden.coverage,
): HeaderFooterResult {
  const wanted = coverage === null ? null : new Set(coverage);

  const global = ` ${normalizeText(goldenText(golden))} `;
  const globalTrigrams = trigramsOf(global);
  const pageText = new Map<number, string>();
  for (const block of golden.blocks) {
    if (block.origin === null) continue;
    const text = normalizeText(block.runs.map((run) => run.text).join(""));
    if (text === "") continue;
    for (let page = block.origin.pageFrom; page <= block.origin.pageTo; page++) {
      pageText.set(page, `${pageText.get(page) ?? ""}${text} `);
    }
  }
  const pageTrigrams = new Map<number, ReadonlySet<string>>();
  for (const [page, text] of pageText) pageTrigrams.set(page, trigramsOf(text));

  const reference: string[] = [];
  documentLines(document).forEach((lines, index) => {
    const page = index + 1;
    if (wanted !== null && !wanted.has(page)) return;
    const haystack = pageText.get(page) ?? global;
    const trigrams = pageTrigrams.get(page) ?? globalTrigrams;
    for (const line of lines) {
      const text = normalizeText(lineText(line.items));
      if (text === "") continue;
      if (haystack.includes(` ${text} `) || holdsByTrigrams(text, trigrams)) continue;
      reference.push(`${page}:${text}`);
    }
  });

  const hypothesis = stripRepeatedRegions(document)
    .removed.filter((occurrence) => wanted === null || wanted.has(occurrence.page + 1))
    .map((occurrence) => `${occurrence.page + 1}:${normalizeText(occurrence.text)}`);

  return headerFooterF1(reference, hypothesis);
}

/**
 * `hyphen_join_acc` of one document (E3-T03): every line-end hyphen site of
 * the covered pages, decided by the extractor's own rules, against the words
 * the golden holds. The acceptance test calls the very function the runner
 * measures with.
 *
 * Sites come from `documentParagraphs` (the same paragraphs the `Book`
 * builder turns into blocks), so the scored decisions are exactly the ones
 * the reader gets. Each site contributes the word the join produced; the
 * metric counts it correct when that word is a word of the golden. A page
 * without a hyphen site contributes nothing — `hyphenJoinAcc` scores an
 * empty hypothesis as 1.
 */
export function hyphenJoinAccuracy(
  golden: Golden,
  document: RawDocument,
  coverage: number[] | null = golden.coverage,
): HyphenJoinAccResult {
  const wanted = coverage === null ? null : new Set(coverage);
  const sites: { word: string; uncertain: boolean }[] = [];
  documentParagraphs(document).forEach((page, index) => {
    if (wanted !== null && !wanted.has(index + 1)) return;
    for (const paragraph of page) {
      for (const site of paragraphHyphenText(paragraph).sites) {
        sites.push({ word: site.word, uncertain: site.decision === "uncertain" });
      }
    }
  });
  return hyphenJoinAcc(goldenText(golden), sites);
}

/** Runs the evaluation and returns the exit code plus every per-document result. */
export async function runEval(options: EvalOptions = {}): Promise<EvalResult> {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const out = options.out ?? ((text: string) => void process.stdout.write(text));
  const err = options.err ?? ((text: string) => void process.stderr.write(text));
  const ingest = options.ingest ?? defaultIngest;
  const warnings: string[] = [];
  const warn = (message: string): void => {
    warnings.push(message);
    err(`eval: warning: ${message}\n`);
  };

  let corpus: Awaited<ReturnType<typeof loadCorpus>>;
  try {
    corpus = loadCorpus({ repoRoot, env: options.env });
  } catch (error) {
    err(`eval: ${error instanceof CorpusError ? error.message : messageOf(error)}\n`);
    return {
      code: EXIT_ERROR,
      documents: [],
      levels: [],
      measured: 0,
      errors: 1,
      withGolden: 0,
      warnings,
    };
  }

  const entries = [...corpus.entries].sort((a, b) => {
    const byLevel = compareLevels(levelKey(a.level), levelKey(b.level));
    return byLevel !== 0 ? byLevel : a.id.localeCompare(b.id);
  });

  const documents: DocumentResult[] = [];
  let withGolden = 0;
  let measured = 0;
  let errors = 0;

  for (const entry of entries) {
    const base = {
      id: entry.id,
      level: entry.level,
      lang: entry.lang,
      visibility: entry.visibility,
      pages: entry.pages,
    };
    let goldenPath: string | null = null;
    try {
      goldenPath = resolveGoldenPath(entry, {
        repoRoot,
        privateDir: corpus.privateDir,
        private: entry.visibility === "private" && corpus.privateDir !== null,
      });
    } catch (error) {
      documents.push({
        ...base,
        status: "error",
        cer: null,
        edits: null,
        refChars: null,
        hypChars: null,
        boundaries: null,
        order: null,
        headerFooter: null,
        hyphens: null,
        styles: null,
        headings: null,
        footnotes: null,
        blockKinds: null,
        error: messageOf(error),
      });
      errors++;
      continue;
    }

    if (goldenPath === null) {
      documents.push({
        ...base,
        status: "no-golden",
        cer: null,
        edits: null,
        refChars: null,
        hypChars: null,
        boundaries: null,
        order: null,
        headerFooter: null,
        hyphens: null,
        styles: null,
        headings: null,
        footnotes: null,
        blockKinds: null,
        error: null,
      });
      continue;
    }
    withGolden++;

    try {
      let golden: Golden;
      try {
        golden = parseGolden(await readFile(goldenPath, "utf8"), goldenPath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          throw new Error(`golden declared but not found: ${goldenPath}`);
        }
        throw error;
      }
      if (golden.id !== entry.id) {
        throw new GoldenError(
          `${goldenPath}: golden id "${golden.id}" does not match the manifest id "${entry.id}"`,
        );
      }

      const result = await measure(entry, golden, ingest);
      documents.push({ ...base, ...result });
      measured++;
    } catch (error) {
      documents.push({
        ...base,
        status: "error",
        cer: null,
        edits: null,
        refChars: null,
        hypChars: null,
        boundaries: null,
        order: null,
        headerFooter: null,
        hyphens: null,
        styles: null,
        headings: null,
        footnotes: null,
        blockKinds: null,
        error: messageOf(error),
      });
      errors++;
      err(`eval: ${entry.id}: ${messageOf(error)}\n`);
    }
  }

  if (withGolden === 0) {
    warn(
      "no document declares a golden (corpus/manifest.yaml: golden: none everywhere): " +
        "nothing was measured",
    );
  }

  const levels = summarizeLevels(documents);
  out(renderReport(corpus, documents, levels, { measured, errors, withGolden }));

  if (options.writeReport !== false) {
    try {
      const dir = path.join(repoRoot, "packages", "eval", "out");
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, "report.json"),
        `${JSON.stringify(
          {
            corpus: {
              public: corpus.publicEntries.length,
              private: corpus.privateEntries.length,
            },
            measured,
            errors,
            withGolden,
            documents,
            levels,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    } catch (error) {
      warn(`could not write packages/eval/out/report.json (${messageOf(error)})`);
    }
  }

  let code = errors > 0 ? EXIT_ERROR : EXIT_OK;
  const metrics = metricsOf(documents);

  if (options.updateBaseline) {
    code = await applyUpdateBaseline(repoRoot, metrics, { errors, out, err });
  } else if (options.ci === true || options.diff === true) {
    code = await applyBaselineGate(repoRoot, metrics, {
      ci: options.ci === true,
      diff: options.diff === true,
      measured,
      out,
      err,
      warn,
    });
    if (errors > 0) code = EXIT_ERROR;
  }

  return {
    code,
    documents,
    levels,
    measured,
    errors,
    withGolden,
    warnings,
  };
}

/** Measured documents as `id -> metric -> value`, the baseline shape. */
function metricsOf(documents: DocumentResult[]): BaselineDocuments {
  const metrics: BaselineDocuments = {};
  for (const document of documents) {
    const boundaries = document.boundaries;
    const order = document.order;
    const headerFooter = document.headerFooter;
    const hyphens = document.hyphens;
    const styles = document.styles;
    const headings = document.headings;
    const footnotes = document.footnotes;
    const blockKinds = document.blockKinds;
    if (
      document.status !== "measured" ||
      document.cer === null ||
      boundaries === null ||
      order === null ||
      headerFooter === null ||
      hyphens === null ||
      styles === null ||
      headings === null ||
      footnotes === null ||
      blockKinds === null
    ) {
      continue;
    }
    metrics[document.id] = {
      block_kind_f1: blockKinds.f1,
      footnote_link_acc: footnotes.acc,
      header_footer_f1: headerFooter.f1,
      heading_f1: headings.f1,
      heading_level_acc: headings.levelAcc,
      hyphen_join_acc: hyphens.acc,
      para_boundary_f1: boundaries.f1,
      reading_order: order.score,
      style_f1: styles.f1,
      text_cer: document.cer,
    };
  }
  return metrics;
}

async function applyUpdateBaseline(
  repoRoot: string,
  metrics: BaselineDocuments,
  io: { errors: number; out: (text: string) => void; err: (text: string) => void },
): Promise<number> {
  const count = Object.keys(metrics).length;
  if (io.errors > 0) {
    io.err(`eval: refusing to update the baseline: ${io.errors} document(s) failed in this run\n`);
    return EXIT_ERROR;
  }
  if (count === 0) {
    io.err("eval: refusing to update the baseline: no document was measured\n");
    return EXIT_ERROR;
  }
  const baseline: Baseline = {
    version: BASELINE_FORMAT_VERSION,
    tolerance: BASELINE_TOLERANCE,
    documents: metrics,
  };
  await writeBaseline(repoRoot, baseline);
  const names = [...new Set(Object.values(metrics).flatMap((entry) => Object.keys(entry)))].sort();
  io.out(
    `\nbaseline updated: ${BASELINE_RELATIVE_PATH} (${count} document(s), ${names.join(", ")})\n`,
  );
  return EXIT_OK;
}

async function applyBaselineGate(
  repoRoot: string,
  metrics: BaselineDocuments,
  io: {
    ci: boolean;
    diff: boolean;
    measured: number;
    out: (text: string) => void;
    err: (text: string) => void;
    warn: (message: string) => void;
  },
): Promise<number> {
  let baseline: Baseline | null;
  try {
    baseline = await readBaseline(repoRoot);
  } catch (error) {
    io.err(`eval: ${messageOf(error)}\n`);
    return EXIT_ERROR;
  }
  if (baseline === null) {
    io.err(
      `eval: baseline not found at ${BASELINE_RELATIVE_PATH} - ` +
        "run `pnpm eval --update-baseline` first\n",
    );
    return EXIT_ERROR;
  }

  let comparison: BaselineComparison;
  try {
    comparison = compareBaseline(baseline, metrics);
  } catch (error) {
    io.err(`eval: ${messageOf(error)}\n`);
    return EXIT_ERROR;
  }

  if (io.diff) io.out(`\n${renderDiff(comparison)}`);

  if (io.ci && io.measured === 0 && comparison.missing.length > 0) {
    io.err(
      `eval: --ci measured no document while the baseline holds ` +
        `${comparison.missing.length} document(s): nothing was checked\n`,
    );
    return EXIT_ERROR;
  }

  for (const gap of comparison.missing) {
    io.warn(
      gap.metric === null
        ? `${gap.id} is in the baseline but was not measured in this run`
        : `${gap.id} has no ${gap.metric} in this run (baseline entry kept)`,
    );
  }
  for (const gap of comparison.added) {
    io.warn(
      gap.metric === null
        ? `${gap.id} is not in the baseline - run \`pnpm eval --update-baseline\``
        : `${gap.id} ${gap.metric} is not in the baseline - run \`pnpm eval --update-baseline\``,
    );
  }

  if (!io.ci || comparison.regressions.length === 0) return EXIT_OK;

  for (const regression of comparison.regressions) {
    io.err(
      `eval: regression: ${regression.id} ${regression.metric} ` +
        `${formatCer(regression.baseline)} -> ${formatCer(regression.current)} ` +
        `(worse by ${formatCer(regression.worsening)}, tolerance ${formatCer(comparison.tolerance)})\n`,
    );
  }
  io.err(
    `eval: ${comparison.regressions.length} metric(s) worse than the baseline ` +
      `(tolerance ${formatCer(comparison.tolerance)}): fix the regression or, if the ` +
      `trade-off is deliberate, record it in DECISIONS.md and run ` +
      `\`pnpm eval --update-baseline\`\n`,
  );
  return EXIT_ERROR;
}

function formatSigned(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(4)}`;
}

function renderDiff(comparison: BaselineComparison): string {
  const rows: string[][] = comparison.changes.map((change) => [
    change.id,
    change.metric,
    formatCer(change.baseline),
    formatCer(change.current),
    formatSigned(change.delta),
    change.status,
  ]);
  for (const gap of comparison.added) {
    rows.push([gap.id, gap.metric ?? "all", "-", "-", "-", "new"]);
  }
  for (const gap of comparison.missing) {
    rows.push([gap.id, gap.metric ?? "all", formatCer(null), "-", "-", "missing"]);
  }
  const table = renderTable(
    [
      { name: "document", align: "left" },
      { name: "metric", align: "left" },
      { name: "baseline", align: "right" },
      { name: "current", align: "right" },
      { name: "delta", align: "right" },
      { name: "status", align: "left" },
    ],
    rows,
  );
  return `Baseline diff against ${BASELINE_RELATIVE_PATH} (tolerance ${formatCer(comparison.tolerance)})\n\n${table}\n`;
}

function summarizeLevels(documents: DocumentResult[]): LevelSummary[] {
  const byLevel = new Map<string, DocumentResult[]>();
  for (const document of documents) {
    const key = levelKey(document.level);
    const bucket = byLevel.get(key);
    if (bucket) bucket.push(document);
    else byLevel.set(key, [document]);
  }
  return [...byLevel.entries()]
    .sort(([a], [b]) => compareLevels(a, b))
    .map(([level, bucket]) => {
      const values = bucket.filter((item) => item.status === "measured" && item.cer !== null);
      const cer =
        values.length === 0
          ? null
          : values.reduce((total, item) => total + (item.cer ?? 0), 0) / values.length;
      return { level, documents: bucket.length, measured: values.length, cer };
    });
}

function renderReport(
  corpus: Awaited<ReturnType<typeof loadCorpus>>,
  documents: DocumentResult[],
  levels: LevelSummary[],
  totals: { measured: number; errors: number; withGolden: number },
): string {
  const header =
    `PagePace evaluation - ${corpus.entries.length} documents ` +
    `(${corpus.publicEntries.length} public, ${corpus.privateEntries.length} private), ` +
    `${totals.withGolden} with golden, ${totals.measured} measured\n`;

  const rows = documents.map((document) => [
    levelKey(document.level),
    document.id,
    document.pages === null ? "-" : String(document.pages),
    statusLabel(document),
    formatCer(document.cer),
    formatBoundary(document.boundaries),
    formatOrder(document.order),
    formatHeaderFooter(document.headerFooter),
    formatHyphen(document.hyphens),
    formatStyle(document.styles),
    formatHeading(document.headings),
    formatFootnote(document.footnotes),
    formatBlockKind(document.blockKinds),
    formatNumber(document.edits),
    formatNumber(document.refChars),
  ]);
  const perDocument = renderTable(
    [
      { name: "level", align: "left" },
      { name: "document", align: "left" },
      { name: "pages", align: "right" },
      { name: "status", align: "left" },
      { name: "text_cer", align: "right" },
      { name: "para_boundary_f1", align: "right" },
      { name: "reading_order", align: "right" },
      { name: "header_footer_f1", align: "right" },
      { name: "hyphen_join_acc", align: "right" },
      { name: "style_f1", align: "right" },
      { name: "heading_f1", align: "right" },
      { name: "footnote_link_acc", align: "right" },
      { name: "block_kind_f1", align: "right" },
      { name: "edits", align: "right" },
      { name: "ref chars", align: "right" },
    ],
    rows,
  );

  const levelRows = levels.map((level) => [
    level.level,
    String(level.documents),
    String(level.measured),
    formatCer(level.cer),
  ]);
  const perLevel = renderTable(
    [
      { name: "level", align: "left" },
      { name: "documents", align: "right" },
      { name: "measured", align: "right" },
      { name: "text_cer (mean)", align: "right" },
    ],
    levelRows,
  );

  const failed = documents.filter((document) => document.status === "error");
  const errorSection =
    failed.length === 0
      ? ""
      : `\n\nErrors (${failed.length}):\n${failed
          .map((document) => `  ${document.id}: ${document.error ?? "unknown error"}`)
          .join("\n")}`;

  // The acceptance of E2-T04 asks for the boundary errors by document: how
  // many paragraphs the extraction cut in the middle of a golden one and how
  // many golden boundaries it skipped.
  const boundaryErrors = documents.filter(
    (document): document is DocumentResult & { boundaries: ParaBoundaryResult } =>
      document.boundaries !== null &&
      (document.boundaries.falseCuts > 0 || document.boundaries.falseMerges > 0),
  );
  const boundarySection =
    totals.measured === 0
      ? ""
      : `\n\nParagraph boundary errors (false cuts / false merges):\n${
          boundaryErrors.length === 0
            ? `  none in ${totals.measured} measured document(s)`
            : boundaryErrors
                .map(
                  (document) =>
                    `  ${document.id}: ${document.boundaries.falseCuts} false cut(s), ` +
                    `${document.boundaries.falseMerges} false merge(s) ` +
                    `(para_boundary_f1 ${document.boundaries.f1.toFixed(4)})`,
                )
                .join("\n")
        }`;

  // The acceptance of E3-T02 asks for the removal errors by document: how many
  // lines the reader still sees (missed) and how many content lines the
  // extraction took out (over-removed).
  const removalErrors = documents.filter(
    (document): document is DocumentResult & { headerFooter: HeaderFooterResult } =>
      document.headerFooter !== null &&
      (document.headerFooter.missed > 0 || document.headerFooter.overRemoved > 0),
  );
  const removalSection =
    totals.measured === 0
      ? ""
      : `\n\nRepeated region removal (missed / over-removed):\n${
          removalErrors.length === 0
            ? `  none in ${totals.measured} measured document(s)`
            : removalErrors
                .map(
                  (document) =>
                    `  ${document.id}: ${document.headerFooter.missed} missed, ` +
                    `${document.headerFooter.overRemoved} over-removed ` +
                    `(header_footer_f1 ${document.headerFooter.f1.toFixed(4)})`,
                )
                .join("\n")
        }`;

  // The acceptance of E3-T03 asks for the hyphen decisions by document: how
  // many sites the join got wrong and how many it had to flag as uncertain.
  const hyphenDecisions = documents.filter(
    (document): document is DocumentResult & { hyphens: HyphenJoinAccResult } =>
      document.hyphens !== null && document.hyphens.total > 0,
  );
  const hyphenSection =
    totals.measured === 0
      ? ""
      : `\n\nHyphen joins (wrong / uncertain):\n${
          hyphenDecisions.length === 0
            ? `  no hyphen site in ${totals.measured} measured document(s)`
            : hyphenDecisions
                .map(
                  (document) =>
                    `  ${document.id}: ${document.hyphens.total - document.hyphens.correct} wrong, ` +
                    `${document.hyphens.uncertain} uncertain of ${document.hyphens.total} site(s) ` +
                    `(hyphen_join_acc ${document.hyphens.acc.toFixed(4)})`,
                )
                .join("\n")
        }`;

  // The acceptance of E4-T02 asks for the heading errors by document: the
  // headings the extraction invented (false positives), the ones the golden
  // declares and it missed, and the ones it placed at the wrong level.
  const headingErrors = documents.filter(
    (document): document is DocumentResult & { headings: HeadingDetectionResult } =>
      document.headings !== null &&
      (document.headings.falsePositives.length > 0 ||
        document.headings.falseNegatives.length > 0 ||
        document.headings.levelMismatches.length > 0),
  );
  const headingSection =
    totals.measured === 0
      ? ""
      : `\n\nHeading detection (false positives / missed / wrong level):\n${
          headingErrors.length === 0
            ? `  none in ${totals.measured} measured document(s)`
            : headingErrors
                .map(
                  (document) =>
                    `  ${document.id}: ` +
                    `heading_f1 ${document.headings.f1.toFixed(4)}, ` +
                    `heading_level_acc ${document.headings.levelAcc.toFixed(4)}; ` +
                    `false positive(s) ${headingList(document.headings.falsePositives)}; ` +
                    `missed ${headingList(document.headings.falseNegatives)}; ` +
                    `wrong level ${headingList(document.headings.levelMismatches)}`,
                )
                .join("\n")
        }`;

  // The acceptance of E5-T02 asks for the footnote link errors by document:
  // the calls the extraction invented and the links the golden declares it
  // missed (the note was detected but never linked, or linked elsewhere).
  const linkErrors = documents.filter(
    (document): document is DocumentResult & { footnotes: FootnoteLinkResult } =>
      document.footnotes !== null &&
      (document.footnotes.falsePositives.length > 0 ||
        document.footnotes.falseNegatives.length > 0),
  );
  const linkSection =
    totals.measured === 0
      ? ""
      : `\n\nFootnote call links (invented / missed):\n${
          linkErrors.length === 0
            ? `  none in ${totals.measured} measured document(s)`
            : linkErrors
                .map(
                  (document) =>
                    `  ${document.id}: ` +
                    `footnote_link_acc ${document.footnotes.acc.toFixed(4)}; ` +
                    `invented ${linkList(document.footnotes.falsePositives)}; ` +
                    `missed ${linkList(document.footnotes.falseNegatives)}`,
                )
                .join("\n")
        }`;

  // The acceptance of E5-T04 asks for the block-kind errors by document: the
  // kinds the extraction invented and the kinds the golden declares it missed,
  // with the per-kind F1s when they are not 1.
  const kindErrors = documents.filter(
    (document): document is DocumentResult & { blockKinds: BlockKindF1Result } =>
      document.blockKinds !== null &&
      [...document.blockKinds.byKind.values()].some(
        (score) => score.falsePositives.length > 0 || score.falseNegatives.length > 0,
      ),
  );
  const kindSection =
    totals.measured === 0
      ? ""
      : `\n\nBlock kind detection (invented / missed):\n${
          kindErrors.length === 0
            ? `  none in ${totals.measured} measured document(s)`
            : kindErrors
                .map(
                  (document) =>
                    `  ${document.id}: ` +
                    `block_kind_f1 ${document.blockKinds.f1.toFixed(4)}; ` +
                    `errors ${kindList(document.blockKinds)}`,
                )
                .join("\n")
        }`;

  return `${header}\n${perDocument}\n\nBy level (mean of the measured documents)\n${perLevel}${errorSection}${boundarySection}${removalSection}${hyphenSection}${headingSection}${linkSection}${kindSection}\n`;
}

/** `"none"` or the per-kind invented/missed counts, kept short for one report line. */
function kindList(result: BlockKindF1Result): string {
  const parts: string[] = [];
  for (const [kind, score] of result.byKind) {
    const invented = score.falsePositives.length;
    const missed = score.falseNegatives.length;
    if (invented === 0 && missed === 0) continue;
    parts.push(`${kind} (${invented} invented, ${missed} missed)`);
  }
  return parts.length === 0 ? "none" : parts.join("; ");
}

/** `"none"` or the `page:label` pairs of the links, kept short for one report line. */
function linkList(entries: readonly NoteLinkLike[]): string {
  if (entries.length === 0) return "none";
  return entries.map((entry) => `${entry.page}:${entry.label}`).join(", ");
}

/** `"none"` or the offending texts, shortened so one report line stays readable. */
function headingList(entries: readonly { text: string }[]): string {
  if (entries.length === 0) return "none";
  return entries
    .map((entry) =>
      JSON.stringify(entry.text.length > 40 ? `${entry.text.slice(0, 37)}...` : entry.text),
    )
    .join(", ");
}

/** CLI entry: `--help`, the baseline flags and usage errors live here. */
export async function runEvalCli(argv: readonly string[], io: EvalIo): Promise<number> {
  let updateBaseline = false;
  let ci = false;
  let diff = false;
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help" || arg === "help") {
      io.out(HELP);
      return EXIT_OK;
    }
    if (arg === "--update-baseline") {
      updateBaseline = true;
      continue;
    }
    if (arg === "--ci") {
      ci = true;
      continue;
    }
    if (arg === "--diff") {
      diff = true;
      continue;
    }
    io.err(`eval: unknown option: ${arg}\n\n${HELP}`);
    return EXIT_USAGE;
  }
  if (updateBaseline && (ci || diff)) {
    io.err(`eval: --update-baseline cannot be combined with --ci or --diff\n\n${HELP}`);
    return EXIT_USAGE;
  }
  const result = await runEval({ out: io.out, err: io.err, updateBaseline, ci, diff });
  return result.code;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const entryPath = path.resolve(entry);
  const modulePath = fileURLToPath(import.meta.url);
  return process.platform === "win32"
    ? entryPath.toLowerCase() === modulePath.toLowerCase()
    : entryPath === modulePath;
}

if (isDirectExecution()) {
  process.exitCode = await runEvalCli(process.argv.slice(2), {
    out: (text) => void process.stdout.write(text),
    err: (text) => void process.stderr.write(text),
  });
}
