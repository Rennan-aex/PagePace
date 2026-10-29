// Baseline of benchmark numbers and the "warn when it got much worse" gate
// (E8-T04, ADR-091).
//
// `packages/eval/bench-baseline.json` is versioned by git: for every measured
// document it holds the accepted `ms_per_page` and `peak_mb` plus the page
// count the run saw. `pnpm bench --ci` prints a warning (never a failure -
// the numbers are informational, E8-T04 acceptance) when a metric is more
// than BENCH_REGRESSION_PCT (25%) worse than the baseline.
//
// The baseline is calibrated from a CI run (ADR-091): time and RSS depend on
// the machine, so comparable numbers only come from the same runner. Local
// runs compare too, but as a reference.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const BENCH_BASELINE_FORMAT_VERSION = 1;
/** Share (percent) a metric may grow before `--ci` warns (E8-T04 acceptance). */
export const BENCH_REGRESSION_PCT = 25;
/** Repo-relative location of the file, always shown with forward slashes. */
export const BENCH_BASELINE_RELATIVE_PATH = "packages/eval/bench-baseline.json";
/**
 * `ms_per_page` regressions are only reported when the baseline time of the
 * document (pages x ms_per_page) reaches this floor: below it wall time on a
 * shared CI runner is scheduling noise, not a signal (measured: the same
 * commit varied n1-en-rebus-philosophy-mind 10.3 -> 18.4 ms/page, +78.6%,
 * between two ubuntu-latest runs - ADR-091 amendment).
 */
export const BENCH_MIN_GATE_MS = 5000;

export const BENCH_METRICS = ["ms_per_page", "peak_mb"] as const;
export type BenchMetric = (typeof BENCH_METRICS)[number];

export class BenchBaselineError extends Error {}

export interface BenchDocumentBaseline {
  /** Pages of the document in the run that recorded the baseline. */
  pages: number;
  ms_per_page: number;
  peak_mb: number;
}

/** document id -> accepted numbers. */
export type BenchBaselineDocuments = Record<string, BenchDocumentBaseline>;

export interface BenchBaseline {
  version: number;
  regressionPct: number;
  documents: BenchBaselineDocuments;
}

export interface BenchChange {
  id: string;
  metric: BenchMetric;
  baseline: number;
  current: number;
  /** `(current - baseline) / baseline * 100` (positive = slower/bigger). */
  worseningPct: number;
  /** `worse` beyond `regressionPct`, `below-floor` for short documents, else `ok`/`better`. */
  status: "ok" | "worse" | "better" | "below-floor";
}

/** A baseline entry this run did not produce (metric null = whole document). */
export interface BenchGap {
  id: string;
  metric: BenchMetric | null;
}

export interface BenchComparison {
  regressionPct: number;
  /** Every comparable pair, sorted by document and metric. */
  changes: BenchChange[];
  /** The subset of `changes` worse than `regressionPct` (and above the time floor). */
  regressions: BenchChange[];
  /** In the baseline, not measured in this run. */
  missing: BenchGap[];
  /** Measured in this run, absent from the baseline. */
  added: BenchGap[];
}

export function benchBaselinePath(repoRoot: string): string {
  return path.join(repoRoot, "packages", "eval", "bench-baseline.json");
}

function fail(source: string, message: string): never {
  throw new BenchBaselineError(`${source}: ${message}`);
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveNumber(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail(where, "must be a finite number greater than 0");
  }
  return value;
}

/** Strict parser: unknown keys, missing fields and bad values are errors (ADR-036 style). */
export function parseBenchBaseline(
  text: string,
  source = BENCH_BASELINE_RELATIVE_PATH,
): BenchBaseline {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(source, `invalid JSON (${messageOf(error)})`);
  }
  if (!isRecord(parsed)) fail(source, "the top level must be an object");

  for (const key of Object.keys(parsed)) {
    if (key !== "version" && key !== "regressionPct" && key !== "documents") {
      fail(source, `unknown key "${key}"`);
    }
  }
  if (parsed.version !== BENCH_BASELINE_FORMAT_VERSION) {
    fail(
      source,
      `version ${JSON.stringify(parsed.version)} is not supported ` +
        `(expected ${BENCH_BASELINE_FORMAT_VERSION})`,
    );
  }
  if (parsed.regressionPct !== BENCH_REGRESSION_PCT) {
    fail(
      source,
      `regressionPct ${JSON.stringify(parsed.regressionPct)} does not match ` +
        `BENCH_REGRESSION_PCT ${BENCH_REGRESSION_PCT} - run \`pnpm bench --update-baseline\``,
    );
  }
  if (!isRecord(parsed.documents)) fail(source, `"documents" must be an object`);

  const documents: BenchBaselineDocuments = {};
  for (const [id, entry] of Object.entries(parsed.documents)) {
    if (id === "") fail(source, "document ids must not be empty");
    if (!isRecord(entry)) fail(source, `${id}: the entry must be an object`);
    for (const key of Object.keys(entry)) {
      if (key !== "pages" && !BENCH_METRICS.includes(key as BenchMetric)) {
        fail(source, `${id}: unknown key "${key}"`);
      }
    }
    const pages = entry.pages;
    if (typeof pages !== "number" || !Number.isInteger(pages) || pages <= 0) {
      fail(source, `${id}: "pages" must be an integer greater than 0`);
    }
    const metrics: BenchDocumentBaseline = {
      pages,
      ms_per_page: positiveNumber(entry.ms_per_page, `${id}: "ms_per_page"`),
      peak_mb: positiveNumber(entry.peak_mb, `${id}: "peak_mb"`),
    };
    documents[id] = metrics;
  }

  return {
    version: BENCH_BASELINE_FORMAT_VERSION,
    regressionPct: BENCH_REGRESSION_PCT,
    documents,
  };
}

/** Deterministic bytes: sorted ids, fixed key order, 2 spaces, LF, final newline. */
export function serializeBenchBaseline(baseline: BenchBaseline): string {
  const documents: BenchBaselineDocuments = {};
  for (const id of Object.keys(baseline.documents).sort()) {
    const entry = baseline.documents[id] as BenchDocumentBaseline;
    documents[id] = {
      pages: entry.pages,
      ms_per_page: entry.ms_per_page,
      peak_mb: entry.peak_mb,
    };
  }
  const text = JSON.stringify(
    {
      version: BENCH_BASELINE_FORMAT_VERSION,
      regressionPct: BENCH_REGRESSION_PCT,
      documents,
    },
    null,
    2,
  );
  return `${text}\n`;
}

/** Reads the baseline; a missing file is `null`, a broken file is an error. */
export async function readBenchBaseline(repoRoot: string): Promise<BenchBaseline | null> {
  const file = benchBaselinePath(repoRoot);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return parseBenchBaseline(text, BENCH_BASELINE_RELATIVE_PATH);
}

export async function writeBenchBaseline(
  repoRoot: string,
  baseline: BenchBaseline,
): Promise<string> {
  const file = benchBaselinePath(repoRoot);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, serializeBenchBaseline(baseline), "utf8");
  return file;
}

/**
 * Compares a run against the baseline (E8-T04): a metric more than
 * `regressionPct`% above the baseline is a regression; `ms_per_page` also
 * needs the document's baseline time to reach BENCH_MIN_GATE_MS, otherwise
 * the change is reported as `below-floor`.
 */
export function compareBenchBaseline(
  baseline: BenchBaseline,
  current: BenchBaselineDocuments,
): BenchComparison {
  const ids = [...new Set([...Object.keys(baseline.documents), ...Object.keys(current)])].sort();
  const changes: BenchChange[] = [];
  const regressions: BenchChange[] = [];
  const missing: BenchGap[] = [];
  const added: BenchGap[] = [];

  for (const id of ids) {
    const before = baseline.documents[id];
    const after = current[id];
    if (before === undefined) {
      added.push({ id, metric: null });
      continue;
    }
    if (after === undefined) {
      missing.push({ id, metric: null });
      continue;
    }
    const metrics = BENCH_METRICS;
    for (const metric of metrics) {
      const baselineValue = before[metric];
      const currentValue = after[metric];
      const worseningPct = ((currentValue - baselineValue) / baselineValue) * 100;
      const overPct = worseningPct > baseline.regressionPct;
      const shortDocument = before.pages * before.ms_per_page < BENCH_MIN_GATE_MS;
      const status = overPct
        ? metric === "ms_per_page" && shortDocument
          ? "below-floor"
          : "worse"
        : worseningPct < 0
          ? "better"
          : "ok";
      const change: BenchChange = {
        id,
        metric,
        baseline: baselineValue,
        current: currentValue,
        worseningPct,
        status,
      };
      changes.push(change);
      if (status === "worse") regressions.push(change);
    }
  }

  return { regressionPct: baseline.regressionPct, changes, regressions, missing, added };
}
