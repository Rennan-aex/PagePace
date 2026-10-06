// Golden (ground truth) files: format, validation and path resolution
// (E1-T06, ADR-035). The shape follows the `write-golden-test` skill:
//
//   corpus/golden/<id>.golden.json                    (public documents)
//   $CORPUS_PRIVATE_DIR/golden/<id>.golden.json       (private documents)
//
// Validation lives here, in `@pagepace/eval`, because the format is still
// owned by E1-T07; when it stabilises it moves to `@pagepace/schema`.
import path from "node:path";
import type { CorpusEntry } from "./corpus";

export class GoldenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoldenError";
  }
}

export interface GoldenRun {
  text: string;
}

export interface GoldenOrigin {
  pageFrom: number;
  pageTo: number;
}

export interface GoldenBlock {
  kind: string;
  runs: GoldenRun[];
  origin: GoldenOrigin | null;
}

export interface Golden {
  id: string;
  schemaVersion: string;
  source: string;
  /** 1-based page numbers covered by the golden; `null` = whole document. */
  coverage: number[] | null;
  blocks: GoldenBlock[];
}

/** `source` values allowed by the `write-golden-test` skill. */
export const GOLDEN_SOURCES = ["synthetic", "tagged", "epub-pair", "hand-annotated"];

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const TOP_LEVEL_KEYS = new Set(["id", "schemaVersion", "source", "coverage", "blocks"]);
const BLOCK_KEYS = new Set(["kind", "runs", "origin"]);

function fail(source: string, message: string): never {
  throw new GoldenError(`${source}: ${message}`);
}

function expectObject(value: unknown, source: string, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(source, `${where} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, source: string, where: string): string {
  if (typeof value !== "string" || value === "")
    fail(source, `${where} must be a non-empty string`);
  return value;
}

function expectPages(value: unknown, source: string, where: string): number[] {
  if (!Array.isArray(value)) fail(source, `${where} must be an array of page numbers`);
  const pages: number[] = [];
  for (const page of value) {
    if (typeof page !== "number" || !Number.isInteger(page) || page < 1) {
      fail(source, `${where} must hold 1-based positive integers`);
    }
    if (pages.includes(page)) fail(source, `${where} repeats page ${page}`);
    pages.push(page);
  }
  if (
    pages.some((page, index) => {
      const previous = pages[index - 1];
      return index > 0 && previous !== undefined && page <= previous;
    })
  ) {
    fail(source, `${where} must be sorted ascending`);
  }
  return pages;
}

/** Parses and validates one `*.golden.json` document. */
export function parseGolden(text: string, source: string): Golden {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    fail(source, `invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }

  const root = expectObject(data, source, "golden");
  const unknownKeys = Object.keys(root).filter((key) => !TOP_LEVEL_KEYS.has(key));
  if (unknownKeys.length > 0) fail(source, `unknown field(s): ${unknownKeys.join(", ")}`);

  const id = expectString(root.id, source, "id");
  if (!ID_PATTERN.test(id)) fail(source, `invalid id "${id}"`);

  const schemaVersion = expectString(root.schemaVersion, source, "schemaVersion");
  if (!VERSION_PATTERN.test(schemaVersion)) {
    fail(source, `schemaVersion must look like "1.2.3", got "${schemaVersion}"`);
  }

  const goldenSource = expectString(root.source, source, "source");
  if (!GOLDEN_SOURCES.includes(goldenSource)) {
    fail(source, `source must be one of ${GOLDEN_SOURCES.join(", ")} (got "${goldenSource}")`);
  }

  let coverage: number[] | null = null;
  if (root.coverage !== undefined) {
    const coverageObject = expectObject(root.coverage, source, "coverage");
    const coverageKeys = Object.keys(coverageObject).filter((key) => key !== "pages");
    if (coverageKeys.length > 0)
      fail(source, `coverage: unknown field(s): ${coverageKeys.join(", ")}`);
    if (!("pages" in coverageObject)) fail(source, 'coverage must declare "pages"');
    coverage = expectPages(coverageObject.pages, source, "coverage.pages");
  }

  if (!Array.isArray(root.blocks)) fail(source, "blocks must be an array");
  const blocks: GoldenBlock[] = root.blocks.map((rawBlock, index) => {
    const where = `blocks[${index}]`;
    const block = expectObject(rawBlock, source, where);
    const blockKeys = Object.keys(block).filter((key) => !BLOCK_KEYS.has(key));
    if (blockKeys.length > 0) fail(source, `${where}: unknown field(s): ${blockKeys.join(", ")}`);

    const kind = expectString(block.kind, source, `${where}.kind`);
    if (!Array.isArray(block.runs)) fail(source, `${where}.runs must be an array`);
    const runs: GoldenRun[] = block.runs.map((rawRun, runIndex) => {
      const run = expectObject(rawRun, source, `${where}.runs[${runIndex}]`);
      const runKeys = Object.keys(run).filter((key) => key !== "text");
      if (runKeys.length > 0) {
        fail(source, `${where}.runs[${runIndex}]: unknown field(s): ${runKeys.join(", ")}`);
      }
      return { text: expectString(run.text, source, `${where}.runs[${runIndex}].text`) };
    });

    let origin: GoldenOrigin | null = null;
    if (block.origin !== undefined && block.origin !== null) {
      const rawOrigin = expectObject(block.origin, source, `${where}.origin`);
      const originKeys = Object.keys(rawOrigin).filter(
        (key) => key !== "pageFrom" && key !== "pageTo",
      );
      if (originKeys.length > 0)
        fail(source, `${where}.origin: unknown field(s): ${originKeys.join(", ")}`);
      const pageFrom = rawOrigin.pageFrom;
      const pageTo = rawOrigin.pageTo ?? pageFrom;
      if (typeof pageFrom !== "number" || !Number.isInteger(pageFrom) || pageFrom < 1) {
        fail(source, `${where}.origin.pageFrom must be a 1-based positive integer`);
      }
      if (typeof pageTo !== "number" || !Number.isInteger(pageTo) || pageTo < pageFrom) {
        fail(source, `${where}.origin.pageTo must be an integer >= pageFrom`);
      }
      origin = { pageFrom, pageTo };
    }

    return { kind, runs, origin };
  });

  return { id, schemaVersion, source: goldenSource, coverage, blocks };
}

/**
 * Golden text: runs of a block are inline (they carry their own spacing) and
 * blocks are separated by a line break. `normalizeText` turns both into the
 * single spaces the metric compares.
 */
export function goldenText(golden: Golden): string {
  return golden.blocks.map((block) => block.runs.map((run) => run.text).join("")).join("\n");
}

/** `golden: none` (or an absent field) means "this document has no golden". */
export function hasGolden(entry: Pick<CorpusEntry, "golden">): boolean {
  return entry.golden !== null && entry.golden !== "" && entry.golden !== "none";
}

function isInside(dir: string, file: string): boolean {
  const resolvedDir = path.resolve(dir);
  const resolvedFile = path.resolve(resolvedDir, file);
  return resolvedFile === resolvedDir || resolvedFile.startsWith(`${resolvedDir}${path.sep}`);
}

/**
 * Absolute path of the golden of one document, or `null` when the manifest
 * says `golden: none`. Public goldens live in `<repo>/corpus/golden/`,
 * private ones in `$CORPUS_PRIVATE_DIR/golden/`; the manifest value is a file
 * name relative to that directory and may not escape it.
 */
export function resolveGoldenPath(
  entry: Pick<CorpusEntry, "id" | "golden">,
  options: { repoRoot: string; privateDir: string | null; private: boolean },
): string | null {
  if (!hasGolden(entry)) return null;

  const value = entry.golden ?? "";
  if (path.isAbsolute(value)) {
    throw new GoldenError(`${entry.id}: golden path must be relative (${value})`);
  }
  const dir = options.private
    ? path.join(options.privateDir ?? "", "golden")
    : path.join(options.repoRoot, "corpus", "golden");
  if (!isInside(dir, value)) {
    throw new GoldenError(`${entry.id}: golden path escapes ${dir} (${value})`);
  }
  return path.join(dir, value);
}
