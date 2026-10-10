// Synthetic corpus documents (E1-T07, ADR-013): one versioned specification
// produces BOTH the PDF and its `*.golden.json`, so the ground truth is the
// specification itself and the two cannot drift apart silently.
//
// Determinism (AGENTS.md rule 7): the same spec always yields the same bytes
// — `buildPdf` writes no date, no file id and no random data, and the layout
// engine walks the blocks strictly in spec order.
//
// Layout is deliberately dumb: line breaks are written in the spec (a "\n"
// inside a run), so no font width table is needed and the golden text equals
// the spec text by construction. `buildSynthetic` refuses a spec that does
// not fit the page instead of silently overflowing it.

import { sha256Hex } from "@pagepace/extractor";
import type { BlockKind } from "@pagepace/schema";
import { buildPdf, type LineRun, lineStream } from "../../extractor/test/minipdf";
import { GOLDEN_FORMAT_VERSION, type Golden, serializeGolden } from "./golden";

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
/** Outer margin of every synthetic page, in points. */
export const MARGIN = 72;
/** Space between the columns of a two-column page. */
export const COLUMN_GUTTER = 24;
/** Body font size (pt) of a block without an explicit `size`. */
export const FONT_SIZE = 11;
/** Baseline to baseline distance (pt). */
export const LEADING = 15;
/** Extra gap added after each block (visual only, never part of the text). */
export const BLOCK_GAP = 10;

/** Resource name → standard-14 `BaseFont`, non-embedded (ADR-020). */
export const SYNTHETIC_FONTS: Record<string, string> = {
  F1: "Helvetica",
  F2: "Helvetica-Bold",
  F3: "Helvetica-Oblique",
};
const STYLE_FONT = { bold: "F2", italic: "F3" } as const;

export interface SyntheticRunSpec {
  text: string;
  /** `undefined` = regular. Bold and italic map to real PDF fonts. */
  style?: "bold" | "italic";
}

export interface SyntheticBlockSpec {
  kind: BlockKind;
  /** Required for `kind: "heading"` (1..6). */
  level?: number;
  /** 1-based page the block starts on. Blocks must be listed in order. */
  page: number;
  /** Column of a two-column page (1-based, default 1). */
  column?: 1 | 2;
  /** `bottom` pins the block to the foot of the page (footnotes). */
  position?: "flow" | "bottom";
  /** Left inset of the block inside its column (quotes, list items). */
  indent?: number;
  /** Font size of the block (footnotes use a smaller one). */
  size?: number;
  /**
   * A repeated region (E3-T02): printed in the PDF, never in the golden.
   * `header` opens its page (and cannot be a bottom block); `footer` needs
   * `position: "bottom"`.
   */
  region?: "header" | "footer";
  runs: SyntheticRunSpec[];
}

export interface SyntheticSpec {
  id: string;
  level: "N1" | "N2" | "N3" | "N4" | "N5";
  lang: "pt" | "en";
  title: string;
  /** Feature tags copied into `corpus/manifest.yaml`. */
  features: string[];
  /** Total number of pages. */
  pages: number;
  /** Lay the page out as two columns (blocks choose their own `column`). */
  twoColumn?: boolean;
  /** Pages annotated in the golden; omitted = the whole document. */
  coverage?: number[];
  blocks: SyntheticBlockSpec[];
}

export class SyntheticSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyntheticSpecError";
  }
}

export interface SyntheticArtifact {
  pdf: Uint8Array;
  golden: Golden;
  /** Canonical text of `<id>.golden.json`, trailing newline included. */
  goldenJson: string;
  sha256: string;
}

function fail(spec: SyntheticSpec, message: string): never {
  throw new SyntheticSpecError(`${spec.id}: ${message}`);
}

/** Column geometry of a page (`x`, `width`). */
function columnsOf(spec: SyntheticSpec): { x: number; width: number }[] {
  if (!spec.twoColumn) return [{ x: MARGIN, width: PAGE_WIDTH - 2 * MARGIN }];
  const width = (PAGE_WIDTH - 2 * MARGIN - COLUMN_GUTTER) / 2;
  return [
    { x: MARGIN, width },
    { x: MARGIN + width + COLUMN_GUTTER, width },
  ];
}

/** Splits the runs of a block into visual lines of styled segments. */
function toLines(runs: readonly SyntheticRunSpec[]): LineRun[][] {
  const lines: LineRun[][] = [[]];
  for (const run of runs) {
    const font = run.style ? STYLE_FONT[run.style] : "F1";
    const pieces = run.text.split("\n");
    pieces.forEach((piece, index) => {
      if (index > 0) lines.push([]);
      if (piece !== "") (lines[lines.length - 1] as LineRun[]).push({ text: piece, font });
    });
  }
  return lines;
}

/**
 * Places every block of the spec on the page and returns one content stream
 * per page. Throws `SyntheticSpecError` when the spec does not fit, when a
 * block sits on an impossible page/column or when blocks are out of reading
 * order — a broken spec must fail loudly, never produce a wrong golden.
 */
export function layoutSynthetic(spec: SyntheticSpec): string[] {
  if (!Number.isInteger(spec.pages) || spec.pages < 1) {
    fail(spec, `pages must be a positive integer (got ${String(spec.pages)})`);
  }
  const columns = columnsOf(spec);
  const streams: string[] = Array.from({ length: spec.pages }, () => "");
  const cursors = new Map<string, number>();
  const bottomUsed = new Set<string>();
  const pagesWithBlocks = new Set<number>();
  let previousPage = 0;

  const cursorAt = (page: number, column: number): number => {
    const key = `${page}:${column}`;
    let cursor = cursors.get(key);
    if (cursor === undefined) {
      cursor = PAGE_HEIGHT - MARGIN - FONT_SIZE;
      cursors.set(key, cursor);
    }
    return cursor;
  };

  for (const [index, block] of spec.blocks.entries()) {
    const where = `blocks[${index}]`;
    if (!Number.isInteger(block.page) || block.page < 1 || block.page > spec.pages) {
      fail(spec, `${where}.page must be between 1 and ${spec.pages} (got ${String(block.page)})`);
    }
    if (block.page < previousPage) {
      fail(
        spec,
        `${where} is on page ${block.page} but page ${previousPage} was already written ` +
          "(blocks must be listed in reading order)",
      );
    }
    previousPage = block.page;

    const columnIndex = (block.column ?? 1) - 1;
    if (columnIndex < 0 || columnIndex >= columns.length) {
      fail(
        spec,
        `${where}.column must be 1..${columns.length} (this page has ` +
          `${columns.length} column${columns.length === 1 ? "" : "s"})`,
      );
    }

    if (block.kind === "heading") {
      const level = block.level;
      if (level === undefined || !Number.isInteger(level) || level < 1 || level > 6) {
        fail(spec, `${where}: heading blocks need a level 1..6`);
      }
    }
    if (block.runs.length === 0) fail(spec, `${where} has no runs`);
    for (const [runIndex, run] of block.runs.entries()) {
      if (run.text === "") fail(spec, `${where}.runs[${runIndex}] has an empty text`);
    }

    const size = block.size ?? FONT_SIZE;
    if (!Number.isInteger(size) || size < 6 || size > 72) {
      fail(spec, `${where}.size must be an integer between 6 and 72 (got ${String(size)})`);
    }
    const lines = toLines(block.runs);
    const key = `${block.page}:${columnIndex}`;
    const column = columns[columnIndex] as { x: number; width: number };
    const inset = block.indent ?? 0;
    if (inset < 0 || inset >= column.width) {
      fail(spec, `${where}.indent must be inside the column`);
    }

    if (block.region !== undefined) {
      if (block.region !== "header" && block.region !== "footer") {
        fail(spec, `${where}.region must be "header" or "footer"`);
      }
      if (block.region === "header") {
        if (block.position === "bottom") {
          fail(spec, `${where}: a header cannot also be a bottom block`);
        }
        if (cursors.has(key)) {
          fail(
            spec,
            `${where} is a header of page ${block.page} after another block of that page ` +
              "(headers open their page)",
          );
        }
      }
      if (block.region === "footer" && block.position !== "bottom") {
        fail(spec, `${where}: a footer needs position "bottom"`);
      }
    }

    let start: number;
    if (block.position === "bottom") {
      if (bottomUsed.has(key)) {
        fail(spec, `page ${block.page} already has a bottom block in column ${columnIndex + 1}`);
      }
      bottomUsed.add(key);
      const count = Math.max(lines.length, 1);
      start = MARGIN + size + (count - 1) * LEADING;
    } else {
      if (bottomUsed.has(key)) {
        fail(
          spec,
          `${where} flows after the bottom block of page ${block.page} ` +
            "(bottom blocks must close their page)",
        );
      }
      start = cursorAt(block.page, columnIndex);
      const lastBaseline = start - (lines.length - 1) * LEADING;
      if (lastBaseline < MARGIN + size) {
        fail(
          spec,
          `${where} does not fit on page ${block.page} column ${columnIndex + 1} ` +
            `(${lines.length} line(s), last baseline ${Math.round(lastBaseline)}pt)`,
        );
      }
      cursors.set(key, start - lines.length * LEADING - BLOCK_GAP);
    }

    pagesWithBlocks.add(block.page);
    const parts: string[] = [];
    lines.forEach((line, lineIndex) => {
      if (line.length === 0) return;
      parts.push(
        lineStream(line, {
          x: column.x + inset,
          y: start - lineIndex * LEADING,
          size,
        }),
      );
    });
    streams[block.page - 1] = `${streams[block.page - 1]}${parts.join("\n")}`;
  }

  for (let page = 1; page <= spec.pages; page++) {
    if (!pagesWithBlocks.has(page)) fail(spec, `page ${page} has no blocks`);
  }
  return streams.map((stream) => stream.trim());
}

/** The golden of a spec: the same blocks, cropped to `coverage` when set. */
export function goldenOf(spec: SyntheticSpec): Golden {
  const coverage = spec.coverage ?? null;
  if (coverage !== null) {
    if (coverage.length === 0) fail(spec, "coverage must hold at least one page");
    for (const page of coverage) {
      if (!Number.isInteger(page) || page < 1 || page > spec.pages) {
        fail(spec, `coverage page ${String(page)} is outside 1..${spec.pages}`);
      }
    }
  }
  const blocks = spec.blocks
    // Repeated regions (E3-T02) are printed but never reading content: the
    // golden holds the flow the reader keeps.
    .filter((block) => block.region === undefined)
    .filter((block) => coverage === null || coverage.includes(block.page))
    .map((block) => ({
      kind: block.kind,
      ...(block.level !== undefined ? { level: block.level } : {}),
      runs: block.runs.map((run) => ({
        text: run.text,
        ...(run.style === "bold" ? { bold: true } : {}),
        ...(run.style === "italic" ? { italic: true } : {}),
      })),
      origin: { pageFrom: block.page, pageTo: block.page },
    }));
  if (blocks.length === 0) {
    fail(spec, "no block falls inside coverage.pages (the golden would be empty)");
  }
  return {
    id: spec.id,
    schemaVersion: GOLDEN_FORMAT_VERSION,
    source: "synthetic",
    coverage,
    blocks,
  };
}

/** Builds the PDF and the golden of one specification. */
export function buildSynthetic(spec: SyntheticSpec): SyntheticArtifact {
  const streams = layoutSynthetic(spec);
  const pdf = buildPdf(streams, {
    fonts: SYNTHETIC_FONTS,
    mediaBox: [0, 0, PAGE_WIDTH, PAGE_HEIGHT],
  });
  const golden = goldenOf(spec);
  const sha256 = sha256Hex(pdf);
  return { pdf, golden, goldenJson: serializeGolden(golden), sha256 };
}
