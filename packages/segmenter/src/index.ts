// @pagepace/segmenter - pure, deterministic sentence and word segmentation (SEG phase).
export { splitSentences } from "./sentences";
export type {
  SegmentLang,
  SentenceSpan,
  SplitSentencesOptions,
  WordToken,
} from "./types";
export { splitWords } from "./words";

export const PACKAGE_NAME = "@pagepace/segmenter";
