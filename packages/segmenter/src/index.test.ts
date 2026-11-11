import { describe, expect, it } from "vitest";
import {
  PACKAGE_NAME,
  type SentenceSpan,
  splitSentences,
  splitWords,
  type WordToken,
} from "./index";

describe("@pagepace/segmenter", () => {
  it("loads", () => {
    expect(PACKAGE_NAME).toBe("@pagepace/segmenter");
  });

  it("exposes sentence spans as plain offsets", () => {
    const spans: SentenceSpan[] = splitSentences("Olá. Tchau.", { lang: "pt" });
    expect(spans).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 11 },
    ]);
  });

  it("exposes word tokens with text and offsets", () => {
    const tokens: WordToken[] = splitWords("Olá, mundo!");
    expect(tokens).toEqual([
      { text: "Olá,", start: 0, end: 4 },
      { text: "mundo!", start: 5, end: 11 },
    ]);
  });
});
