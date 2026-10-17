// E5-T05: lists (layer 4, "semântica"). Every signal of `detectLists` gets a
// case here — the printed marker (`*`, `1.`, `2)`, `(a)`) and the shallow
// indent below the block-quote gate — plus the guards that keep body text
// out (a first-line only indent is a paragraph, the quote's deeper recuo
// belongs to E5-T04). The buildBook round trip checks kind, flag and
// confidence, and the priority of a marked item over a quote.
import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildBook } from "./book";
import { pageMeasureOf } from "./headings";
import { detectLists, LIST_MARKER, LIST_UNCERTAIN_CONFIDENCE, UNCERTAIN_LIST_FLAG } from "./lists";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import { documentStats } from "./stats";

const BODY = 11;
const LEADING = 15;
const MARGIN = 72;

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

/** A block of lines at `x`, the first on `baseline`, `leading` apart. */
function lines(
  texts: readonly string[],
  baseline: number,
  options: { x?: number; size?: number; leading?: number } = {},
): RawTextItem[] {
  const x = options.x ?? MARGIN;
  const size = options.size ?? BODY;
  const leading = options.leading ?? LEADING;
  return texts.map((text, index) => item(text, x, baseline + index * leading, size));
}

/** A body paragraph of three long lines (keeps the median leading at 15). */
const bodyAt = (baseline: number): RawTextItem[] =>
  lines(
    [
      "01234567890123456789012345678901234567890123456789",
      "01234567890123456789012345678901234567890123456789",
      "01234567890123456789012345678901234567890123456789",
    ],
    baseline,
  );

function page(items: RawTextItem[], index = 0): RawPage {
  return { index, width: 612, height: 792, rotation: 0, items };
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

/** Paragraphs and the context `detectLists` needs, measured once. */
function layoutOf(pages: RawPage[]) {
  const document = doc(pages);
  const stats = documentStats(document);
  const grouped = groupDocumentParagraphs(document);
  const paragraphs = joinCrossPageParagraphs(grouped, stats.bodyFontSize);
  return {
    document,
    paragraphs,
    context: { measures: grouped.map((pageLines) => pageMeasureOf(pageLines.flat())) },
  };
}

/** The decisions `detectLists` would make for these pages. */
function decisionsOf(pages: RawPage[]) {
  const { paragraphs, context } = layoutOf(pages);
  return detectLists(paragraphs, context);
}

/** A page with body text and a candidate item of `count` lines. */
function pageWithItem(
  itemTexts: readonly string[],
  options: { x?: number; size?: number } = {},
): RawPage {
  return page([...bodyAt(100), ...lines(itemTexts, 170, options), ...bodyAt(250), ...bodyAt(310)]);
}

describe("LIST_MARKER", () => {
  it("recognises bullets, numbers and lettered labels", () => {
    for (const marker of ["* item here", "- item here", "(3) item here", "12. item here"]) {
      expect(LIST_MARKER.test(marker), marker).toBe(true);
    }
  });

  it("keeps prose out", () => {
    for (const prose of ["A sentence.", "2024. A year of change.", "120 pages of notes."]) {
      expect(LIST_MARKER.test(prose), prose).toBe(false);
    }
  });
});

describe("detectLists", () => {
  it("marks a bullet-led block as a list item", () => {
    const decisions = decisionsOf([
      pageWithItem(["* Keep the morning tools dry", "* Oil the hinge every month"]),
    ]);
    const lists = decisions.filter((decision) => decision.list);
    expect(lists).toHaveLength(1);
    expect(lists[0]?.marked).toBe(true);
  });

  it("marks a numbered block as a list item", () => {
    // Two items, one baseline apart with extra space: the paragraph layer
    // keeps them apart, the way a typesetter separates list items.
    const decisions = decisionsOf([
      page([
        ...bodyAt(100),
        ...lines(["1. Sweep the boards at noon"], 170),
        ...lines(["2. Close the window before rain"], 210),
        ...bodyAt(280),
        ...bodyAt(340),
      ]),
    ]);
    const lists = decisions.filter((decision) => decision.list);
    expect(lists).toHaveLength(2);
    expect(lists.every((decision) => decision.marked)).toBe(true);
  });

  it("marks a shallow indent on every line as an uncertain list item", () => {
    // 18pt at an 11pt body: 1.64em — one step below the block-quote gate.
    const decisions = decisionsOf([
      pageWithItem(["Primeiro ponto: a margem esquerda fica", "sempre no mesmo lugar."], {
        x: MARGIN + 18,
      }),
    ]);
    const lists = decisions.filter((decision) => decision.list);
    expect(lists).toHaveLength(1);
    expect(lists[0]?.marked).toBe(false);
    expect(lists[0]?.uncertain).toBe(true);
  });

  it("keeps the quote's deeper indent out of the list rule", () => {
    // 24pt at an 11pt body: 2.18em — at or above QUOTE_MIN_INDENT_EM the
    // block-quote pass (E5-T04) owns the recuo.
    const decisions = decisionsOf([
      pageWithItem(["Indented quote line one continues", "and the second line follows here"], {
        x: MARGIN + 24,
      }),
    ]);
    expect(decisions.every((decision) => !decision.list)).toBe(true);
  });

  it("keeps a first-line-only indent as a paragraph", () => {
    const page0 = page([
      ...bodyAt(100),
      item("First line indented like a body paragraph", MARGIN + 18, 170, BODY),
      item("second line back at the left edge of the measure", MARGIN, 185, BODY),
      ...bodyAt(250),
      ...bodyAt(310),
    ]);
    expect(decisionsOf([page0]).every((decision) => !decision.list)).toBe(true);
  });

  it("keeps a flush-left block without a marker as a paragraph", () => {
    const decisions = decisionsOf([
      pageWithItem(["Ordinary body text with no marker", "and no indent at all"]),
    ]);
    expect(decisions.every((decision) => !decision.list)).toBe(true);
  });
});

describe("buildBook with lists (E5-T05)", () => {
  it("emits a list_item block for a marked item, without the uncertain flag", () => {
    const book = buildBook(
      doc([page([...bodyAt(100), ...lines(["* Oil the hinge every month"], 170), ...bodyAt(230)])]),
    );
    const item = book.blocks.find((block) => block.kind === "list_item");
    expect(item).toBeDefined();
    expect(item?.flags).not.toContain(UNCERTAIN_LIST_FLAG);
  });

  it("emits an uncertain list_item for the indent rule alone", () => {
    const book = buildBook(
      doc([
        page([
          ...bodyAt(100),
          ...lines(["Primeiro ponto: a margem esquerda fica", "sempre no mesmo lugar."], 170, {
            x: MARGIN + 18,
          }),
          ...bodyAt(250),
        ]),
      ]),
    );
    const item = book.blocks.find((block) => block.kind === "list_item");
    expect(item).toBeDefined();
    expect(item?.flags).toContain(UNCERTAIN_LIST_FLAG);
    expect(item?.confidence).toBe(LIST_UNCERTAIN_CONFIDENCE);
  });

  it("keeps a marked item inside an indented quote as a list_item", () => {
    const book = buildBook(
      doc([
        page([
          ...bodyAt(100),
          ...lines(["* A bullet the quote could swallow"], 170, { x: MARGIN + 24 }),
          ...bodyAt(230),
        ]),
      ]),
    );
    expect(book.blocks.some((block) => block.kind === "blockquote")).toBe(false);
    expect(book.blocks.filter((block) => block.kind === "list_item")).toHaveLength(1);
  });

  it("keeps body paragraphs as paragraphs", () => {
    const book = buildBook(doc([page([...bodyAt(100), ...bodyAt(160), ...bodyAt(220)])]));
    expect(book.blocks.every((block) => block.kind === "paragraph")).toBe(true);
  });
});
