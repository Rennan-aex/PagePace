import type { RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import type { TextLine } from "./lines";
import { endsSentence, joinCrossPageParagraphs, PAGE_JOIN_TITLE_FONT_FACTOR } from "./pagejoin";

const BODY = 11;
const MARGIN = 72;

/** A single-item line, the way `groupLines` delivers it. */
function line(text: string, x = MARGIN, baseline = 100, size = BODY): TextLine {
  const item: RawTextItem = {
    text,
    x,
    y: baseline - size,
    width: text.length * size * 0.5,
    height: size,
    fontName: "Helvetica",
    fontSize: size,
  };
  return { items: [item], top: item.y, bottom: baseline, x, width: item.width, fontSize: size };
}

/** One page as `groupDocumentParagraphs` delivers it: paragraphs of lines. */
function page(...paragraphs: TextLine[][]): TextLine[][] {
  return paragraphs;
}

describe("endsSentence", () => {
  it("returns true for . ! ? …", () => {
    expect(endsSentence("Hello.")).toBe(true);
    expect(endsSentence("Stop!")).toBe(true);
    expect(endsSentence("What?")).toBe(true);
    expect(endsSentence("Trailing\u2026")).toBe(true);
  });

  it("returns false for mid-sentence punctuation or no punctuation", () => {
    expect(endsSentence("Hello,")).toBe(false);
    expect(endsSentence("Hello")).toBe(false);
    expect(endsSentence("Hello;")).toBe(false);
    expect(endsSentence("Hello:")).toBe(false);
  });

  it("ignores trailing closing quotes and brackets before the stop", () => {
    expect(endsSentence('He said "stop."')).toBe(true);
    expect(endsSentence("Done.)")).toBe(true);
    expect(endsSentence("Done.]")).toBe(true);
    expect(endsSentence("End.\u2019")).toBe(true);
    expect(endsSentence("End.\u201D")).toBe(true);
    expect(endsSentence("End.\u00BB")).toBe(true);
  });

  it("returns false for empty or whitespace-only text", () => {
    expect(endsSentence("")).toBe(false);
    expect(endsSentence("   ")).toBe(false);
    expect(endsSentence('"""')).toBe(false);
  });
});

describe("joinCrossPageParagraphs", () => {
  it("joins a mid-sentence paragraph across two pages", () => {
    const lastOfPage0 = line("The story continues");
    const firstOfPage1 = line("on the next page.");
    const result = joinCrossPageParagraphs(
      [page([line("A finished thought."), lastOfPage0]), page([firstOfPage1])],
      BODY,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.pageFrom).toBe(0);
    expect(result[0]?.pageTo).toBe(1);
    expect(result[0]?.lines).toHaveLength(3);
    expect(result[0]?.lines[1]).toBe(lastOfPage0);
    expect(result[0]?.lines[2]).toBe(firstOfPage1);
  });

  it("does not join when the last line of the page ends a sentence", () => {
    const result = joinCrossPageParagraphs(
      [page([line("A complete sentence.")]), page([line("New paragraph.")])],
      BODY,
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.pageTo).toBe(0);
    expect(result[1]?.pageFrom).toBe(1);
  });

  it("does not join when the next page starts indented", () => {
    const result = joinCrossPageParagraphs(
      [page([line("The story continues")]), page([line("indented.", MARGIN + 20)])],
      BODY,
    );
    expect(result).toHaveLength(2);
  });

  it("detects indent against the book margin, not the page margin", () => {
    // The page's only line is indented — the page margin alone would miss it.
    const result = joinCrossPageParagraphs(
      [page([line("Flush left.")]), page([line("Only line, indented.", MARGIN + 20)])],
      BODY,
    );
    expect(result).toHaveLength(2);
  });

  it("does not join when the last line is a heading", () => {
    const heading = line("CHAPTER ONE", MARGIN, 100, BODY * 1.5);
    const result = joinCrossPageParagraphs(
      [page([heading]), page([line("Body text continues.")])],
      BODY,
    );
    expect(result).toHaveLength(2);
  });

  it("does not join when the first line of the next page is a heading", () => {
    const heading = line("CHAPTER TWO", MARGIN, 100, BODY * 1.5);
    const result = joinCrossPageParagraphs(
      [page([line("The story continues")]), page([heading])],
      BODY,
    );
    expect(result).toHaveLength(2);
  });

  it("joins only at the page boundary: a middle paragraph of the next page stays separate", () => {
    const result = joinCrossPageParagraphs(
      [
        page([line("First.")], [line("The story continues")]),
        page([line("on the next page.")], [line("Another.")]),
      ],
      BODY,
    );
    expect(result).toHaveLength(3);
    expect(result[0]?.lines).toHaveLength(1);
    expect(result[0]?.pageTo).toBe(0);
    expect(result[1]?.pageFrom).toBe(0);
    expect(result[1]?.pageTo).toBe(1);
    expect(result[1]?.lines).toHaveLength(2);
    expect(result[2]?.pageFrom).toBe(1);
    expect(result[2]?.pageTo).toBe(1);
    expect(result[2]?.lines).toHaveLength(1);
  });

  it("joins three consecutive pages into one paragraph", () => {
    const result = joinCrossPageParagraphs(
      [page([line("One")]), page([line("two")]), page([line("three.")])],
      BODY,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.pageFrom).toBe(0);
    expect(result[0]?.pageTo).toBe(2);
    expect(result[0]?.lines).toHaveLength(3);
  });

  it("sets pageFrom and pageTo to the same page for unjoined paragraphs", () => {
    const result = joinCrossPageParagraphs([page([line("One.")]), page([line("Two.")])], BODY);
    expect(result[0]?.pageFrom).toBe(0);
    expect(result[0]?.pageTo).toBe(0);
    expect(result[1]?.pageFrom).toBe(1);
    expect(result[1]?.pageTo).toBe(1);
  });

  it("does not mutate the input pages", () => {
    const pages = [page([line("The story")]), page([line("continues.")])];
    const snapshot = pages.map((paragraphs) => paragraphs.map((paragraph) => [...paragraph]));
    joinCrossPageParagraphs(pages, BODY);
    expect(pages).toEqual(snapshot);
  });

  it("handles an empty document", () => {
    expect(joinCrossPageParagraphs([], BODY)).toEqual([]);
  });

  it("handles a page with no paragraphs", () => {
    const result = joinCrossPageParagraphs([[], page([line("Solo.")])], BODY);
    expect(result).toHaveLength(1);
    expect(result[0]?.pageFrom).toBe(1);
  });

  it("uses PAGE_JOIN_TITLE_FONT_FACTOR as the heading threshold", () => {
    expect(PAGE_JOIN_TITLE_FONT_FACTOR).toBeGreaterThan(1);
    const justUnder = BODY * PAGE_JOIN_TITLE_FONT_FACTOR - 0.01;
    const justOver = BODY * PAGE_JOIN_TITLE_FONT_FACTOR + 0.01;
    // Just under the threshold: not a heading, join happens.
    const joined = joinCrossPageParagraphs(
      [page([line("The story", MARGIN, 100, justUnder)]), page([line("continues.")])],
      BODY,
    );
    expect(joined).toHaveLength(1);
    // Just over the threshold: heading, join blocked.
    const blocked = joinCrossPageParagraphs(
      [page([line("The story", MARGIN, 100, justOver)]), page([line("continues.")])],
      BODY,
    );
    expect(blocked).toHaveLength(2);
  });
});
