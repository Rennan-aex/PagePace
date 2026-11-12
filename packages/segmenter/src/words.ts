import type { WordToken } from "./types";

const WHITESPACE = /\s/u;
const EM_DASH = "—";

function isWhitespace(char: string): boolean {
  return WHITESPACE.test(char);
}

/**
 * Splits `text` into word tokens. A token is a run of non-whitespace characters, so
 * punctuation and quotes stay attached to the word they belong to (`"tempo,"`);
 * compound hyphens (`guarda-chuva`), apostrophes (`don't`) and number separators
 * (`1.000,50`) never break a token. The em dash `—` is the exception: it is a
 * separator, so `ele—disse` yields `ele`, `—`, `disse`. URLs and e-mails contain
 * no whitespace and stay one token.
 */
export function splitWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);
    if (isWhitespace(char)) {
      index += 1;
      continue;
    }

    const start = index;
    if (char === EM_DASH) {
      index += 1;
    } else {
      while (
        index < text.length &&
        !isWhitespace(text.charAt(index)) &&
        text.charAt(index) !== EM_DASH
      ) {
        index += 1;
      }
    }
    tokens.push({ text: text.slice(start, index), start, end: index });
  }

  return tokens;
}
