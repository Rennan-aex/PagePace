// E5-T05: captions (layer 4, "semântica"). Every signal of `detectCaptions`
// gets a case here — the printed figure/table label with its separator, the
// smaller face, the short block — plus the guards that keep prose out (a
// sentence that merely starts with a number is not a caption). The
// buildBook round trip checks kind, flag and confidence, and the priority of
// the caption over the heading pass.
import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildBook } from "./book";
import { CAPTION_UNCERTAIN_CONFIDENCE, detectCaptions, UNCERTAIN_CAPTION_FLAG } from "./captions";
import { joinCrossPageParagraphs } from "./pagejoin";
import { groupDocumentParagraphs } from "./paragraphs";
import { documentStats } from "./stats";

const BODY = 11;
const LEADING = 15;
const MARGIN = 72;

/** One item sitting on `baseline`, the way the ingestion delivers it. */
function item(text: string, x: number, baseline: number, size: number): RawTextItem {
  return {
    text,
    x,
    y: baseline - size,
    width: text.length * size * 0.5,
    height: size,
    fontName: "Helvetica",
    fontSize: size,
  };
}

/** A block of lines at `x`, the first on `baseline`, `leading` apart. */
function lines(
  texts: readonly string[],
  baseline: number,
  options: { x?: number; size?: number } = {},
): RawTextItem[] {
  const x = options.x ?? MARGIN;
  const size = options.size ?? BODY;
  return texts.map((text, index) => item(text, x, baseline + index * LEADING, size));
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

/** Paragraphs and the context `detectCaptions` needs, measured once. */
function layoutOf(pages: RawPage[]) {
  const document = doc(pages);
  const stats = documentStats(document);
  const grouped = groupDocumentParagraphs(document);
  const paragraphs = joinCrossPageParagraphs(grouped, stats.bodyFontSize);
  return {
    document,
    paragraphs,
    context: { bodyFontSize: stats.bodyFontSize },
  };
}

/** The decisions `detectCaptions` would make for these pages. */
function decisionsOf(pages: RawPage[]) {
  const { paragraphs, context } = layoutOf(pages);
  return detectCaptions(paragraphs, context);
}

/** A page with body text and a caption candidate. */
function pageWithCaption(
  captionTexts: readonly string[],
  options: { size?: number } = {},
): RawPage {
  return page([...bodyAt(100), ...lines(captionTexts, 170, options), ...bodyAt(250)]);
}

describe("detectCaptions", () => {
  it("marks a smaller figure label as a caption", () => {
    const decisions = decisionsOf([
      pageWithCaption(["Fig. 1 - The lamp above the old door."], { size: 9 }),
    ]);
    const captions = decisions.filter((decision) => decision.caption);
    expect(captions).toHaveLength(1);
    expect(captions[0]?.uncertain).toBe(false);
  });

  it("marks a body-sized short table label as a caption", () => {
    const decisions = decisionsOf([pageWithCaption(["Table 2: Hours of light, by month."])]);
    const captions = decisions.filter((decision) => decision.caption);
    expect(captions).toHaveLength(1);
    expect(captions[0]?.uncertain).toBe(false);
  });

  it("keeps a sentence that merely starts with a number as a paragraph", () => {
    const decisions = decisionsOf([
      pageWithCaption([
        "Figure 2 shows the trend over a decade,",
        "and the numbers tell the same story",
        "the chart has been telling all along.",
      ]),
    ]);
    expect(decisions.every((decision) => !decision.caption)).toBe(true);
  });

  it("flags a label the layout does not agree with", () => {
    const decisions = decisionsOf([
      pageWithCaption([
        "Fig. 9 - A long set label that keeps",
        "running for more lines than a caption",
        "usually takes, at the body size, so",
        "only the printed word vouches for it.",
      ]),
    ]);
    const captions = decisions.filter((decision) => decision.caption);
    expect(captions).toHaveLength(1);
    expect(captions[0]?.uncertain).toBe(true);
  });

  it("keeps a label without a separator as a paragraph", () => {
    const decisions = decisionsOf([pageWithCaption(["Figura 3 O lampião antigo"])]);
    expect(decisions.every((decision) => !decision.caption)).toBe(true);
  });
});

describe("buildBook with captions (E5-T05)", () => {
  it("emits a caption block without the uncertain flag", () => {
    const book = buildBook(
      doc([
        page([
          ...bodyAt(100),
          ...lines(["Fig. 1 - The lamp above the old door."], 170, { size: 9 }),
          ...bodyAt(230),
        ]),
      ]),
    );
    const caption = book.blocks.find((block) => block.kind === "caption");
    expect(caption).toBeDefined();
    expect(caption?.flags).not.toContain(UNCERTAIN_CAPTION_FLAG);
  });

  it("emits an uncertain caption when only the label agrees", () => {
    const book = buildBook(
      doc([
        page([
          ...bodyAt(100),
          ...lines(
            [
              "Fig. 9 - A long set label that keeps",
              "running for more lines than a caption",
              "usually takes, at the body size, so",
              "only the printed word vouches for it.",
            ],
            170,
          ),
          ...bodyAt(280),
        ]),
      ]),
    );
    const caption = book.blocks.find((block) => block.kind === "caption");
    expect(caption).toBeDefined();
    expect(caption?.flags).toContain(UNCERTAIN_CAPTION_FLAG);
    expect(caption?.confidence).toBe(CAPTION_UNCERTAIN_CONFIDENCE);
  });

  it("keeps body paragraphs as paragraphs", () => {
    const book = buildBook(doc([page([...bodyAt(100), ...bodyAt(160)])]));
    expect(book.blocks.every((block) => block.kind === "paragraph")).toBe(true);
  });

  it("does not turn a heading into a caption", () => {
    const book = buildBook(
      doc([page([...lines(["Plates and Tables"], 100), ...bodyAt(160), ...bodyAt(220)])]),
    );
    const heading = book.blocks.find((block) => block.kind === "heading");
    expect(heading).toBeDefined();
    expect(book.blocks.some((block) => block.kind === "caption")).toBe(false);
  });
});
