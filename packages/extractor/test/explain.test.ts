// E7-T05 — `explainPage`: the per-layer report of one page.
//
// The suite builds two small PDFs with the minipdf writer: a rich one-page
// document (a heading, a body paragraph with a line-end hyphen and a
// superscript call linked to a footnote) and a two-page document whose
// paragraph runs out of room at the foot of page 1. The checks are that the
// explanation (a) never disagrees with the real `Book`, (b) reports the
// layers that actually decided, and (c) is deterministic; the page-number
// guard is checked first: out-of-range pages raise `ExplainPageError`.
import { buildBook, ExplainPageError, explainPage, ingestPdfjs } from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

const BODY = 11;
const TITLE = 20;
const NOTE = 9;

function richBytes(): Uint8Array {
  const page = [
    textStream("Chapter One", { x: 72, y: 730, size: TITLE }),
    textStream("The typesetter breaks a very long word at the end", { x: 72, y: 690, size: BODY }),
    textStream("of the line, like hy-", { x: 72, y: 675, size: BODY }),
    textStream("phenated words must join back into one.", { x: 72, y: 660, size: BODY }),
    textStream("A companion line of body text keeps the paragraph flowing.", {
      x: 72,
      y: 645,
      size: BODY,
    }),
    // The call: a small raised item after the line's own text (the rise is
    // what `Run.sup` reads back, E5-T02) — same line, right of the period.
    textStream("The call points at a note.", { x: 72, y: 630, size: BODY }),
    textStream("1", { x: 220, y: 633, size: 7 }),
    textStream("1. A footnote that the layout marks at the foot.", { x: 72, y: 100, size: NOTE }),
  ].join("\n");
  return buildPdf([page], { fonts: { F1: "Helvetica" } });
}

function spanningBytes(): Uint8Array {
  return buildPdf(
    [
      textStream("The paragraph then runs out of room and keeps going", {
        x: 72,
        y: 690,
        size: BODY,
      }),
      textStream("on the next page of the book.", { x: 72, y: 700, size: BODY }),
    ],
    { fonts: { F1: "Helvetica" } },
  );
}

async function richDocument() {
  return ingestPdfjs(richBytes(), { fileName: "explain-rich.pdf" });
}

async function spanningDocument() {
  return ingestPdfjs(spanningBytes(), { fileName: "explain-span.pdf" });
}

describe("explainPage", () => {
  it("rejects a page number outside the document", async () => {
    const document = await richDocument();

    expect(() => explainPage(document, 0)).toThrow(ExplainPageError);
    expect(() => explainPage(document, 2)).toThrow(/página 2 inexistente/);
    expect(() => explainPage(document, 1.5)).toThrow(ExplainPageError);
  });

  it("never disagrees with the Book it explains", async () => {
    for (const document of [await richDocument(), await spanningDocument()]) {
      const book = buildBook(document);
      for (let page = 1; page <= document.pages.length; page++) {
        const explanation = explainPage(document, page);
        const blocks = book.blocks.filter(
          (block) => block.origin.pageFrom < page && block.origin.pageTo >= page - 1,
        );
        // The explanation skips empty paragraphs exactly like the builder, so
        // the two lists line up one to one.
        expect(explanation.paragraphs).toHaveLength(blocks.length);
        for (const [index, paragraph] of explanation.paragraphs.entries()) {
          const block = blocks[index];
          expect(block).toBeDefined();
          expect(paragraph.kind).toBe(block?.kind);
          expect(paragraph.level).toBe(block?.level);
          expect(paragraph.flags).toEqual(block?.flags);
          expect(paragraph.confidence).toBe(block?.confidence);
          expect(paragraph.text).toBe(block?.runs.map((run) => run.text).join(""));
        }
      }
    }
  });

  it("reports the layers that decided on the rich page", async () => {
    const explanation = explainPage(await richDocument(), 1);

    expect(explanation.page).toBe(1);
    expect(explanation.pageCount).toBe(1);
    expect(explanation.columns).toBe(1);
    expect(explanation.bodyFontSize).toBeGreaterThan(0);

    const heading = explanation.paragraphs.find((paragraph) => paragraph.kind === "heading");
    expect(heading?.text).toBe("Chapter One");
    expect(heading?.level).toBe(1);
    expect(heading?.layers.find((layer) => layer.layer === "heading")?.decision).toMatch(/^sim/);

    const body = explanation.paragraphs.find((paragraph) => paragraph.text.includes("hyphenated"));
    expect(body).toBeDefined();
    expect(body?.kind).toBe("paragraph");
    expect(body?.hyphenSites).toHaveLength(1);
    expect(body?.hyphenSites[0]).toMatchObject({ left: "hy", right: "phenated", decision: "join" });
    expect(body?.text).toContain("hyphenated");
    expect(body?.rawText).toContain("hy-");
    expect(body?.layers.find((layer) => layer.layer === "hyphen")?.decision).toContain("→");
    expect(body?.layers.find((layer) => layer.layer === "note-link")?.decision).toContain(
      "chamada(s) ligada(s)",
    );

    const footnote = explanation.paragraphs.find((paragraph) => paragraph.kind === "footnote");
    expect(footnote?.text).toContain("footnote");
    expect(footnote?.flags).toEqual([]);
    expect(footnote?.layers.find((layer) => layer.layer === "footnote")?.decision).toMatch(/^sim/);
    expect(footnote?.layers.find((layer) => layer.layer === "note-link")?.decision).toContain(
      "chamada",
    );
  });

  it("reports the cross-page paragraph on both pages", async () => {
    const document = await spanningDocument();

    const onPageOne = explainPage(document, 1).paragraphs;
    expect(onPageOne).toHaveLength(1);
    expect(onPageOne[0]?.pages).toEqual([1, 2]);
    expect(onPageOne[0]?.layers.find((layer) => layer.layer === "cross-page")?.decision).toMatch(
      /^sim/,
    );

    const onPageTwo = explainPage(document, 2).paragraphs;
    expect(onPageTwo).toHaveLength(1);
    expect(onPageTwo[0]?.pages).toEqual([1, 2]);
    expect(onPageTwo[0]?.text).toContain("on the next page");
  });

  it("is deterministic: the same page always explains the same", async () => {
    const document = await richDocument();

    expect(JSON.stringify(explainPage(document, 1))).toBe(JSON.stringify(explainPage(document, 1)));
  });
});
