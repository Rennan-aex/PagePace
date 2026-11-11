import type { WordToken } from "./types";

const WHITESPACE = /\s/u;

function isWhitespace(char: string): boolean {
  return WHITESPACE.test(char);
}

/**
 * Splits `text` into word tokens. A token is a run of non-whitespace characters, so
 * punctuation and quotes stay attached to the word they belong to (`"tempo,"`).
 */
export function splitWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  let index = 0;

  while (index < text.length) {
    while (index < text.length && isWhitespace(text.charAt(index))) index += 1;
    if (index >= text.length) break;

    const start = index;
    while (index < text.length && !isWhitespace(text.charAt(index))) index += 1;
    tokens.push({ text: text.slice(start, index), start, end: index });
  }

  return tokens;
}
