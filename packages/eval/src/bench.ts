// `pnpm bench` - per-document speed and memory benchmark (E8-T04, ADR-091).
//
// Runs the full extraction pipeline (`extractStream`: ingest + Book, the same
// path the CLI and the app use) over every corpus document and measures, per
// document, the wall time (ms and ms/page) and the peak RSS (MB) of the run.
//
// Methodology (ADR-091): every document runs in its own fresh worker process
// (cold start, the way the app opens one book) so the peak of one document
// never inherits the garbage of the previous one - the numbers stay
// comparable with the 300 MB budget. The pdf.js module load happens at
// import, outside the clock, but its RSS floor counts in peak MB. Within the
// worker the RSS is sampled by a 5 ms timer plus one sample per pipeline
// event, and `--runs <n>` repeats the document reporting the median.
//
// The numbers land in `packages/eval/bench-baseline.json` through
// `--update-baseline` and are compared by `--ci`, which **warns** - it never
// fails - when a metric is more than 25% worse than the baseline (the
// acceptance of E8-T04: informational numbers, a warning in the CI). The
// baseline is calibrated from a CI run because time and RSS depend on the
// machine (ADR-091); local runs compare as a reference.
//
// Exit codes: 0 success (warnings included), 1 a document failed, 2 usage.
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractStream, MB, ScannedPdfError } from "@pagepace/extractor";
import {
  BENCH_BASELINE_FORMAT_VERSION,
  BENCH_BASELINE_RELATIVE_PATH,
  BENCH_MIN_GATE_MS,
  BENCH_REGRESSION_PCT,
  type BenchBaseline,
  type BenchBaselineDocuments,
  compareBenchBaseline,
  readBenchBaseline,
  writeBenchBaseline,
} from "./bench-baseline";
import { CorpusError, loadCorpus, REPO_ROOT } from "./corpus";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

/** RSS sample period inside the worker, milliseconds (ADR-091). */
export const BENCH_INTERVAL_MS = 5;

/** One line the worker prints with its result; never parsed from free text. */
export const WORKER_PREFIX = "##PAGEPACE-BENCH## ";

export const HELP = `Usage:
  pnpm bench
  pnpm bench --runs <n>
  pnpm bench --diff
  pnpm bench --ci
  pnpm bench --update-baseline
  pnpm bench --help

Runs the extraction pipeline (extractStream: ingest + Book, the path the CLI
and the app use) over every corpus document and measures, per document:

  ms        wall time of the extraction (median of --runs <n> runs)
  ms/page   wall time divided by the page count
  peak MB   highest RSS (resident memory) sampled during the run: a timer
            every ${BENCH_INTERVAL_MS} ms plus one sample per pipeline event

  - every document runs in its own fresh worker process (cold start, like
    the app opening one book): the pdf.js load stays outside the clock and
    the peak of a document never inherits the previous document;
  - reads corpus/manifest.yaml plus the private manifest resolved through
    CORPUS_PRIVATE_DIR (environment variable, then the .env file at the root);
  - documents the extractor refuses (scanned PDF, ADR-018) are listed as
    "skipped" and never fail the run;
  - writes packages/eval/out/bench.json (ignored by git).

Baseline flags (packages/eval/bench-baseline.json, task E8-T04):
  --diff              prints this run side by side with the baseline
  --ci                prints a WARNING (never a failure) for every metric more
                      than 25% worse than the baseline; documents whose
                      baseline time is under ${BENCH_MIN_GATE_MS} ms are below
                      the timer noise and only peak_mb is checked
  --update-baseline   rewrites the baseline with this run (not combinable;
                      calibrate it from a CI run - ADR-091)
  --runs <n>          repeat each document n times (1..10, default 1) and
                      report the median

Exit codes:
  0  success (warnings, missing baseline and CI regressions included)
  1  a document failed: missing PDF, ingestion error or digest mismatch
  2  usage error
`;

export type BenchStatus = "measured" | "skipped" | "error";

export interface BenchDocumentResult {
  id: string;
  level: string | null;
  pages: number | null;
  status: BenchStatus;
  /** Median wall time of the runs, milliseconds (null when not measured). */
  ms: number | null;
  /** Median time per page, milliseconds, one decimal. */
  msPerPage: number | null;
  /** Median of the per-run peak RSS, MB, one decimal. */
  peakMb: number | null;
  runs: number;
  error: string | null;
}

export interface BenchResult {
  code: number;
  runs: number;
  documents: BenchDocumentResult[];
  measured: number;
  skipped: number;
  errors: number;
  warnings: string[];
}

export interface BenchExtractInput {
  bytes: Uint8Array;
  fileName: string;
  /** Absolute path of the PDF; the default adapter hands it to the worker. */
  pdfPath: string;
  /** Repeats the document inside the worker; injected adapters may ignore it. */
  runs: number;
  /** Called on every pipeline event (memory probe of the caller's process). */
  sample: () => void;
}

export interface BenchExtractOutput {
  pages: number;
  sha256: string;
  /** Worker-provided medians; when absent the caller measures its own call. */
  ms?: number;
  peakMb?: number;
}

/** What one measured call of one document produces. */
export type BenchExtractFn = (input: BenchExtractInput) => Promise<BenchExtractOutput>;

/** What a worker run produces (parsed from the marker line, never from prose). */
export type WorkerRunResult =
  | { ok: true; pages: number; sha256: string; ms: number; peakMb: number }
  | { ok: false; skipped: boolean; error: string };

export interface WorkerRequest {
  pdfPath: string;
  fileName: string;
  runs: number;
}

/** Runs one document `runs` times in the caller's process (worker mode / tests). */
export type WorkerRunFn = (request: WorkerRequest) => Promise<WorkerRunResult>;

export interface BenchOptions {
  repoRoot?: string;
  /** Pass `{}` in tests to ignore the ambient process environment. */
  env?: Record<string, string | undefined>;
  out?: (text: string) => void;
  err?: (text: string) => void;
  /** Repeats per document (1..10), median reported. Default 1. */
  runs?: number;
  /** Defaults to a spawned worker process; tests inject a deterministic reader. */
  extract?: BenchExtractFn;
  /** Defaults to `spawnWorkerProcess`; tests replace the process boundary. */
  workerRun?: WorkerRunFn;
  /** Wall clock in milliseconds; default `performance.now`. */
  now?: () => number;
  /** Resident memory in bytes; default `process.memoryUsage().rss`. */
  rss?: () => number;
  /** Timer probe period in ms; `0` disables the timer (page samples remain). */
  intervalMs?: number;
  /** Write `packages/eval/out/bench.json` (default `true`). */
  writeReport?: boolean;
  /** Rewrite `packages/eval/bench-baseline.json` with this run. */
  updateBaseline?: boolean;
  /** Print warnings for metrics more than 25% worse than the baseline (ADR-091). */
  ci?: boolean;
  /** Print this run side by side with the baseline. */
  diff?: boolean;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Median of the runs: one slow sample (GC, scheduler) cannot own the number. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("median: no values");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
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

async function defaultExtract(input: BenchExtractInput): Promise<BenchExtractOutput> {
  let pages = 0;
  let sha256 = "";
  for await (const event of extractStream(input.bytes, { fileName: input.fileName })) {
    input.sample();
    if (event.type === "book") {
      pages = event.book.source.pageCount;
      sha256 = event.book.id;
    }
  }
  return { pages, sha256 };
}

interface MeasureDeps {
  extract: BenchExtractFn;
  now: () => number;
  rss: () => number;
  intervalMs: number;
}

interface MeasureSample {
  ms: number;
  peakMb: number;
  output: BenchExtractOutput;
}

async function measureOnce(input: BenchExtractInput, deps: MeasureDeps): Promise<MeasureSample> {
  let peak = 0;
  const sample = (): void => {
    const value = deps.rss();
    if (value > peak) peak = value;
  };
  sample();
  const timer = deps.intervalMs > 0 ? setInterval(sample, deps.intervalMs) : null;
  const started = deps.now();
  let output: BenchExtractOutput;
  try {
    output = await deps.extract({ ...input, sample });
  } finally {
    if (timer !== null) clearInterval(timer);
  }
  const elapsed = deps.now() - started;
  sample();
  return {
    ms: output.ms ?? elapsed,
    peakMb: output.peakMb ?? peak / MB,
    output,
  };
}

/**
 * Runs one document `runs` times in this process: the body of the worker
 * (also called directly by tests, without the process boundary).
 */
export async function runWorkerProcess(
  request: WorkerRequest,
  hooks: { now?: () => number; rss?: () => number; intervalMs?: number } = {},
): Promise<WorkerRunResult> {
  const deps: MeasureDeps = {
    extract: defaultExtract,
    now: hooks.now ?? (() => performance.now()),
    rss: hooks.rss ?? (() => process.memoryUsage().rss),
    intervalMs: hooks.intervalMs ?? BENCH_INTERVAL_MS,
  };
  try {
    const bytes = new Uint8Array(await readFile(request.pdfPath));
    const samples: MeasureSample[] = [];
    for (let run = 0; run < request.runs; run++) {
      samples.push(
        await measureOnce(
          {
            bytes,
            fileName: request.fileName,
            pdfPath: request.pdfPath,
            runs: 1,
            sample: () => undefined,
          },
          deps,
        ),
      );
    }
    const pages = samples[0]?.output.pages ?? 0;
    const sha256 = samples[0]?.output.sha256 ?? "";
    if (samples.some((sample) => sample.output.pages !== pages)) {
      return { ok: false, skipped: false, error: "runs produced different page counts" };
    }
    return {
      ok: true,
      pages,
      sha256,
      ms: median(samples.map((sample) => sample.ms)),
      peakMb: median(samples.map((sample) => sample.peakMb)),
    };
  } catch (error) {
    if (error instanceof ScannedPdfError) {
      return { ok: false, skipped: true, error: error.message };
    }
    return { ok: false, skipped: false, error: messageOf(error) };
  }
}

/**
 * Spawns `node --import tsx bench.ts --worker ...` and parses the marker
 * line. The child starts at the repository root so the bare `tsx` specifier
 * of `--import` resolves next to the workspace dependencies; the PDF path is
 * absolute and needs nothing from the working directory.
 */
export function spawnWorkerProcess(request: WorkerRequest): Promise<WorkerRunResult> {
  return new Promise((resolve, reject) => {
    const script = fileURLToPath(import.meta.url);
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        script,
        "--worker",
        request.pdfPath,
        request.fileName,
        String(request.runs),
      ],
      { cwd: REPO_ROOT, env: process.env },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const line = stdout
        .split(/\r?\n/)
        .filter((candidate) => candidate.startsWith(WORKER_PREFIX))
        .pop();
      if (line === undefined) {
        const tail = stderr.trim().split(/\r?\n/).slice(-3).join(" | ");
        reject(
          new Error(
            `bench worker exited with code ${code === null ? "null" : code} without a result` +
              (tail === "" ? "" : `: ${tail}`),
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(line.slice(WORKER_PREFIX.length)) as WorkerRunResult);
      } catch (error) {
        reject(new Error(`bench worker returned invalid JSON (${messageOf(error)})`));
      }
    });
  });
}

function workerExtract(workerRun: WorkerRunFn): BenchExtractFn {
  return async (input: BenchExtractInput): Promise<BenchExtractOutput> => {
    const result = await workerRun({
      pdfPath: input.pdfPath,
      fileName: input.fileName,
      runs: input.runs,
    });
    if (!result.ok) {
      if (result.skipped) throw new ScannedPdfError();
      throw new Error(result.error);
    }
    return {
      pages: result.pages,
      sha256: result.sha256,
      ms: result.ms,
      peakMb: result.peakMb,
    };
  };
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

function statusLabel(result: BenchDocumentResult): string {
  if (result.status === "measured") return "ok";
  if (result.status === "skipped") return "skipped";
  return "error";
}

function formatMetric(value: number | null): string {
  return value === null ? "-" : value.toFixed(1);
}

function formatMs(value: number | null): string {
  return value === null ? "-" : String(Math.round(value));
}

function renderReport(
  corpus: Awaited<ReturnType<typeof loadCorpus>>,
  documents: BenchDocumentResult[],
  totals: { measured: number; skipped: number; errors: number; runs: number },
): string {
  const header =
    `PagePace bench - ${corpus.entries.length} documents ` +
    `(${corpus.publicEntries.length} public, ${corpus.privateEntries.length} private), ` +
    `${totals.measured} measured, ${totals.skipped} skipped, ${totals.errors} failed, ` +
    `${totals.runs} run(s) each\n`;
  const rows = documents.map((document) => [
    levelKey(document.level),
    document.id,
    document.pages === null ? "-" : String(document.pages),
    statusLabel(document),
    formatMs(document.ms),
    formatMetric(document.msPerPage),
    formatMetric(document.peakMb),
  ]);
  const table = renderTable(
    [
      { name: "level", align: "left" },
      { name: "document", align: "left" },
      { name: "pages", align: "right" },
      { name: "status", align: "left" },
      { name: "ms", align: "right" },
      { name: "ms/page", align: "right" },
      { name: "peak MB", align: "right" },
    ],
    rows,
  );
  const failed = documents.filter((document) => document.status === "error");
  const errorSection =
    failed.length === 0
      ? ""
      : `\n\nErrors (${failed.length}):\n${failed
          .map((document) => `  ${document.id}: ${document.error ?? "unknown error"}`)
          .join("\n")}`;
  return `${header}\n${table}${errorSection}\n`;
}

function renderDiff(baseline: BenchBaseline, current: BenchBaselineDocuments): string {
  const comparison = compareBenchBaseline(baseline, current);
  const rows: string[][] = comparison.changes.map((change) => [
    change.id,
    change.metric,
    formatMetric(change.baseline),
    formatMetric(change.current),
    `${change.worseningPct >= 0 ? "+" : ""}${change.worseningPct.toFixed(1)}%`,
    change.status,
  ]);
  for (const gap of comparison.added) {
    rows.push([gap.id, gap.metric ?? "all", "-", "-", "-", "new"]);
  }
  for (const gap of comparison.missing) {
    rows.push([gap.id, gap.metric ?? "all", "-", "-", "-", "missing"]);
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
  return (
    `Bench diff against ${BENCH_BASELINE_RELATIVE_PATH} ` +
    `(warn over +${comparison.regressionPct}%)\n\n${table}\n`
  );
}

/** Measured documents as `id -> numbers`, the baseline shape (rounded). */
function numbersOf(documents: BenchDocumentResult[]): BenchBaselineDocuments {
  const numbers: BenchBaselineDocuments = {};
  for (const document of documents) {
    if (
      document.status !== "measured" ||
      document.pages === null ||
      document.msPerPage === null ||
      document.peakMb === null
    ) {
      continue;
    }
    numbers[document.id] = {
      pages: document.pages,
      ms_per_page: document.msPerPage,
      peak_mb: document.peakMb,
    };
  }
  return numbers;
}

/** Runs the benchmark and returns the exit code plus every per-document result. */
export async function runBench(options: BenchOptions = {}): Promise<BenchResult> {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const env = options.env ?? process.env;
  const out = options.out ?? ((text: string) => void process.stdout.write(text));
  const err = options.err ?? ((text: string) => void process.stderr.write(text));
  const warnings: string[] = [];
  const warn = (message: string): void => {
    warnings.push(message);
    err(`bench: warning: ${message}\n`);
  };

  const runs = options.runs ?? 1;
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) {
    err(`bench: --runs must be an integer between 1 and 10 (got ${String(options.runs)})\n`);
    return { code: EXIT_USAGE, runs, documents: [], measured: 0, skipped: 0, errors: 1, warnings };
  }

  const workerRun: WorkerRunFn = options.workerRun ?? spawnWorkerProcess;
  const deps: MeasureDeps = {
    extract: options.extract ?? workerExtract(workerRun),
    now: options.now ?? (() => performance.now()),
    rss: options.rss ?? (() => process.memoryUsage().rss),
    intervalMs: options.intervalMs ?? BENCH_INTERVAL_MS,
  };

  let corpus: Awaited<ReturnType<typeof loadCorpus>>;
  try {
    corpus = loadCorpus({ repoRoot, env });
  } catch (error) {
    err(`bench: ${error instanceof CorpusError ? error.message : messageOf(error)}\n`);
    return { code: EXIT_ERROR, runs, documents: [], measured: 0, skipped: 0, errors: 1, warnings };
  }

  const entries = [...corpus.entries].sort((a, b) => {
    const byLevel = compareLevels(levelKey(a.level), levelKey(b.level));
    return byLevel !== 0 ? byLevel : a.id.localeCompare(b.id);
  });

  const documents: BenchDocumentResult[] = [];
  let measured = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of entries) {
    const base = { id: entry.id, level: entry.level, runs };
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(entry.path));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const message =
        code === "ENOENT"
          ? `PDF not found at ${entry.path} (${
              entry.visibility === "private"
                ? "check CORPUS_PRIVATE_DIR"
                : "run `pnpm corpus:fetch`"
            })`
          : messageOf(error);
      documents.push({
        ...base,
        pages: null,
        status: "error",
        ms: null,
        msPerPage: null,
        peakMb: null,
        error: message,
      });
      errors++;
      err(`bench: ${entry.id}: ${message}\n`);
      continue;
    }

    try {
      const sample = await measureOnce(
        {
          bytes,
          fileName: path.basename(entry.path),
          pdfPath: entry.path,
          runs,
          sample: () => undefined,
        },
        deps,
      );
      const pages = sample.output.pages;
      if (pages <= 0) throw new Error("extraction reported no pages");
      if (entry.sha256 && sample.output.sha256 !== entry.sha256) {
        throw new Error(
          `SHA-256 mismatch for ${entry.path}\n    manifest: ${entry.sha256}\n    file:     ${sample.output.sha256}`,
        );
      }
      documents.push({
        ...base,
        pages,
        status: "measured",
        ms: sample.ms,
        msPerPage: round1(sample.ms / pages),
        peakMb: round1(sample.peakMb),
        error: null,
      });
      measured++;
    } catch (error) {
      if (error instanceof ScannedPdfError) {
        documents.push({
          ...base,
          pages: null,
          status: "skipped",
          ms: null,
          msPerPage: null,
          peakMb: null,
          error: error.message,
        });
        skipped++;
        warn(`${entry.id}: skipped (${error.message})`);
        continue;
      }
      documents.push({
        ...base,
        pages: null,
        status: "error",
        ms: null,
        msPerPage: null,
        peakMb: null,
        error: messageOf(error),
      });
      errors++;
      err(`bench: ${entry.id}: ${messageOf(error)}\n`);
    }
  }

  if (measured === 0 && errors === 0) {
    warn("no document could be measured (corpus missing?): nothing was benchmarked");
  }

  out(renderReport(corpus, documents, { measured, skipped, errors, runs }));

  if (options.writeReport !== false) {
    try {
      const dir = path.join(repoRoot, "packages", "eval", "out");
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, "bench.json"),
        `${JSON.stringify(
          {
            runs,
            regressionPct: BENCH_REGRESSION_PCT,
            measured,
            skipped,
            errors,
            documents,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    } catch (error) {
      warn(`could not write packages/eval/out/bench.json (${messageOf(error)})`);
    }
  }

  let code = errors > 0 ? EXIT_ERROR : EXIT_OK;
  const numbers = numbersOf(documents);

  if (options.updateBaseline === true) {
    if (errors > 0 || measured === 0) {
      err(
        `bench: refusing to update the baseline: ` +
          `${errors > 0 ? `${errors} document(s) failed` : "no document was measured"} in this run\n`,
      );
      code = EXIT_ERROR;
    } else {
      const baseline: BenchBaseline = {
        version: BENCH_BASELINE_FORMAT_VERSION,
        regressionPct: BENCH_REGRESSION_PCT,
        documents: numbers,
      };
      const file = await writeBenchBaseline(repoRoot, baseline);
      out(
        `\nbench baseline updated: ${path.relative(repoRoot, file).split(path.sep).join("/")} ` +
          `(${measured} document(s); calibrate from CI - ADR-091)\n`,
      );
    }
  } else if (options.ci === true || options.diff === true) {
    const gate = await applyBenchGate(repoRoot, numbers, { out, err, warn });
    if (gate.regressions > 0 && options.ci === true) {
      // Informational by acceptance (E8-T04): a warning annotation, never a red build.
      out(
        `::warning title=pnpm bench::${gate.regressions} metric(s) more than ` +
          `${BENCH_REGRESSION_PCT}% worse than ${BENCH_BASELINE_RELATIVE_PATH} - see the bench step log\n`,
      );
    }
    if (errors > 0) code = EXIT_ERROR;
  }

  return { code, runs, documents, measured, skipped, errors, warnings };
}

interface GateIo {
  out: (text: string) => void;
  err: (text: string) => void;
  warn: (message: string) => void;
}

async function applyBenchGate(
  repoRoot: string,
  numbers: BenchBaselineDocuments,
  io: GateIo,
): Promise<{ regressions: number }> {
  let baseline: BenchBaseline | null;
  try {
    baseline = await readBenchBaseline(repoRoot);
  } catch (error) {
    io.err(`bench: ${messageOf(error)}\n`);
    return { regressions: 0 };
  }
  if (baseline === null) {
    io.warn(
      `baseline not found at ${BENCH_BASELINE_RELATIVE_PATH} - ` +
        "run `pnpm bench --update-baseline` (calibrate from a CI run, ADR-091)",
    );
    return { regressions: 0 };
  }

  const comparison = compareBenchBaseline(baseline, numbers);
  io.out(`\n${renderDiff(baseline, numbers)}`);

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
        ? `${gap.id} is not in the baseline - run \`pnpm bench --update-baseline\``
        : `${gap.id} ${gap.metric} is not in the baseline - run \`pnpm bench --update-baseline\``,
    );
  }

  for (const regression of comparison.regressions) {
    io.err(
      `bench: warning: regression: ${regression.id} ${regression.metric} ` +
        `${formatMetric(regression.baseline)} -> ${formatMetric(regression.current)} ` +
        `(${regression.worseningPct >= 0 ? "+" : ""}${regression.worseningPct.toFixed(1)}%, ` +
        `warn over +${comparison.regressionPct}%, floor ${BENCH_MIN_GATE_MS} ms)\n`,
    );
  }
  if (comparison.regressions.length > 0) {
    io.err(
      `bench: ${comparison.regressions.length} metric(s) worse than the baseline by more than ` +
        `${comparison.regressionPct}% - numbers are informational (ADR-091): ` +
        `check the run and, if the trade-off is deliberate, record it in DECISIONS.md ` +
        `and run \`pnpm bench --update-baseline\` from a CI calibration\n`,
    );
  }
  return { regressions: comparison.regressions.length };
}

/** CLI entry: `--help`, the baseline flags, `--runs` and usage errors live here. */
export async function runBenchCli(
  argv: readonly string[],
  io: { out: (text: string) => void; err: (text: string) => void },
): Promise<number> {
  let updateBaseline = false;
  let ci = false;
  let diff = false;
  let runs = 1;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;
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
    if (arg === "--runs") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 10) {
        io.err(`bench: --runs must be an integer between 1 and 10\n\n${HELP}`);
        return EXIT_USAGE;
      }
      runs = value;
      index++;
      continue;
    }
    io.err(`bench: unknown option: ${arg}\n\n${HELP}`);
    return EXIT_USAGE;
  }
  if (updateBaseline && (ci || diff)) {
    io.err(`bench: --update-baseline cannot be combined with --ci or --diff\n\n${HELP}`);
    return EXIT_USAGE;
  }
  const result = await runBench({ out: io.out, err: io.err, updateBaseline, ci, diff, runs });
  return result.code;
}

/** Worker mode: measures the document and prints exactly one marker line. */
export async function runWorkerCli(argv: readonly string[]): Promise<number> {
  const [pdfPath, fileName, runsRaw] = argv;
  let result: WorkerRunResult;
  if (pdfPath === undefined || fileName === undefined) {
    result = { ok: false, skipped: false, error: "--worker expects <pdfPath> <fileName> <runs>" };
  } else {
    const runs = Number(runsRaw ?? "1");
    result =
      Number.isInteger(runs) && runs >= 1 && runs <= 10
        ? await runWorkerProcess({ pdfPath, fileName, runs })
        : {
            ok: false,
            skipped: false,
            error: `--worker runs must be 1..10 (got ${runsRaw ?? ""})`,
          };
  }
  process.stdout.write(`${WORKER_PREFIX}${JSON.stringify(result)}\n`);
  return EXIT_OK;
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
  const argv = process.argv.slice(2);
  const io = {
    out: (text: string) => void process.stdout.write(text),
    err: (text: string) => void process.stderr.write(text),
  };
  process.exitCode =
    argv[0] === "--worker" ? await runWorkerCli(argv.slice(1)) : await runBenchCli(argv, io);
}
