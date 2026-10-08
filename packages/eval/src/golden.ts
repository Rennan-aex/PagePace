// Golden (ground truth) files: format, validation and path resolution
// (E1-T06 created the validator, E1-T07 closed the format — ADR-036). The
// shape follows the `write-golden-test` skill:
//
//   corpus/golden/<id>.golden.json                    (public documents)
//   $CORPUS_PRIVATE_DIR/golden/<id>.golden.json       (private documents)
//
// Validation lives here, in `@pagepace/eval` (ADR-035), because the golden
// format is versioned on its own (`GOLDEN_FORMAT_VERSION`), not by
// `@pagepace/schema`.

import path from "node:path";
import { BLOCK_KINDS, type BlockKind } from "@pagepace/schema";
import type { CorpusEntry } from "./corpus";

export class GoldenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoldenError";
  }
}

/**
 * Version of the golden file format itself. `schemaVersion` in a golden is
 * this value; a golden declaring another major version is rejected (minors
 * and patches are forward compatible — unknown fields are always rejected).
 */
export const GOLDEN_FORMAT_VERSION = "1.0.0";

export interface GoldenRun {
  text: string;
  /** Mirrors `Run.bold` of `@pagepace/schema` (ground truth for `style_f1`). */
  bold?: boolean;
  /** Mirrors `Run.italic` of `@pagepace/schema` (ground truth for `style_f1`). */
  italic?: boolean;
}

export interface GoldenOrigin {
  pageFrom: number;
  pageTo: number;
}

export interface GoldenBlock {
  /** Same closed list as `Book.blocks` (`BLOCK_KINDS`). */
  kind: BlockKind;
  /** Required for `kind: "heading"` (1..6), exactly like `Book.blocks`. */
  level?: number;
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

/** Block kinds of the golden: the schema's `BLOCK_KINDS`, re-exported. */
export const GOLDEN_KINDS: readonly string[] = BLOCK_KINDS;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const FORMAT_MAJOR = GOLDEN_FORMAT_VERSION.split(".")[0];
const TOP_LEVEL_KEYS = new Set(["id", "schemaVersion", "source", "coverage", "blocks"]);
const BLOCK_KEYS = new Set(["kind", "level", "runs", "origin"]);
const RUN_KEYS = new Set(["text", "bold", "italic"]);

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
  if (pages.length === 0) fail(source, `${where} must hold at least one page`);
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
  if (!VERSION_PATTERN.test(schemaVersion) || schemaVersion.split(".")[0] !== FORMAT_MAJOR) {
    fail(
      source,
      `schemaVersion must be ${FORMAT_MAJOR}.x.x (golden format ${GOLDEN_FORMAT_VERSION}), ` +
        `got "${schemaVersion}"`,
    );
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
  if (root.blocks.length === 0) fail(source, "blocks must hold at least one block");
  const blocks: GoldenBlock[] = root.blocks.map((rawBlock, index) => {
    const where = `blocks[${index}]`;
    const block = expectObject(rawBlock, source, where);
    const blockKeys = Object.keys(block).filter((key) => !BLOCK_KEYS.has(key));
    if (blockKeys.length > 0) fail(source, `${where}: unknown field(s): ${blockKeys.join(", ")}`);

    const kind = expectString(block.kind, source, `${where}.kind`) as BlockKind;
    if (!BLOCK_KINDS.includes(kind)) {
      fail(source, `${where}.kind must be one of ${BLOCK_KINDS.join(", ")} (got "${kind}")`);
    }

    let level: number | undefined;
    if (block.level !== undefined && block.level !== null) {
      const value = block.level;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 6) {
        fail(source, `${where}.level must be an integer 1..6`);
      }
      level = value;
    }
    if (kind === "heading" && level === undefined) {
      fail(source, `${where}: heading blocks need "level" (1..6)`);
    }

    if (!Array.isArray(block.runs)) fail(source, `${where}.runs must be an array`);
    const runs: GoldenRun[] = block.runs.map((rawRun, runIndex) => {
      const runWhere = `${where}.runs[${runIndex}]`;
      const run = expectObject(rawRun, source, runWhere);
      const runKeys = Object.keys(run).filter((key) => !RUN_KEYS.has(key));
      if (runKeys.length > 0) fail(source, `${runWhere}: unknown field(s): ${runKeys.join(", ")}`);
      const parsed: GoldenRun = { text: expectString(run.text, source, `${runWhere}.text`) };
      for (const flag of ["bold", "italic"] as const) {
        const value = run[flag];
        if (value === undefined) continue;
        if (typeof value !== "boolean") fail(source, `${runWhere}.${flag} must be a boolean`);
        parsed[flag] = value;
      }
      return parsed;
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

    return { kind, ...(level !== undefined ? { level } : {}), runs, origin };
  });

  // A partial golden measures only `coverage.pages` (the runner crops the
  // extraction to them), so every annotated block must point at a page that
  // is actually there — otherwise the comparison is against text that was
  // cropped away and the error is guaranteed.
  if (coverage !== null) {
    const allowed = new Set(coverage);
    blocks.forEach((block, index) => {
      const where = `blocks[${index}]`;
      if (block.origin === null) {
        fail(source, `${where}: origin is required when the golden declares coverage.pages`);
      }
      for (let page = block.origin.pageFrom; page <= block.origin.pageTo; page++) {
        if (!allowed.has(page)) {
          fail(
            source,
            `${where}.origin covers page ${page}, which is outside coverage.pages ` +
              `[${coverage.join(", ")}]`,
          );
        }
      }
    });
  }

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

/**
 * Visual lines the golden declares for each 1-based page, or `null` when the
 * golden cannot answer a line-count question (E2-T02, ADR-039).
 *
 * A run carries the layout line breaks (`\n`) only when its author annotated
 * them — the synthetic generator always does (ADR-013), hand-annotated
 * goldens may not. So: no run breaking the line anywhere = the golden does
 * not record the layout, and a block without `origin`, or spanning more than
 * one page, cannot be attributed to a page. A block counts as
 * `1 + line breaks` (a block with no break is a one-line block); runs never
 * start or end with a break.
 */
export function goldenLinesPerPage(golden: Golden): Map<number, number> | null {
  const perPage = new Map<number, number>();
  let recordsLayout = false;
  for (const block of golden.blocks) {
    let lines = 1;
    for (const run of block.runs) {
      const breaks = run.text.split("\n").length - 1;
      if (breaks > 0) recordsLayout = true;
      lines += breaks;
    }
    if (block.origin === null || block.origin.pageFrom !== block.origin.pageTo) return null;
    const page = block.origin.pageFrom;
    perPage.set(page, (perPage.get(page) ?? 0) + lines);
  }
  return recordsLayout ? perPage : null;
}

/**
 * Canonical serialisation of a golden: 2-space indent, LF, trailing newline
 * and `coverage` omitted (not `null`) when the golden covers the whole
 * document — `parseGolden(serializeGolden(g)) === g`.
 */
export function serializeGolden(golden: Golden): string {
  const document = {
    id: golden.id,
    schemaVersion: golden.schemaVersion,
    source: golden.source,
    ...(golden.coverage !== null ? { coverage: { pages: golden.coverage } } : {}),
    blocks: golden.blocks.map((block) => ({
      kind: block.kind,
      ...(block.level !== undefined ? { level: block.level } : {}),
      runs: block.runs.map((run) => ({
        text: run.text,
        ...(run.bold !== undefined ? { bold: run.bold } : {}),
        ...(run.italic !== undefined ? { italic: run.italic } : {}),
      })),
      origin: block.origin,
    })),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
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
