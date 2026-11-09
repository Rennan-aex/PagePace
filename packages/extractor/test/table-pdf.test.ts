// E10-T02 — table blocks end to end through pdf.js.
//
// The synthetic cases always run: a grid of three columns between two
// prose paragraphs must reach the Book as one `table` block with empty
// `runs` and the cells in `placeholder.description` as TSV, while the
// dot-leader contents lines and a two-row grid stay prose (a lone row is
// not a table). The prose lines are laid out as several overlapping
// chunks on purpose: one text object would be a single item and the
// column detector would read the page gutters as columns.
//
// The corpus cases need `$CORPUS_PRIVATE_DIR` (or `.env`) and are skipped
// when the files are absent — they are the acceptance of the task: the
// three simple tables of `n4-en-fisica` pages 6–8, the two of
// `n4-en-astrofisica` pages 16–18 and the headered table of
// `n4-pt-astrofisica` page 18 must reach the Book, and the arXiv paper
// (`corpus/public`) must keep zero false tables.
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBook, ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

function privateCorpusDir(): string {
  const fromEnv = process.env.CORPUS_PRIVATE_DIR?.trim();
  if (fromEnv) return fromEnv;
  const dotEnv = path.join(repoRoot, ".env");
  if (!existsSync(dotEnv)) return "";
  for (const line of readFileSync(dotEnv, "utf8").split(/\r?\n/)) {
    const match = /^CORPUS_PRIVATE_DIR\s*=\s*(.+)$/.exec(line.trim());
    if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const BODY = 12;
const CELL = 10;

/** Helvetica AFM widths (per 1000 units) for the ASCII the fixture sets. */
const AFM: Record<string, number> = {
  " ": 278,
  "!": 278,
  '"': 355,
  "#": 556,
  $: 556,
  "%": 889,
  "&": 667,
  "'": 191,
  "(": 333,
  ")": 333,
  "*": 389,
  "+": 584,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 278,
  "0": 556,
  "1": 556,
  "2": 556,
  "3": 556,
  "4": 556,
  "5": 556,
  "6": 556,
  "7": 556,
  "8": 556,
  "9": 556,
  ":": 278,
  ";": 278,
  "<": 584,
  "=": 584,
  ">": 584,
  "?": 556,
  "@": 1015,
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  "[": 278,
  "\\": 278,
  "]": 278,
  "^": 469,
  _: 556,
  "`": 333,
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
  "{": 334,
  "|": 260,
  "}": 334,
  "~": 584,
};

const widthOf = (text: string, size: number): number =>
  [...text].reduce((sum, char) => sum + (AFM[char] ?? 556), 0) * size * 0.001;

/** One prose line of several overlapping chunks — a multi-item line. */
function proseLine(baseline: number, chunks: readonly string[]): string[] {
  const streams: string[] = [];
  let x = 90;
  for (const text of chunks) {
    streams.push(textStream(text, { x: Math.round(x), y: baseline, size: BODY }));
    x += widthOf(text, BODY) - 8;
  }
  return streams;
}

const BEFORE = [
  [
    "The results of the study",
    "are shown in the table",
    "below this paragraph and",
    "the numbers stay clear.",
  ],
  [
    "Every row of the grid keeps",
    "its three columns aligned",
    "so the reader can compare",
    "the values at a glance.",
  ],
  [
    "Nothing else on the page",
    "is set apart from the rest",
    "of the running text and the",
    "labels stay in place.",
  ],
  [
    "A second paragraph above",
    "the grid gives the table",
    "some air before it starts",
    "and keeps prose around.",
  ],
];
const AFTER = [
  [
    "After the table the text",
    "continues normally with",
    "no wide gaps in the line",
    "and no cells to merge.",
  ],
  [
    "The closing paragraph is",
    "plain prose of the same",
    "measure and the same face",
    "as the opening one.",
  ],
  [
    "A last line seals the page",
    "without any column break",
    "that could trick the line",
    "detector into columns.",
  ],
];

/** Page 0: prose, a four-row grid, prose — the grid must read as one table. */
function acceptPage(): string {
  const streams: string[] = [];
  BEFORE.forEach((chunks, index) => {
    streams.push(...proseLine(720 - index * 16, chunks));
  });
  [
    ["Grade", "Girls", "Boys"],
    ["Elementary", "3", "2"],
    ["Middle", "1", "4"],
    ["High", "5", "6"],
  ].forEach((cells, index) => {
    const baseline = 630 - index * 14;
    cells.forEach((text, column) => {
      streams.push(textStream(text, { x: [90, 240, 390][column], y: baseline, size: CELL }));
    });
  });
  AFTER.forEach((chunks, index) => {
    streams.push(...proseLine(550 - index * 16, chunks));
  });
  return streams.join("\n");
}

/** Page 1: contents lines with dot leaders — wide gaps, never a table. */
function tocPage(): string {
  const line = (baseline: number, title: string, page: string): string => {
    const dots = "......";
    const x2 = Math.round(90 + widthOf(title, BODY) + 60);
    const x3 = Math.round(x2 + widthOf(dots, BODY) + 60);
    return [
      textStream(title, { x: 90, y: baseline, size: BODY }),
      textStream(dots, { x: x2, y: baseline, size: BODY }),
      textStream(page, { x: x3, y: baseline, size: BODY }),
    ].join("\n");
  };
  return [
    line(720, "Chapter 1 Introduction", "12"),
    line(704, "Chapter 2 Methods", "34"),
    line(688, "Chapter 3 Results", "57"),
  ].join("\n");
}

/** Page 2: prose plus a two-row grid — below `TABLE_MIN_LINES`, still prose. */
function twoRowPage(): string {
  const streams: string[] = [];
  BEFORE.slice(0, 3).forEach((chunks, index) => {
    streams.push(...proseLine(720 - index * 16, chunks));
  });
  [
    ["Grade", "Girls", "Boys"],
    ["Elementary", "3", "2"],
  ].forEach((cells, index) => {
    const baseline = 630 - index * 14;
    cells.forEach((text, column) => {
      streams.push(textStream(text, { x: [90, 240, 390][column], y: baseline, size: CELL }));
    });
  });
  return streams.join("\n");
}

function fixturePdf(): Uint8Array {
  return buildPdf([acceptPage(), tocPage(), twoRowPage()], { fonts: { F1: "Helvetica" } });
}

const blockText = (block: { runs: readonly { text: string }[] } | undefined): string =>
  (block?.runs ?? []).map((run) => run.text).join("");

describe("table blocks through pdf.js (synthetic)", () => {
  it("reads the grid between two paragraphs as one table block (E10-T02)", async () => {
    const book = buildBook(await ingestPdfjs(fixturePdf(), { fileName: "table-block.pdf" }));

    const page = book.blocks.filter((block) => block.origin.pageFrom === 0);
    expect(page.map((block) => block.kind)).toEqual(["paragraph", "table", "paragraph"]);
    expect(blockText(page[0])).toContain("The results");
    const table = page[1];
    expect(table?.runs).toEqual([]);
    expect(table?.placeholder?.description).toBe(
      "Grade\tGirls\tBoys\nElementary\t3\t2\nMiddle\t1\t4\nHigh\t5\t6",
    );
    expect(blockText(page[2])).toContain("After the table");
    // One id per block, never a duplicate (REQ-EXT-01).
    expect(new Set(book.blocks.map((block) => block.id)).size).toBe(book.blocks.length);
  });

  it("keeps dot-leader contents lines as prose", async () => {
    const book = buildBook(await ingestPdfjs(fixturePdf(), { fileName: "table-toc.pdf" }));

    const toc = book.blocks.filter((block) => block.origin.pageFrom === 1);
    expect(toc.some((block) => block.kind === "table")).toBe(false);
    expect(toc.some((block) => blockText(block).includes("Chapter 1"))).toBe(true);
  });

  it("keeps a two-row grid as prose — a lone row is not a table", async () => {
    const book = buildBook(await ingestPdfjs(fixturePdf(), { fileName: "table-two-rows.pdf" }));

    const page = book.blocks.filter((block) => block.origin.pageFrom === 2);
    expect(page.some((block) => block.kind === "table")).toBe(false);
    expect(page.some((block) => blockText(block).includes("Elementary"))).toBe(true);
  });
});

describe("E10-T02 acceptance against the corpus (skipped without $CORPUS_PRIVATE_DIR)", () => {
  const fisica = path.join(privateCorpusDir(), "n4-en-fisica.pdf");
  const enAstro = path.join(privateCorpusDir(), "n4-en-astrofisica.pdf");
  const ptAstro = path.join(privateCorpusDir(), "n4-pt-astrofisica.pdf");

  it.skipIf(!existsSync(fisica))(
    "n4-en-fisica: the three simple tables of pages 6–8 reach the Book",
    async () => {
      const bytes = new Uint8Array(await readFile(fisica));
      const document = await ingestPdfjs(bytes, {
        fileName: "n4-en-fisica.pdf",
        pageRange: { from: 6, to: 8 },
      });
      const tables = buildBook(document).blocks.filter((block) => block.kind === "table");

      expect(tables).toHaveLength(3);
      for (const table of tables) {
        expect(table.runs).toEqual([]);
        expect(table.placeholder?.description).toContain("\t");
        expect(table.placeholder?.description).toContain("\n");
      }
    },
    300_000,
  );

  it.skipIf(!existsSync(enAstro))(
    "n4-en-astrofisica: the two simple tables of pages 16–18 reach the Book",
    async () => {
      const bytes = new Uint8Array(await readFile(enAstro));
      const document = await ingestPdfjs(bytes, {
        fileName: "n4-en-astrofisica.pdf",
        pageRange: { from: 16, to: 18 },
      });
      const tables = buildBook(document).blocks.filter((block) => block.kind === "table");

      expect(tables).toHaveLength(2);
      for (const table of tables) expect(table.runs).toEqual([]);
    },
    300_000,
  );

  it.skipIf(!existsSync(ptAstro))(
    "n4-pt-astrofisica: the headered table of page 18 carries its cells as TSV",
    async () => {
      const bytes = new Uint8Array(await readFile(ptAstro));
      const document = await ingestPdfjs(bytes, {
        fileName: "n4-pt-astrofisica.pdf",
        pageRange: { from: 18, to: 18 },
      });
      const tables = buildBook(document).blocks.filter((block) => block.kind === "table");

      expect(tables).toHaveLength(1);
      expect(tables[0]?.runs).toEqual([]);
      const tsv = tables[0]?.placeholder?.description ?? "";
      expect(tsv).toContain("Tef");
      expect(tsv).toContain("\t");
    },
    300_000,
  );
});

describe("no false tables on the public corpus (skipped without corpus/public)", () => {
  const phobos = path.join(repoRoot, "corpus", "public", "n2-en-arxiv-phobos.pdf");

  it.skipIf(!existsSync(phobos))(
    "n2-en-arxiv-phobos: the arXiv paper keeps zero table blocks",
    async () => {
      const bytes = new Uint8Array(readFileSync(phobos));
      const document = await ingestPdfjs(bytes, { fileName: "n2-en-arxiv-phobos.pdf" });
      const tables = buildBook(document).blocks.filter((block) => block.kind === "table");

      expect(tables).toHaveLength(0);
    },
    300_000,
  );
});
