// `pnpm eval` — evaluation runner (E1-T06, ADR-035).
//
// For every corpus document that declares a golden: ingest the PDF, take the
// raw text, compare it with the golden and report `text_cer`. Documents
// without a golden are listed but not measured (their golden arrives with
// E1-T07); the baseline/gate flags arrive with E1-T08.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ingestPdfjs, ScannedPdfError } from "@pagepace/extractor";
import type { RawDocument } from "@pagepace/schema";
import { type CorpusEntry, CorpusError, loadCorpus, REPO_ROOT } from "./corpus";
import { type Golden, GoldenError, goldenText, parseGolden, resolveGoldenPath } from "./golden";
import { textCer } from "./metrics";
import { documentText } from "./text";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

export const HELP = `Usage:
  pnpm eval
  pnpm eval --help

Runs the extraction pipeline over the corpus and measures text_cer (character
error rate) for every document that declares a golden in its manifest entry
(goldens live in corpus/golden/ and, for private documents, in
$CORPUS_PRIVATE_DIR/golden/).

  - reads corpus/manifest.yaml plus the private manifest resolved through
    CORPUS_PRIVATE_DIR (environment variable, then the .env file at the root);
  - documents with "golden: none" are listed as "no golden" and not measured;
  - prints a table per document and per level and writes
    packages/eval/out/report.json (ignored by git);
  - "--diff", "--ci" and "--update-baseline" arrive with task E1-T08.

Exit codes:
  0  success (a run with nothing measured still exits 0, with a warning)
  1  a document failed: missing PDF or golden, ingestion error, digest mismatch
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
      "no document declares a golden yet (corpus/golden/ is filled by task E1-T07): nothing was measured",
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

  return {
    code: errors > 0 ? EXIT_ERROR : EXIT_OK,
    documents,
    levels,
    measured,
    errors,
    withGolden,
    warnings,
  };
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

/** CLI entry: `--help` and usage errors live here, the work in `runEval`. */
export async function runEvalCli(argv: readonly string[], io: EvalIo): Promise<number> {
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help" || arg === "help") {
      io.out(HELP);
      return EXIT_OK;
    }
    io.err(`eval: unknown option: ${arg}\n\n${HELP}`);
    return EXIT_USAGE;
  }
  const result = await runEval({ out: io.out, err: io.err });
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
