// E4-T03 acceptance: the table of contents of a real PDF, with and without
// bookmarks, every entry pointing at a `blockId` and the discrepancies
// reported as document warnings. The PDFs are written by `minipdf` (no
// corpus needed), so the path under test is the production one: ingestion,
// then `buildBook`.
import { buildBook, ingestPdfjs, TOC_OUTLINE_UNMATCHED } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

/** A chapter title over three lines of body text (body = 12, title = 24). */
function chapterPage(title: string): string {
  return [
    textStream(title, { x: 72, y: 700, size: 24 }),
    textStream("Body line of the chapter written in the book.", { x: 72, y: 660 }),
    textStream("A second body line to make the body the mode.", { x: 72, y: 645 }),
    textStream("A third body line of the same paragraph.", { x: 72, y: 630 }),
  ].join("\n");
}

const twoChapters = [chapterPage("Chapter One"), chapterPage("Chapter Two")];

describe("E4-T03 — table of contents from a PDF", () => {
  it("takes the table from the bookmarks of the PDF, level by level", async () => {
    const bytes = buildPdf(twoChapters, {
      outlines: [
        { title: "Chapter One", pageIndex: 0 },
        { title: "Chapter Two", pageIndex: 1 },
      ],
    });
    const document = await ingestPdfjs(bytes, { fileName: "with-bookmarks.pdf" });
    expect(document.outline).toHaveLength(2);

    const book = buildBook(document);
    expect(book.toc).toEqual([
      { title: "Chapter One", blockId: book.blocks[0]?.id, level: 1 },
      { title: "Chapter Two", blockId: book.blocks[2]?.id, level: 1 },
    ]);
    // Both bookmarks are top-level, so both headings become level 1 — the
    // reading-order fallback of ADR-055 (1, 2) does not apply here.
    expect(book.blocks.map((block) => block.level)).toEqual([1, undefined, 1, undefined]);
    expect(book.extraction.warnings).toEqual([]);
  });

  it("falls back to the detected headings when the PDF has no bookmarks", async () => {
    const bytes = buildPdf(twoChapters);
    const document = await ingestPdfjs(bytes, { fileName: "no-bookmarks.pdf" });
    expect(document.outline).toBeUndefined();

    const book = buildBook(document);
    expect(book.toc).toEqual([
      { title: "Chapter One", blockId: book.blocks[0]?.id, level: 1 },
      { title: "Chapter Two", blockId: book.blocks[2]?.id, level: 2 },
    ]);
    expect(book.extraction.warnings).toEqual([]);
  });

  it("warns when a bookmark does not answer to a detected heading", async () => {
    const bytes = buildPdf(twoChapters, {
      outlines: [
        {
          title: "Chapter Two",
          pageIndex: 1,
          children: [{ title: "Something Else", pageIndex: 0 }],
        },
      ],
    });
    const document = await ingestPdfjs(bytes, { fileName: "discrepant-bookmarks.pdf" });
    const book = buildBook(document);

    // The answerless entry still lands on the heading of its page and keeps
    // the bookmark's title, but it does not carry its level over: only a
    // bookmark that answers to the heading settles the heading's level.
    expect(book.toc).toEqual([
      { title: "Chapter Two", blockId: book.blocks[2]?.id, level: 1 },
      { title: "Something Else", blockId: book.blocks[0]?.id, level: 2 },
    ]);
    expect(book.blocks[2]?.level).toBe(1);
    expect(book.blocks[0]?.level).toBe(1);
    expect(book.extraction.warnings).toEqual([TOC_OUTLINE_UNMATCHED]);
  });
});
