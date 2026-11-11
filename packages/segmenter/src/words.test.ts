import { describe, expect, it } from "vitest";
import { splitWords, type WordToken } from "./index";

interface WordCase {
  text: string;
  words: string[];
}

// SEG-T01: table-driven cases, written before the implementation.
export const WORD_CASES: WordCase[] = [
  // Portuguese
  { text: "tempo,", words: ["tempo,"] },
  { text: "Olá, mundo!", words: ["Olá,", "mundo!"] },
  { text: "O gato subiu no telhado.", words: ["O", "gato", "subiu", "no", "telhado."] },
  { text: '"tempo"', words: ['"tempo"'] },
  { text: "(parênteses)", words: ["(parênteses)"] },
  { text: 'Ele disse: "vai".', words: ["Ele", "disse:", '"vai".'] },
  { text: "   ", words: [] },
  { text: "", words: [] },
  { text: "Uma\ttabulação", words: ["Uma", "tabulação"] },
  { text: "Linha\nquebrada", words: ["Linha", "quebrada"] },
  { text: "3.14", words: ["3.14"] },
  { text: "1.000,50", words: ["1.000,50"] },
  { text: "Não!", words: ["Não!"] },
  { text: "casa; apartamento: rua.", words: ["casa;", "apartamento:", "rua."] },
  { text: "R$ 50,00", words: ["R$", "50,00"] },
  { text: "e/ou", words: ["e/ou"] },
  { text: "[colchetes]", words: ["[colchetes]"] },
  { text: "  duas  palavras  ", words: ["duas", "palavras"] },
  // English
  { text: "Hello, world!", words: ["Hello,", "world!"] },
  { text: '"quoted"', words: ['"quoted"'] },
  { text: "The (bracketed) word.", words: ["The", "(bracketed)", "word."] },
  { text: "Hello.\nWorld.", words: ["Hello.", "World."] },
  { text: "A.B.C.", words: ["A.B.C."] },
  { text: "100%", words: ["100%"] },
  { text: "word?", words: ["word?"] },
  { text: 'curly "quotes"', words: ["curly", '"quotes"'] },
  { text: "well, then.", words: ["well,", "then."] },
  { text: "A", words: ["A"] },
  { text: "tab\tand\nnewline", words: ["tab", "and", "newline"] },
  { text: "Chapter 1. The start.", words: ["Chapter", "1.", "The", "start."] },
];

function expectValidTokens(text: string, tokens: WordToken[], expected: string[]): void {
  expect(tokens.map((token) => token.text)).toEqual(expected);
  let previousEnd = 0;
  let covered = "";
  for (const token of tokens) {
    expect(token.start).toBeGreaterThanOrEqual(previousEnd);
    expect(token.end).toBeGreaterThan(token.start);
    expect(text.slice(token.start, token.end)).toBe(token.text);
    expect(token.text).toBe(token.text.trim());
    expect(token.text).not.toBe("");
    covered += text.slice(previousEnd, token.start);
    previousEnd = token.end;
  }
  covered += text.slice(previousEnd);
  // Everything outside the tokens is whitespace.
  expect(covered.trim()).toBe("");
}

describe("splitWords", () => {
  it("has at least 30 word table cases", () => {
    expect(WORD_CASES.length).toBeGreaterThanOrEqual(30);
  });

  for (const testCase of WORD_CASES) {
    it(JSON.stringify(testCase.text), () => {
      expectValidTokens(testCase.text, splitWords(testCase.text), testCase.words);
    });
  }

  it("is deterministic for the same input", () => {
    const text = "Uma frase, com pontuação!";
    expect(splitWords(text)).toEqual(splitWords(text));
  });
});
