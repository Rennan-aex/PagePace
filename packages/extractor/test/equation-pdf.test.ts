// E10-T03 — equation blocks end to end through pdf.js.
//
// The synthetic cases always run: a displayed equation set in a math face
// between two prose paragraphs must reach the Book as one `equation` block
// with empty `runs` and the lines of math in `placeholder.description`, and
// the surrounding prose must keep its own words — never the equation's. The
// contents page with dot leaders must stay prose (a leader is never math).
//
// The corpus cases need `$CORPUS_PRIVATE_DIR` (or `.env`) and are skipped
// when the files are absent; the arXiv paper lives in `corpus/public` and is
// the acceptance of the task: the displayed equations of `n2-en-arxiv-phobos`
// reach the Book as `equation` blocks while its running head and its prose
// sentences stay out of them, the private `n2`/`n4` documents claim their
// formulas by the dozen, and no sentence that trails off into running text
// (`requiring`, `Portanto`) is ever claimed.
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

/** Page 0: prose, a two-line display in a math face, prose. */
function equationPage(): string {
  const streams: string[] = [];
  [
    "The energy of the photon scales with the frequency of the wave",
    "and the relation below states it in the usual form of the text",
    "that introduces the display on the same measure of the page.",
  ].forEach((text, index) => {
    streams.push(textStream(text, { x: 90, y: 720 - index * 16, size: BODY }));
  });
  streams.push(textStream("E = mc2", { x: 180, y: 664, size: BODY, font: "F2" }));
  streams.push(textStream("p = mv", { x: 180, y: 650, size: BODY, font: "F2" }));
  [
    "After the display the paragraph continues with its own",
    "words of prose and not a single symbol of the formula.",
  ].forEach((text, index) => {
    streams.push(textStream(text, { x: 90, y: 620 - index * 16, size: BODY }));
  });
  return streams.join("\n");
}

/** Page 1: contents lines with dot leaders — never math, never a table. */
function tocPage(): string {
  const widthOf = (text: string): number => text.length * BODY * 0.5;
  const line = (baseline: number, title: string, page: string): string => {
    const dots = "......";
    const x2 = Math.round(90 + widthOf(title) + 60);
    const x3 = Math.round(x2 + widthOf(dots) + 60);
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

function fixturePdf(): Uint8Array {
  return buildPdf([equationPage(), tocPage()], {
    fonts: { F1: "Helvetica", F2: "CMMI10" },
  });
}

const blockText = (block: { runs: readonly { text: string }[] } | undefined): string =>
  (block?.runs ?? []).map((run) => run.text).join("");

const descriptionOf = (block: { placeholder?: { description?: string } } | undefined): string =>
  block?.placeholder?.description ?? "";

describe("equation blocks through pdf.js (synthetic)", () => {
  it("reads the displayed equation as one equation block with empty runs (E10-T03)", async () => {
    const book = buildBook(await ingestPdfjs(fixturePdf(), { fileName: "equation-block.pdf" }));

    const page = book.blocks.filter((block) => block.origin.pageFrom === 0);
    expect(page.map((block) => block.kind)).toEqual(["paragraph", "equation", "paragraph"]);
    const equation = page[1];
    expect(equation?.runs).toEqual([]);
    expect(descriptionOf(equation)).toContain("E = mc2");
    expect(descriptionOf(equation)).toContain("p = mv");
    // The prose keeps its words: the formula never leaks into a paragraph.
    expect(blockText(page[0])).not.toContain("mc2");
    expect(blockText(page[2])).not.toContain("mv");
    expect(new Set(book.blocks.map((block) => block.id)).size).toBe(book.blocks.length);
  });

  it("keeps contents lines with dot leaders as prose", async () => {
    const book = buildBook(await ingestPdfjs(fixturePdf(), { fileName: "equation-toc.pdf" }));

    const toc = book.blocks.filter((block) => block.origin.pageFrom === 1);
    expect(toc.some((block) => block.kind === "equation")).toBe(false);
    expect(toc.some((block) => blockText(block).includes("Chapter 1"))).toBe(true);
  });
});

describe("E10-T03 acceptance against the corpus (skipped without corpus)", () => {
  const phobos = path.join(repoRoot, "corpus", "public", "n2-en-arxiv-phobos.pdf");
  const n2Astro = path.join(privateCorpusDir(), "n2-en-astrofisica.pdf");
  const enAstro = path.join(privateCorpusDir(), "n4-en-astrofisica.pdf");
  const ptAstro = path.join(privateCorpusDir(), "n4-pt-astrofisica.pdf");

  it.skipIf(!existsSync(phobos))(
    "n2-en-arxiv-phobos: the displays reach the Book, the running head stays out",
    async () => {
      const bytes = new Uint8Array(readFileSync(phobos));
      const document = await ingestPdfjs(bytes, { fileName: "n2-en-arxiv-phobos.pdf" });
      const book = buildBook(document);
      const equations = book.blocks.filter((block) => block.kind === "equation");

      expect(equations.length).toBeGreaterThanOrEqual(10);
      for (const equation of equations) {
        expect(equation.runs).toEqual([]);
        expect(descriptionOf(equation)).not.toBe("");
        expect(descriptionOf(equation)).not.toContain("Article number");
      }
      // A prose sentence sprinkled with symbols stays a paragraph.
      const prose = book.blocks.find((block) =>
        blockText(block).includes("For a synchronous satellite"),
      );
      expect(prose?.kind).toBe("paragraph");
    },
    300_000,
  );

  it.skipIf(!existsSync(n2Astro))(
    "n2-en-astrofisica: pages 2–5 claim their numbered displays",
    async () => {
      const bytes = new Uint8Array(await readFile(n2Astro));
      const document = await ingestPdfjs(bytes, {
        fileName: "n2-en-astrofisica.pdf",
        pageRange: { from: 2, to: 5 },
      });
      const equations = buildBook(document).blocks.filter((block) => block.kind === "equation");

      expect(equations.length).toBeGreaterThanOrEqual(10);
      for (const equation of equations) expect(equation.runs).toEqual([]);
    },
    300_000,
  );

  it.skipIf(!existsSync(enAstro))(
    "n4-en-astrofisica: pages 4–9 claim the formulas, not the sentences around them",
    async () => {
      const bytes = new Uint8Array(await readFile(enAstro));
      const document = await ingestPdfjs(bytes, {
        fileName: "n4-en-astrofisica.pdf",
        pageRange: { from: 4, to: 9 },
      });
      const equations = buildBook(document).blocks.filter((block) => block.kind === "equation");

      expect(equations.length).toBeGreaterThanOrEqual(15);
      for (const equation of equations) {
        expect(equation.runs).toEqual([]);
        expect(descriptionOf(equation)).not.toMatch(/requiring|Portanto/i);
      }
    },
    300_000,
  );

  it.skipIf(!existsSync(ptAstro))(
    "n4-pt-astrofisica: pages 11–17 claim the worked-out steps",
    async () => {
      const bytes = new Uint8Array(await readFile(ptAstro));
      const document = await ingestPdfjs(bytes, {
        fileName: "n4-pt-astrofisica.pdf",
        pageRange: { from: 11, to: 17 },
      });
      const equations = buildBook(document).blocks.filter((block) => block.kind === "equation");

      expect(equations.length).toBeGreaterThanOrEqual(10);
      for (const equation of equations) expect(equation.runs).toEqual([]);
    },
    300_000,
  );
});
