import { EN_ABBREVIATIONS } from "./abbreviations/en";
import { PT_ABBREVIATIONS } from "./abbreviations/pt";
import type { SegmentLang, SentenceSpan, SplitSentencesOptions } from "./types";

/** Characters that can end a sentence. A run of them (e.g. `...`, `?!`) counts once. */
const TERMINATORS = new Set([".", "!", "?", "…"]);

/** Closing punctuation that stays with the sentence it closes. */
const CLOSERS = new Set(['"', "'", "”", "’", "»", ")", "]", "}"]);

/** Abbreviations per language, stored lowercase and without the trailing period. */
const ABBREVIATIONS: Readonly<Record<SegmentLang, ReadonlySet<string>>> = {
  pt: new Set(PT_ABBREVIATIONS),
  en: new Set(EN_ABBREVIATIONS),
};

const WHITESPACE = /\s/u;
const LETTER_OR_DOT = /[A-Za-z.]/u;
const UPPERCASE = /[A-Z]/u;

function isWhitespace(char: string): boolean {
  return WHITESPACE.test(char);
}

function assertLang(lang: string): asserts lang is SegmentLang {
  if (lang !== "pt" && lang !== "en") {
    throw new RangeError(`Unsupported language: ${String(lang)}`);
  }
}

/** The letters/dots right before `periodIndex`, e.g. `e.g` in `"e.g."`, or `null`. */
function abbreviationBefore(text: string, periodIndex: number): string | null {
  let start = periodIndex;
  while (start > 0 && LETTER_OR_DOT.test(text.charAt(start - 1))) start -= 1;
  return start === periodIndex ? null : text.slice(start, periodIndex);
}

/** A lone capital letter is an initial (`J. S. Mill`), not a word that ends a sentence. */
function isInitialBefore(text: string, periodIndex: number): boolean {
  if (!UPPERCASE.test(text.charAt(periodIndex - 1))) return false;
  const before = periodIndex - 2;
  return before < 0 || !LETTER_OR_DOT.test(text.charAt(before));
}

/** First character at or after `from` that is not whitespace, or `""` at the end. */
function nextNonSpace(text: string, from: number): string {
  let index = from;
  while (index < text.length && isWhitespace(text.charAt(index))) index += 1;
  return text.charAt(index);
}

/**
 * Whether a single period should be ignored as a boundary: after a known abbreviation
 * (`Sr.`, `e.g.`, `p.`) always, and after an initial (`J.`) when an uppercase word follows.
 * Numbers (`3.14`, `1.000,50`) never reach this check: the period is not followed by space.
 */
function keepsSentenceGoing(
  text: string,
  periodIndex: number,
  after: number,
  lang: SegmentLang,
): boolean {
  const candidate = abbreviationBefore(text, periodIndex);
  if (candidate !== null && ABBREVIATIONS[lang].has(candidate.toLowerCase())) return true;
  return isInitialBefore(text, periodIndex) && UPPERCASE.test(nextNonSpace(text, after));
}

/**
 * Splits `text` into sentence offsets. A boundary needs a terminator (`.`, `!`, `?`, `…`,
 * possibly repeated) optionally followed by closing quotes/brackets and then whitespace or
 * the end of the text. A single period after a known abbreviation or an initial does not
 * break. Spans are trimmed: the whitespace between sentences is not included.
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
      let terminatorCount = 0;
      while (after < text.length && TERMINATORS.has(text.charAt(after))) {
        after += 1;
        terminatorCount += 1;
      }
      while (after < text.length && CLOSERS.has(text.charAt(after))) after += 1;

      if (after >= text.length || isWhitespace(text.charAt(after))) {
        const singlePeriod = terminatorCount === 1 && text.charAt(index) === ".";
        if (singlePeriod && keepsSentenceGoing(text, index, after, options.lang)) {
          index = after;
          continue;
        }

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
