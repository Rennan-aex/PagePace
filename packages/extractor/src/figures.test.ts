// E10-T01b: figures out of `page.nonText` (layer 4, "semântica").
//
// The gates of the plan (`phases/E10-nontext.md` § "Plano — E10-T01b"): a
// region between 1% and 90% of the page area survives, neighbours within
// 1.2x the body size merge into one figure, the caption of E5-T05 is linked
// when it sits at most 3x the body size below the figure (its text lands in
// `placeholder.description`, Opção A — no schema bump), and the block is
// interleaved into the page's reading order: a spanning figure before the
// first paragraph below it, a figure of a column band inside that band.
// The caption paragraph itself stays a `caption` block (REQ-EXT-11: nothing
// of the flow disappears).
import type { BBox, RawDocument, RawNonTextRegion, RawPage, RawTextItem } from "@pagepace/schema";
import { parseBook } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { analyzeDocument, BOOK_BLOCK_CONFIDENCE, buildBook } from "./book";
import { detectFigures, type FigureDecision } from "./figures";

const BODY = 11;
const MARGIN = 72;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
/** 1% of the fixture page: a smaller region is decoration, not a figure. */
const MIN_AREA = PAGE_WIDTH * PAGE_HEIGHT * 0.01;

/** One item sitting on `baseline`, the way the ingestion delivers it. */
function item(
  text: string,
  x: number,
  baseline: number,
  size: number,
  extra: Partial<RawTextItem> = {},
): RawTextItem {
  return {
    text,
    x,
    y: baseline - size,
    width: text.length * size * 0.5,
    height: size,
    fontName: "Helvetica",
    fontSize: size,
    ...extra,
  };
}

function region(bbox: BBox): RawNonTextRegion {
  return { bbox, kind: "image" };
}

function page(items: RawTextItem[], nonText?: RawNonTextRegion[], index = 0): RawPage {
  return {
    index,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    rotation: 0,
    items,
    ...(nonText ? { nonText } : {}),
  };
}

function doc(pages: RawPage[]): RawDocument {
  return {
    schemaVersion: "1.2.0",
    source: {
      fileName: "book.pdf",
      sha256: "a".repeat(64),
      pageCount: pages.length,
      tagged: false,
    },
    pages,
    ingest: { adapter: "pdfjs", adapterVersion: "test" },
  };
}

/** The figures of a document, read the way `analyzeDocument` reads them. */
function figuresOf(raw: RawDocument): FigureDecision[] {
  const analysis = analyzeDocument(raw);
  return detectFigures({
    pages: analysis.stripped.document.pages,
    paragraphs: analysis.paragraphs,
    captions: analysis.captions,
    bodyFontSize: analysis.stats?.bodyFontSize ?? 0,
  });
}

/** A 120x90 box (2.2% of the page) at `y`, inside the left margin. */
const BOX = (y: number, x = 100): BBox => ({ x, y, width: 120, height: 90 });

const prose = page([
  item("Alpha beta gamma.", MARGIN, 100, BODY),
  item("More prose below the figure.", MARGIN, 400, BODY),
]);

describe("detectFigures: the region gates (E10-T01b)", () => {
  it("keeps a region between 1% and 90% of the page area", () => {
    const figures = figuresOf(doc([page(prose.items, [region(BOX(200))])]));
    expect(figures).toHaveLength(1);
    expect(figures[0]?.bbox).toEqual(BOX(200));
    expect(figures[0]?.page).toBe(0);
  });

  it("drops a region below 1% of the page area (decoration, not a figure)", () => {
    expect(MIN_AREA).toBeGreaterThan(400);
    const figures = figuresOf(
      doc([page(prose.items, [region({ x: 100, y: 200, width: 20, height: 20 })])]),
    );
    expect(figures).toEqual([]);
  });

  it("drops a region above 90% of the page area (the page itself)", () => {
    const figures = figuresOf(
      doc([page(prose.items, [region({ x: 0, y: 0, width: 600, height: 780 })])]),
    );
    expect(figures).toEqual([]);
  });

  it("merges neighbouring regions into one figure and keeps distant ones apart", () => {
    const figures = figuresOf(
      doc([
        page(prose.items, [
          region({ x: 100, y: 200, width: 60, height: 90 }),
          region({ x: 160, y: 200, width: 60, height: 90 }),
          region(BOX(500)),
        ]),
      ]),
    );
    expect(figures.map((figure) => figure.bbox)).toEqual([
      { x: 100, y: 200, width: 120, height: 90 },
      BOX(500),
    ]);
  });

  it("reads no figure on a page without art", () => {
    expect(figuresOf(doc([prose]))).toEqual([]);
  });
});

describe("detectFigures: the caption link (E10-T01b)", () => {
  const captioned = page(
    [
      item("Alpha beta gamma.", MARGIN, 100, BODY),
      item("Fig. 1 - A test figure", 100, 250, 9),
      item("More prose below the figure.", MARGIN, 400, BODY),
    ],
    [region(BOX(140))],
  );

  it("links the closest caption below the figure (gap <= 3x body)", () => {
    const figures = figuresOf(doc([captioned]));
    expect(figures).toHaveLength(1);
    expect(figures[0]?.caption).toBe("Fig. 1 - A test figure");
    expect(figures[0]?.insertBefore).toBe(1);
  });

  it("leaves the caption unlinked when it sits further than 3x body", () => {
    const far = page(
      [item("Alpha beta gamma.", MARGIN, 100, BODY), item("Fig. 1 - A test figure", 100, 400, 9)],
      [region(BOX(140))],
    );
    const figures = figuresOf(doc([far]));
    expect(figures[0]?.caption).toBeUndefined();
  });

  it("never links prose that merely follows the figure", () => {
    const figures = figuresOf(doc([prose]));
    // `prose` has no art at all; with art the gate is the printed label of
    // E5-T05 — a body paragraph below the figure is not a caption.
    const withArt = figuresOf(doc([page(prose.items, [region(BOX(200))])]));
    expect(figures).toEqual([]);
    expect(withArt[0]?.caption).toBeUndefined();
  });
});

describe("buildBook: figure blocks (E10-T01b)", () => {
  it("interleaves the figure before its caption and keeps the caption block", () => {
    const book = buildBook(
      doc([
        page(
          [
            item("Alpha beta gamma.", MARGIN, 100, BODY),
            item("Fig. 1 - A test figure", 100, 250, 9),
            item("More prose below the figure.", MARGIN, 400, BODY),
          ],
          [region(BOX(140))],
        ),
      ]),
    );
    expect(() => parseBook(book)).not.toThrow();
    expect(book.blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "figure",
      "caption",
      "paragraph",
    ]);
    const figure = book.blocks[1];
    expect(figure?.runs).toEqual([]);
    expect(figure?.origin).toEqual({
      pageFrom: 0,
      pageTo: 0,
      bbox: [BOX(140)],
    });
    expect(figure?.placeholder).toEqual({ description: "Fig. 1 - A test figure" });
    expect(figure?.flags).toEqual([]);
    expect(figure?.confidence).toBe(BOOK_BLOCK_CONFIDENCE);
    expect(figure?.id).toMatch(/^p0-b\d+-[0-9a-f]{8}$/);
    // REQ-EXT-11: the caption keeps reading as its own block — the figure
    // only carries a copy of the text in `placeholder.description`.
    expect(book.blocks[2]?.runs.map((run) => run.text)).toEqual(["Fig. 1 - A test figure"]);
  });

  it("appends the figure after the last paragraph when nothing sits below", () => {
    const book = buildBook(
      doc([
        page(
          [item("Alpha beta gamma.", MARGIN, 100, BODY), item("More prose.", MARGIN, 200, BODY)],
          [region(BOX(600))],
        ),
      ]),
    );
    expect(book.blocks.map((block) => block.kind)).toEqual(["paragraph", "paragraph", "figure"]);
    expect(book.blocks.at(-1)?.origin.bbox).toEqual([BOX(600)]);
    expect(book.blocks.at(-1)?.placeholder).toBeUndefined();
  });

  it("keeps a figure of the second column inside that column's flow (E6-T02)", () => {
    const COL1_X = 72;
    const COL2_X = 318;
    const COL_W = 222;
    const columnLine = (text: string, x: number, baseline: number): RawTextItem =>
      item(text, x, baseline, BODY, { width: COL_W });
    const book = buildBook(
      doc([
        page(
          [
            columnLine("Left alpha one.", COL1_X, 100),
            columnLine("Left alpha two.", COL1_X, 115),
            columnLine("Left beta one.", COL1_X, 140),
            columnLine("Left beta two.", COL1_X, 155),
            columnLine("Right gamma one.", COL2_X, 100),
            columnLine("Right gamma two.", COL2_X, 115),
            columnLine("Right delta one.", COL2_X, 250),
            columnLine("Right delta two.", COL2_X, 265),
          ],
          [region({ x: COL2_X, y: 140, width: 120, height: 90 })],
        ),
      ]),
    );
    const figureIndex = book.blocks.findIndex((block) => block.kind === "figure");
    expect(figureIndex).toBeGreaterThan(-1);
    // The figure sits in column 2, between the two right-hand paragraphs:
    // it must not cut the left column's flow.
    expect(book.blocks.map((block) => block.runs[0]?.text ?? "figure")).toEqual([
      "Left alpha one. Left alpha two.",
      "Left beta one. Left beta two.",
      "Right gamma one. Right gamma two.",
      "figure",
      "Right delta one. Right delta two.",
    ]);
    expect(book.blocks[figureIndex]?.origin.bbox).toEqual([
      { x: COL2_X, y: 140, width: 120, height: 90 },
    ]);
  });
});
