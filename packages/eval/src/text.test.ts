import type { RawDocument, RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { documentText, pageText, SPACE_GAP_EM } from "./text";

const item = (text: string, x: number, options: Partial<RawTextItem> = {}): RawTextItem => ({
  text,
  x,
  y: 100,
  width: 20,
  height: 12,
  fontName: "Helvetica",
  fontSize: 10,
  ...options,
});

const page = (items: RawTextItem[], index = 0): RawPage => ({
  index,
  width: 600,
  height: 800,
  rotation: 0,
  items,
});

const document = (pages: RawPage[]): RawDocument => ({
  schemaVersion: "1.1.0",
  source: {
    fileName: "sample.pdf",
    sha256: "0".repeat(64),
    pageCount: pages.length,
    tagged: false,
  },
  pages,
  ingest: { adapter: "pdfjs", adapterVersion: "6.4.299" },
});

describe("pageText", () => {
  it("keeps a single run untouched", () => {
    expect(pageText(page([item("Hello world.", 72)]))).toBe("Hello world.");
  });

  it("glues neighbouring runs that touch (same word split by the producer)", () => {
    const first = item("phil", 72);
    const second = item("osophy", 92); // 72 + 20 = 92 → gap 0
    expect(pageText(page([first, second]))).toBe("philosophy");
  });

  it("separates runs whose horizontal gap is above SPACE_GAP_EM", () => {
    const first = item("Hello", 72);
    const second = item("world", 97); // gap 5 > 0.15 * 10
    expect(pageText(page([first, second]))).toBe("Hello world");
    expect(SPACE_GAP_EM).toBe(0.15);
  });

  it("does not separate at exactly the threshold", () => {
    const first = item("Hello", 72);
    const second = item("world", 93.5); // gap 1.5 = 0.15 * 10 → not above
    expect(pageText(page([first, second]))).toBe("Helloworld");
  });

  it("breaks the line where pdf.js reports hasEOL", () => {
    const first = item("Line one", 72, { hasEOL: true });
    const second = item("Line two", 72);
    expect(pageText(page([first, second]))).toBe("Line one\nLine two");
  });

  it("reads the empty marker items pdf.js puts between lines", () => {
    const first = item("Line one", 72);
    const marker = item("", 72, { hasEOL: true, width: 0 });
    const second = item("Line two", 72);
    expect(pageText(page([first, marker, second]))).toBe("Line one\nLine two");
  });

  it("keeps explicit space runs and ignores empty runs without EOL", () => {
    const runs = [item("PART", 72), item("", 72, { width: 0 }), item(" ", 92), item("I.", 94)];
    expect(pageText(page(runs))).toBe("PART I.");
  });

  it("returns an empty string for a page without items", () => {
    expect(pageText(page([]))).toBe("");
  });
});

describe("documentText", () => {
  const pages = [page([item("Page one.", 72)], 0), page([item("Page two.", 72)], 1)];

  it("joins every page with a line break", () => {
    expect(documentText(document(pages))).toBe("Page one.\nPage two.");
  });

  it("keeps only the requested pages (1-based, as in coverage.pages)", () => {
    expect(documentText(document(pages), [2])).toBe("Page two.");
    expect(documentText(document(pages), [1, 2])).toBe("Page one.\nPage two.");
    expect(documentText(document(pages), [])).toBe("");
  });
});
