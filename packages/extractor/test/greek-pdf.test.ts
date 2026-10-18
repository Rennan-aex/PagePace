import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBook, ingestPdfjs, itemsText } from "@pagepace/extractor";
import type { RawDocument } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

/**
 * E5-T08 — Greek excerpts, end to end.
 *
 * The synthetic case always runs in CI: pdf.js is fed a content stream
 * written in private bytes with a `/ToUnicode` CMap mapping them back to
 * polytonic Greek (the standard fonts answer WinAnsi, so without the map
 * Greek never leaves the PDF). The ingestion and the `Book` must deliver
 * every character of the quote — the acceptance of the task — and the run
 * must carry `lang: "grc"`.
 *
 * The corpus case needs `corpus/public` and is skipped when the file is
 * absent: `n2-en-arxiv-phobos` carries real Greek in a physics book (math
 * symbols aside), and the Greek code points of its items must reach the
 * blocks one for one.
 */

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/** Apology 38a (Plato, public domain): the unexamined life is not worth living. */
const GREEK_QUOTE = "ὁ δὲ ἀνεξέταστος βίος οὐ βιωτὸς ἀνθρώπῳ.";

const GREEK_SCRIPT = /\p{Script=Greek}/u;
const countGreek = (text: string): number =>
  [...text].filter((character) => GREEK_SCRIPT.test(character)).length;

/**
 * Encodes every non-ASCII character of `text` into a private byte (0x81
 * up) and records the reverse map a `/ToUnicode` CMap needs. ASCII passes
 * through untouched (WinAnsi already answers it).
 */
function encodeWithToUnicode(text: string): { bytes: string; map: Record<number, string> } {
  const map: Record<number, string> = {};
  const seen = new Map<string, number>();
  let next = 0x81;
  let bytes = "";
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x80) {
      bytes += character;
      continue;
    }
    let code = seen.get(character);
    if (code === undefined) {
      code = next;
      next += 1;
      seen.set(character, code);
      map[code] = character;
    }
    bytes += String.fromCharCode(code);
  }
  return { bytes, map };
}

const bookGreekText = (document: RawDocument): string =>
  document.pages
    .flatMap((page) => page.items)
    .map((item) => item.text)
    .join("");

describe("Greek quote through pdf.js (synthetic)", () => {
  it("delivers every character of the quote and tags the run grc (E5-T08 acceptance)", async () => {
    const { bytes, map } = encodeWithToUnicode(GREEK_QUOTE);
    const pdfBytes = buildPdf([textStream(bytes, { x: 72, y: 700, size: 12 })], {
      fonts: { F1: "Helvetica" },
      toUnicode: { F1: map },
    });

    const document = await ingestPdfjs(pdfBytes, { fileName: "greek-quote.pdf" });

    // The raw items already carry the quote character for character.
    const itemsTextOfBook = itemsText(document.pages[0]?.items ?? []);
    expect(itemsTextOfBook).toBe(GREEK_QUOTE);
    expect(countGreek(itemsTextOfBook)).toBe(countGreek(GREEK_QUOTE));

    const book = buildBook(document);
    const block = book.blocks[0];
    const text = block?.runs.map((run) => run.text).join("") ?? "";
    expect(text).toBe(GREEK_QUOTE);
    expect(text).not.toContain("�");
    expect(block?.runs).toEqual([{ text: GREEK_QUOTE, lang: "grc" }]);
  });

  it("keeps a Latin paragraph beside the quote untagged", async () => {
    const { bytes, map } = encodeWithToUnicode(GREEK_QUOTE);
    const pdfBytes = buildPdf(
      [
        [
          textStream("The examined life is worth living.", { x: 72, y: 720, size: 12 }),
          textStream(bytes, { x: 72, y: 700, size: 12 }),
        ].join("\n"),
      ],
      { fonts: { F1: "Helvetica" }, toUnicode: { F1: map } },
    );

    const document = await ingestPdfjs(pdfBytes, { fileName: "greek-and-latin.pdf" });
    const book = buildBook(document);

    const latin = book.blocks.find((block) =>
      block.runs.some((run) => run.text.includes("examined life")),
    );
    const greek = book.blocks.find((block) => block.runs.some((run) => run.lang === "grc"));
    expect(latin?.runs.every((run) => run.lang === undefined)).toBe(true);
    expect(greek?.runs.map((run) => run.text).join("")).toBe(GREEK_QUOTE);
  });
});

describe("E5-T08 acceptance against the public corpus (skipped without corpus/public)", () => {
  const phobos = path.join(repoRoot, "corpus", "public", "n2-en-arxiv-phobos.pdf");

  it.skipIf(!existsSync(phobos))(
    "n2-en-arxiv-phobos: every Greek code point of the items reaches the blocks",
    async () => {
      const bytes = new Uint8Array(readFileSync(phobos));
      const document = await ingestPdfjs(bytes, { fileName: "n2-en-arxiv-phobos.pdf" });

      const rawText = bookGreekText(document);
      const rawGreek = countGreek(rawText);
      expect(rawGreek).toBeGreaterThan(0);

      const book = buildBook(document);
      const bookText = book.blocks
        .flatMap((block) => block.runs)
        .map((run) => run.text)
        .join("");
      expect(countGreek(bookText)).toBe(rawGreek);
      expect(bookText).not.toContain("�");
    },
    120_000,
  );
});
