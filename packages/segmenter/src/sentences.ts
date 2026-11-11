import type { SegmentLang, SentenceSpan, SplitSentencesOptions } from "./types";

/** Characters that can end a sentence. A run of them (e.g. `...`, `?!`) counts once. */
const TERMINATORS = new Set([".", "!", "?", "…"]);

/** Closing punctuation that stays with the sentence it closes. */
const CLOSERS = new Set(['"', "'", "”", "’", "»", ")", "]", "}"]);

const WHITESPACE = /\s/u;

function isWhitespace(char: string): boolean {
  return WHITESPACE.test(char);
}

function assertLang(lang: string): asserts lang is SegmentLang {
  if (lang !== "pt" && lang !== "en") {
    throw new RangeError(`Unsupported language: ${String(lang)}`);
  }
}

/**
 * Splits `text` into sentence offsets. A boundary needs a terminator (`.`, `!`, `?`, `…`,
 * possibly repeated) optionally followed by closing quotes/brackets and then whitespace or
 * the end of the text. Spans are trimmed: the whitespace between sentences is not included.
 */
export function splitSentences(text: string, options: SplitSentencesOptions): SentenceSpan[] {
  assertLang(options.lang);

  const spans: SentenceSpan[] = [];
  let index = 0;

  while (index < text.length) {
    while (index < text.length && isWhitespace(text.charAt(index))) index += 1;
    if (index >= text.length) break;

    const start = index;
    let end = text.length;

    while (index < text.length) {
      if (!TERMINATORS.has(text.charAt(index))) {
        index += 1;
        continue;
      }

      let after = index;
      while (after < text.length && TERMINATORS.has(text.charAt(after))) after += 1;
      while (after < text.length && CLOSERS.has(text.charAt(after))) after += 1;

      if (after >= text.length || isWhitespace(text.charAt(after))) {
        end = after;
        index = after;
        break;
      }

      index = after;
    }

    spans.push({ start, end });
  }

  return spans;
}
