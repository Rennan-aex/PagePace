/** Languages the segmenter has abbreviation/rule data for (SEG-T02). */
export type SegmentLang = "pt" | "en";

/** Options accepted by {@link splitSentences}. */
export interface SplitSentencesOptions {
  lang: SegmentLang;
  /**
   * SEG-T04: maximum length (in characters) of every sentence span. Spans longer
   * than this are cut at the last whitespace inside the limit, or hard-cut when
   * there is none. Defaults to `DEFAULT_MAX_SPAN_LENGTH`; pass `Infinity` to
   * disable the cap. Must be a positive integer or `Infinity`.
   */
  maxSpanLength?: number;
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
