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
const LETTER_OR_DOT = /[\p{L}.]/u;
const UPPERCASE = /\p{Lu}/u;
const LOWERCASE = /\p{Ll}/u;

/**
 * SEG-T04: default cap for every sentence span, in characters. Spans longer than
 * this (e.g. a whole paragraph with no punctuation) are cut at the last whitespace
 * inside the limit, or hard-cut when there is no whitespace. Pass
 * `maxSpanLength: Infinity` to disable the cap.
 */
export const DEFAULT_MAX_SPAN_LENGTH = 1000;

function isWhitespace(char: string): boolean {
  return WHITESPACE.test(char);
}

function assertLang(lang: string): asserts lang is SegmentLang {
  if (lang !== "pt" && lang !== "en") {
    throw new RangeError(`Unsupported language: ${String(lang)}`);
  }
}

function assertMaxSpanLength(maxSpanLength: number | undefined): void {
  if (maxSpanLength === undefined) return;
  if (maxSpanLength === Infinity) return;
  if (!Number.isInteger(maxSpanLength) || maxSpanLength < 1) {
    throw new RangeError(
      `maxSpanLength must be a positive integer or Infinity, got ${String(maxSpanLength)}`,
    );
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
 * Whether a terminator inside a closing quote continues the sentence: in
 * `"...?" cried his wife.` the attribution after the closing quote belongs to
 * the same sentence, so a lowercase word right after the closer keeps it going.
 */
function closerContinues(text: string, after: number): boolean {
  return LOWERCASE.test(nextNonSpace(text, after));
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
 * Splits `[start, end)` into spans of at most `limit` characters. Each piece ends
 * at the last whitespace inside the limit (the whitespace becomes the gap), or is
 * hard-cut at the limit when the text has no whitespace there. `start` is never
 * whitespace, so every piece is non-empty and trimmed.
 */
function capSpan(text: string, start: number, end: number, limit: number): SentenceSpan[] {
  if (limit === Infinity || end - start <= limit) return [{ start, end }];

  const spans: SentenceSpan[] = [];
  let cursor = start;
  while (cursor < end) {
    const windowEnd = Math.min(cursor + limit, end);
    let pieceEnd = windowEnd;
    for (let index = windowEnd; index > cursor; index -= 1) {
      if (isWhitespace(text.charAt(index))) {
        pieceEnd = index;
        break;
      }
    }
    while (pieceEnd > cursor && isWhitespace(text.charAt(pieceEnd - 1))) pieceEnd -= 1;
    spans.push({ start: cursor, end: pieceEnd });
    cursor = pieceEnd;
    while (cursor < end && isWhitespace(text.charAt(cursor))) cursor += 1;
  }
  return spans;
}

/**
 * Splits `text` into sentence offsets. A boundary needs a terminator (`.`, `!`, `?`, `…`,
 * possibly repeated) optionally followed by closing quotes/brackets and then whitespace or
 * the end of the text. A single period after a known abbreviation or an initial does not
 * break. Spans are trimmed: the whitespace between sentences is not included. Every span
 * is capped at `options.maxSpanLength` characters (SEG-T04), defaulting to
 * {@link DEFAULT_MAX_SPAN_LENGTH}; pass `Infinity` to disable the cap.
 */
export function splitSentences(text: string, options: SplitSentencesOptions): SentenceSpan[] {
  assertLang(options.lang);
  assertMaxSpanLength(options.maxSpanLength);
  const limit = options.maxSpanLength ?? DEFAULT_MAX_SPAN_LENGTH;

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
      const terminatorsEnd = after;
      while (after < text.length && CLOSERS.has(text.charAt(after))) after += 1;

      if (after >= text.length || isWhitespace(text.charAt(after))) {
        const singlePeriod = terminatorCount === 1 && text.charAt(index) === ".";
        if (singlePeriod && keepsSentenceGoing(text, index, after, options.lang)) {
          index = after;
          continue;
        }
        if (after > terminatorsEnd && closerContinues(text, after)) {
          index = after;
          continue;
        }

        end = after;
        index = after;
        break;
      }

      index = after;
    }

    while (end > start && isWhitespace(text.charAt(end - 1))) end -= 1;
    spans.push(...capSpan(text, start, end, limit));
  }

  return spans;
}
