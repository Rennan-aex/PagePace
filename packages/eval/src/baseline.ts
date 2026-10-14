// Baseline of accepted metric values and the regression gate (E1-T08, ADR-008).
//
// `packages/eval/baseline.json` is versioned by git: the accepted value of
// every metric for every measured document. `pnpm eval --ci` fails when a
// metric gets worse than BASELINE_TOLERANCE (0.002 absolute).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const BASELINE_FORMAT_VERSION = 1;
export const BASELINE_TOLERANCE = 0.002;
/** Repo-relative location of the file, always shown with forward slashes. */
export const BASELINE_RELATIVE_PATH = "packages/eval/baseline.json";

export type MetricDirection = "lower" | "higher";

/** Which way each metric improves. Every new metric registers here (E2+). */
export const METRIC_DIRECTIONS: Readonly<Record<string, MetricDirection>> = Object.freeze({
  header_footer_f1: "higher",
  hyphen_join_acc: "higher",
  para_boundary_f1: "higher",
  reading_order: "higher",
  style_f1: "higher",
  text_cer: "lower",
});

export class BaselineError extends Error {}

/** document id -> metric name -> accepted value. */
export type BaselineDocuments = Record<string, Record<string, number>>;

export interface Baseline {
  version: number;
  tolerance: number;
  documents: BaselineDocuments;
}

export interface BaselineChange {
  id: string;
  metric: string;
  baseline: number;
  current: number;
  /** `current - baseline` (positive = the number went up). */
  delta: number;
  /** How much the metric got worse (0 when it did not get worse). */
  worsening: number;
  status: "ok" | "worse" | "better";
}

/** A baseline entry that this run did not produce (metric null = whole document). */
export interface BaselineGap {
  id: string;
  metric: string | null;
}

export interface BaselineComparison {
  tolerance: number;
  /** Every comparable pair, sorted by document and metric. */
  changes: BaselineChange[];
  /** The subset of `changes` worse than the tolerance. */
  regressions: BaselineChange[];
  /** In the baseline, not measured in this run. */
  missing: BaselineGap[];
  /** Measured in this run, absent from the baseline. */
  added: BaselineGap[];
}

export function baselinePath(repoRoot: string): string {
  return path.join(repoRoot, "packages", "eval", "baseline.json");
}

function fail(source: string, message: string): never {
  throw new BaselineError(`${source}: ${message}`);
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strict parser: unknown keys and unknown metrics are errors (ADR-036 style). */
export function parseBaseline(text: string, source = BASELINE_RELATIVE_PATH): Baseline {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(source, `invalid JSON (${messageOf(error)})`);
  }
  if (!isRecord(parsed)) fail(source, "the top level must be an object");

  for (const key of Object.keys(parsed)) {
    if (key !== "version" && key !== "tolerance" && key !== "documents") {
      fail(source, `unknown key "${key}"`);
    }
  }
  if (parsed.version !== BASELINE_FORMAT_VERSION) {
    fail(
      source,
      `version ${JSON.stringify(parsed.version)} is not supported ` +
        `(expected ${BASELINE_FORMAT_VERSION})`,
    );
  }
  const tolerance = parsed.tolerance;
  if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance <= 0) {
    fail(source, `"tolerance" must be a finite number greater than 0`);
  }
  if (tolerance !== BASELINE_TOLERANCE) {
    fail(
      source,
      `tolerance ${tolerance} does not match BASELINE_TOLERANCE ${BASELINE_TOLERANCE} ` +
        `- run \`pnpm eval --update-baseline\``,
    );
  }
  if (!isRecord(parsed.documents)) fail(source, `"documents" must be an object`);

  const documents: BaselineDocuments = {};
  for (const [id, metrics] of Object.entries(parsed.documents)) {
    if (id === "") fail(source, "document ids must not be empty");
    if (!isRecord(metrics)) fail(source, `${id}: metrics must be an object`);
    const parsedMetrics: Record<string, number> = {};
    for (const [metric, value] of Object.entries(metrics)) {
      if (!(metric in METRIC_DIRECTIONS)) {
        fail(source, `${id}: unknown metric "${metric}" (register it in METRIC_DIRECTIONS)`);
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        fail(source, `${id}: "${metric}" must be a finite number`);
      }
      parsedMetrics[metric] = value;
    }
    documents[id] = parsedMetrics;
  }

  return { version: BASELINE_FORMAT_VERSION, tolerance, documents };
}

/** Deterministic bytes: sorted ids, sorted metrics, 2 spaces, LF, final newline. */
export function serializeBaseline(baseline: Baseline): string {
  const documents: BaselineDocuments = {};
  for (const id of Object.keys(baseline.documents).sort()) {
    const metrics = baseline.documents[id] ?? {};
    const sorted: Record<string, number> = {};
    for (const metric of Object.keys(metrics).sort()) {
      sorted[metric] = metrics[metric] as number;
    }
    documents[id] = sorted;
  }
  const text = JSON.stringify(
    {
      version: BASELINE_FORMAT_VERSION,
      tolerance: BASELINE_TOLERANCE,
      documents,
    },
    null,
    2,
  );
  return `${text}\n`;
}

/** Reads the baseline; a missing file is `null`, a broken file is an error. */
export async function readBaseline(repoRoot: string): Promise<Baseline | null> {
  const file = baselinePath(repoRoot);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return parseBaseline(text, BASELINE_RELATIVE_PATH);
}

export async function writeBaseline(repoRoot: string, baseline: Baseline): Promise<string> {
  const file = baselinePath(repoRoot);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, serializeBaseline(baseline), "utf8");
  return file;
}

/** Compares a run against the baseline (golden rule: ADR-008, E1-T08). */
export function compareBaseline(
  baseline: Baseline,
  current: BaselineDocuments,
): BaselineComparison {
  const ids = [...new Set([...Object.keys(baseline.documents), ...Object.keys(current)])].sort();
  const changes: BaselineChange[] = [];
  const regressions: BaselineChange[] = [];
  const missing: BaselineGap[] = [];
  const added: BaselineGap[] = [];

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
    const metrics = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const metric of metrics) {
      const baselineValue = before[metric];
      const currentValue = after[metric];
      if (currentValue === undefined) {
        missing.push({ id, metric });
        continue;
      }
      if (baselineValue === undefined) {
        added.push({ id, metric });
        continue;
      }
      const direction = METRIC_DIRECTIONS[metric];
      if (direction === undefined) {
        throw new BaselineError(`unknown metric "${metric}" (register it in METRIC_DIRECTIONS)`);
      }
      const delta = currentValue - baselineValue;
      const worsening = direction === "lower" ? delta : -delta;
      const status = worsening > BASELINE_TOLERANCE ? "worse" : worsening < 0 ? "better" : "ok";
      const change: BaselineChange = {
        id,
        metric,
        baseline: baselineValue,
        current: currentValue,
        delta,
        worsening,
        status,
      };
      changes.push(change);
      if (status === "worse") regressions.push(change);
    }
  }

  return { tolerance: BASELINE_TOLERANCE, changes, regressions, missing, added };
}
