/** Languages the segmenter has abbreviation/rule data for (SEG-T02). */
export type SegmentLang = "pt" | "en";

/** Options accepted by {@link splitSentences}. */
export interface SplitSentencesOptions {
  lang: SegmentLang;
}

/** Half-open `[start, end)` character offsets of a sentence inside the source text. */
export interface SentenceSpan {
  start: number;
  end: number;
}

/** A word token with its punctuation attached, plus its offsets in the source text. */
export interface WordToken {
  text: string;
  start: number;
  end: number;
}
