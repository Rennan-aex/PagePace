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
import { ingestPdfjs, ScannedPdfError } from "@pagepace/extractor";
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
import { textCer } from "./metrics";
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

Runs the extraction pipeline over the corpus and measures text_cer (character
error rate) for every document that declares a golden in its manifest entry
(goldens live in corpus/golden/ and, for private documents, in
$CORPUS_PRIVATE_DIR/golden/).

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
    error: null,
  };
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
    if (document.status !== "measured" || document.cer === null) continue;
    metrics[document.id] = { text_cer: document.cer };
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
  io.out(`\nbaseline updated: ${BASELINE_RELATIVE_PATH} (${count} document(s), text_cer)\n`);
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

  return `${header}\n${perDocument}\n\nBy level (mean of the measured documents)\n${perLevel}${errorSection}\n`;
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
