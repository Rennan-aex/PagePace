// E5-T04: block quotes and epigraphs (layer 4, "semântica"). Every signal of
// `detectQuotes` gets a case here — the indent of every line against the
// measure, the smaller face, the dominant italic, the leading that differs
// from the body's — plus the guards that keep body text out (a first-line
// only indent is a paragraph, a flush-left block is never a quote). The
// buildBook round trip checks the kind, the flag and the confidence.
import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildBook } from "./book";
import { pageMeasureOf } from "./headings";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import {
  detectQuotes,
  QUOTE_UNCERTAIN_CONFIDENCE,
  type QuoteDecision,
  UNCERTAIN_QUOTE_FLAG,
} from "./quotes";
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
  options: { x?: number; size?: number; leading?: number; fontName?: string } = {},
): RawTextItem[] {
  const x = options.x ?? MARGIN;
  const size = options.size ?? BODY;
  const leading = options.leading ?? LEADING;
  const fontName = options.fontName ?? "Helvetica";
  return texts.map((text, index) => item(text, x, baseline + index * leading, size, { fontName }));
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

/** Paragraphs and the context `detectQuotes` needs, measured once. */
function layoutOf(pages: RawPage[]) {
  const document = doc(pages);
  const stats = documentStats(document);
  const grouped = groupDocumentParagraphs(document);
  const paragraphs = joinCrossPageParagraphs(grouped, stats.bodyFontSize);
  const pageMeasures = grouped.map((pageLines) => pageMeasureOf(pageLines.flat()));
  const measures = paragraphs.map(
    (paragraph) => pageMeasures[paragraph.pageFrom] ?? { left: 0, right: 0, width: 0 },
  );
  return {
    document,
    stats,
    paragraphs,
    context: { bodyFontSize: stats.bodyFontSize, lineHeight: stats.lineHeight, measures },
    pageLines: grouped.map((page) => page.flat()),
  };
}

/** The decisions `detectQuotes` would make for these pages. */
function decisionsOf(pages: RawPage[]): QuoteDecision[] {
  const { paragraphs, context } = layoutOf(pages);
  return detectQuotes(paragraphs, context);
}

/** A page with body text and an indented block of `count` lines. */
function pageWithQuote(
  quoteTexts: readonly string[],
  options: { x?: number; size?: number; leading?: number; fontName?: string } = {},
): RawPage {
  return page([...bodyAt(100), ...lines(quoteTexts, 170, options), ...bodyAt(250), ...bodyAt(310)]);
}

describe("detectQuotes", () => {
  it("marks a block indented on every line as a blockquote", () => {
    const decisions = decisionsOf([
      pageWithQuote(["Indented quote line one continues", "and the second line follows here"], {
        x: MARGIN + 24,
      }),
    ]);
    const quotes = decisions.filter((decision) => decision.quote);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.kind).toBe("blockquote");
  });

  it("keeps a first-line-only indent as a paragraph", () => {
    // The paragraph layer stitches the first-line indent into one block whose
    // second line sits flush left: the minimum indent is 0, not a quote.
    const page0 = page([
      ...bodyAt(100),
      item("First line indented like a body paragraph", MARGIN + 24, 170, BODY),
      item("second line back at the left edge of the measure", MARGIN, 185, BODY),
      ...bodyAt(250),
      ...bodyAt(310),
    ]);
    const decisions = decisionsOf([page0]);
    expect(decisions.every((decision) => !decision.quote)).toBe(true);
  });

  it("keeps a flush-left block as a paragraph", () => {
    const decisions = decisionsOf([pageWithQuote(["No indent here at all", "just body text"])]);
    expect(decisions.every((decision) => !decision.quote)).toBe(true);
  });

  it("marks a short indented italic block as an epigraph", () => {
    const decisions = decisionsOf([
      pageWithQuote(["We learn by looking, and the eye", "is slower than the claim."], {
        x: MARGIN + 36,
        fontName: "Helvetica-Oblique",
      }),
    ]);
    const quotes = decisions.filter((decision) => decision.quote);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.kind).toBe("epigraph");
  });

  it("marks a short indented smaller block as an epigraph", () => {
    const decisions = decisionsOf([
      pageWithQuote(["A smaller face opens the chapter", "before the body begins."], {
        x: MARGIN + 36,
        size: 9,
      }),
    ]);
    const quotes = decisions.filter((decision) => decision.quote);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.kind).toBe("epigraph");
  });

  it("keeps a front-matter label as a paragraph, never a quote (backlog 3A)", () => {
    // A label-led line (`Keywords:`, `E-mail:`, `Abstract`) is metadata, not a
    // display quote, even when it is short, indented and smaller.
    for (const label of ["Keywords: skepticism, certainty", "E-mail: danieltemp@example.org"]) {
      const decisions = decisionsOf([pageWithQuote([label], { x: MARGIN + 36, size: 9 })]);
      expect(decisions.filter((decision) => decision.quote)).toHaveLength(0);
    }
  });

  it("keeps a dialogue line as a paragraph, never a quote (backlog 3A)", () => {
    // "— Rom, rom, rom! — ronronou ele." sits indented and closed like a
    // sentence: the em dash that opens it is the speech mark of spoken prose,
    // not the attribution of a quotation.
    const decisions = decisionsOf([
      pageWithQuote(["— Rom, rom, rom! — ronronou ele."], { x: MARGIN + 24 }),
    ]);
    expect(decisions.filter((decision) => decision.quote)).toHaveLength(0);

    const italic = decisionsOf([
      pageWithQuote(["— Não, respondeu ela, e saiu andando."], {
        x: MARGIN + 36,
        fontName: "Helvetica-Oblique",
      }),
    ]);
    expect(italic.filter((decision) => decision.quote)).toHaveLength(0);
  });

  it("keeps the body that follows a metadata label as a paragraph (backlog 3A)", () => {
    // The abstract of an A&A paper: the label line, then the abstract itself
    // set smaller and indented inside the measure — the indent rule alone
    // would claim that body as a blockquote.
    const page0 = page([
      ...bodyAt(100),
      ...lines(["ABSTRACT"], 170, { size: 9 }),
      ...lines(
        ["Context. The abstract runs indented on", "every line the journal sets inside it."],
        210,
        { x: MARGIN + 24, size: 9 },
      ),
      ...bodyAt(290),
      ...bodyAt(350),
    ]);
    const decisions = decisionsOf([page0]);
    expect(decisions.filter((decision) => decision.quote)).toHaveLength(0);
    const abstractBody = decisions.at(-1);
    expect(abstractBody?.quote).toBe(false);
  });

  it("keeps a one-line indented display line without quote shape as a paragraph", () => {
    // A title/subtitle or a byline set italic and indented is not an epigraph
    // unless it reads like a quote (attribution or sentence punctuation).
    const decisions = decisionsOf([
      pageWithQuote(["Wittgenstein and skepticism"], {
        x: MARGIN + 36,
        fontName: "Helvetica-Oblique",
      }),
    ]);
    expect(decisions.filter((decision) => decision.quote)).toHaveLength(0);
  });

  it("still marks a one-line indented italic line with punctuation as an epigraph", () => {
    const decisions = decisionsOf([
      pageWithQuote(["The world is everything that is the case."], {
        x: MARGIN + 36,
        fontName: "Helvetica-Oblique",
      }),
    ]);
    const quotes = decisions.filter((decision) => decision.quote);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.kind).toBe("epigraph");
  });

  it("keeps a one-line indent-only block as a paragraph (backlog 3A)", () => {
    // An affiliation or an e-mail line indented by the measure alone is not a
    // quote: the indent rule only claims a real block (two or more lines).
    const decisions = decisionsOf([
      pageWithQuote(["Universidade Federal de Santa Maria, Santa Maria, RS, Brasil."], {
        x: MARGIN + 24,
      }),
    ]);
    expect(decisions.filter((decision) => decision.quote)).toHaveLength(0);
  });

  it("keeps a one-line smaller byline as a paragraph, not a quote (backlog 3A)", () => {
    // The wittgenstein byline is a smaller face indented by the measure; a
    // single line without attribution or punctuation is metadata, not a quote.
    const decisions = decisionsOf([pageWithQuote(["Daniel Temp"], { x: MARGIN + 24, size: 9 })]);
    expect(decisions.filter((decision) => decision.quote)).toHaveLength(0);
  });

  it("keeps a long indented italic block as a blockquote, not an epigraph", () => {
    const decisions = decisionsOf([
      pageWithQuote(
        [
          "A long quotation that runs",
          "past the epigraph limit of",
          "four lines and keeps going",
          "with more and more text",
          "and yet another line here",
        ],
        { x: MARGIN + 24, fontName: "Helvetica-Oblique" },
      ),
    ]);
    const quotes = decisions.filter((decision) => decision.quote);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.kind).toBe("blockquote");
  });

  it("flags a quote accepted by the indent rule alone", () => {
    // Same face, same leading, only the indent: the weakest signal.
    const decisions = decisionsOf([
      pageWithQuote(["Indented but otherwise ordinary body text", "spaced exactly like the rest"], {
        x: MARGIN + 24,
      }),
    ]);
    const quotes = decisions.filter((decision) => decision.quote);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.uncertain).toBe(true);
  });

  it("does not flag a quote that also carries a smaller face", () => {
    const decisions = decisionsOf([
      pageWithQuote(["Indented and set smaller than the body", "so the layout says quote"], {
        x: MARGIN + 24,
        size: 9,
      }),
    ]);
    const quotes = decisions.filter((decision) => decision.quote);
    expect(quotes[0]?.uncertain).toBe(false);
  });

  it("accepts a leading that differs from the body as a corroborating signal", () => {
    // Wider leading (18 vs the body's 15) plus the indent.
    const decisions = decisionsOf([
      pageWithQuote(["Quote with a wider leading between", "its own lines than the body"], {
        x: MARGIN + 24,
        leading: 18,
      }),
    ]);
    const quotes = decisions.filter((decision) => decision.quote);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]?.kind).toBe("blockquote");
  });

  it("keeps an epigraph shorter than the limit and a long quote as blockquote", () => {
    const twoLines = decisionsOf([
      pageWithQuote(["Short italic epigraph here", "— An Author"], {
        x: MARGIN + 36,
        fontName: "Helvetica-Oblique",
      }),
    ]);
    expect(twoLines.filter((decision) => decision.quote)[0]?.kind).toBe("epigraph");

    const fiveLines = decisionsOf([
      pageWithQuote(
        [
          "One line of the quote",
          "two lines of the quote",
          "three lines of the quote",
          "four lines of the quote",
          "five lines of the quote",
        ],
        { x: MARGIN + 24 },
      ),
    ]);
    expect(fiveLines.filter((decision) => decision.quote)[0]?.kind).toBe("blockquote");
  });
});

describe("buildBook with quotes (E5-T04)", () => {
  it("emits a blockquote block with the uncertain flag when only the indent agrees", () => {
    const book = buildBook(
      doc([
        page([
          ...bodyAt(100),
          ...lines(["A quoted passage that sits inside", "the measure on every single line"], 170, {
            x: MARGIN + 24,
          }),
          ...bodyAt(250),
          ...bodyAt(310),
        ]),
      ]),
    );
    const quote = book.blocks.find((block) => block.kind === "blockquote");
    expect(quote).toBeDefined();
    expect(quote?.flags).toContain(UNCERTAIN_QUOTE_FLAG);
    expect(quote?.confidence).toBe(QUOTE_UNCERTAIN_CONFIDENCE);
  });

  it("emits an epigraph block without the uncertain flag", () => {
    const book = buildBook(
      doc([
        page([
          ...bodyAt(100),
          ...lines(
            ["We learn by looking, and the eye", "is slower than the claim. — An Author"],
            170,
            { x: MARGIN + 36, fontName: "Helvetica-Oblique" },
          ),
          ...bodyAt(250),
          ...bodyAt(310),
        ]),
      ]),
    );
    const epigraph = book.blocks.find((block) => block.kind === "epigraph");
    expect(epigraph).toBeDefined();
    expect(epigraph?.flags).not.toContain(UNCERTAIN_QUOTE_FLAG);
    expect(epigraph?.confidence).toBeGreaterThan(QUOTE_UNCERTAIN_CONFIDENCE);
  });

  it("keeps body paragraphs as paragraphs", () => {
    const book = buildBook(doc([page([...bodyAt(100), ...bodyAt(160), ...bodyAt(220)])]));
    expect(book.blocks.every((block) => block.kind === "paragraph")).toBe(true);
  });

  it("does not turn a heading into a quote", () => {
    // A short flush-left line above body text: the heading pass claims it
    // first, and the quote pass must not override the kind.
    const book = buildBook(
      doc([
        page([
          ...lines(["Chapter Title"], 100, { size: 18 }),
          ...bodyAt(160),
          ...bodyAt(220),
          ...bodyAt(280),
        ]),
      ]),
    );
    const heading = book.blocks.find((block) => block.kind === "heading");
    expect(heading).toBeDefined();
    expect(book.blocks.some((block) => block.kind === "blockquote")).toBe(false);
    expect(book.blocks.some((block) => block.kind === "epigraph")).toBe(false);
  });
});
