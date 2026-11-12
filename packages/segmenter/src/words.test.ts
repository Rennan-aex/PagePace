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
  // SEG-T03: compound hyphens stay one word (pt)
  { text: "guarda-chuva", words: ["guarda-chuva"] },
  { text: "O guarda-chuva abriu.", words: ["O", "guarda-chuva", "abriu."] },
  { text: "segunda-feira à tarde", words: ["segunda-feira", "à", "tarde"] },
  // SEG-T03: compound hyphens stay one word (en)
  { text: "well-known", words: ["well-known"] },
  { text: "A state-of-the-art design.", words: ["A", "state-of-the-art", "design."] },
  // SEG-T03: apostrophes stay one word
  { text: "d'água corrente", words: ["d'água", "corrente"] },
  { text: "d’água potável", words: ["d’água", "potável"] },
  { text: "don't", words: ["don't"] },
  { text: "She doesn't know.", words: ["She", "doesn't", "know."] },
  { text: "don’t", words: ["don’t"] },
  // SEG-T03: numbers with separators stay one word
  { text: "10.000.000 de reais", words: ["10.000.000", "de", "reais"] },
  { text: "1,000.50", words: ["1,000.50"] },
  { text: "12,345.67 in cash", words: ["12,345.67", "in", "cash"] },
  // SEG-T03: the em dash separates even without spaces
  { text: "ele—disse—ela", words: ["ele", "—", "disse", "—", "ela"] },
  { text: "2020—2024", words: ["2020", "—", "2024"] },
  { text: "year—month—day", words: ["year", "—", "month", "—", "day"] },
  { text: "fim—", words: ["fim", "—"] },
  { text: "—início", words: ["—", "início"] },
  { text: "a — b", words: ["a", "—", "b"] },
  { text: "—", words: ["—"] },
  // SEG-T03: URLs and e-mails are one token
  { text: "Veja https://exemplo.com/path?q=1.", words: ["Veja", "https://exemplo.com/path?q=1."] },
  {
    text: "escreva para contato@exemplo.com.br.",
    words: ["escreva", "para", "contato@exemplo.com.br."],
  },
  { text: "https://meu-site.org.br/a-b", words: ["https://meu-site.org.br/a-b"] },
  {
    text: "Visit https://example.com/docs#intro",
    words: ["Visit", "https://example.com/docs#intro"],
  },
  { text: "Mail john.doe@example.com now.", words: ["Mail", "john.doe@example.com", "now."] },
  { text: "<https://example.com/a-b>", words: ["<https://example.com/a-b>"] },
  // SEG-T04: Greek script text
  { text: "Καλημέρα κόσμε", words: ["Καλημέρα", "κόσμε"] },
  { text: "λόγος, ἀρχή.", words: ["λόγος,", "ἀρχή."] },
  // SEG-T04: Latin excerpts
  { text: "carpe diem", words: ["carpe", "diem"] },
  { text: "Sic transit gloria mundi.", words: ["Sic", "transit", "gloria", "mundi."] },
  // SEG-T04: punctuation-only text
  { text: "...", words: ["..."] },
  { text: "!?…", words: ["!?…"] },
  // SEG-T04: long text without punctuation
  {
    text: "Este texto longo não tem nenhuma pontuação e continua por mais de quarenta caracteres seguidos",
    words: [
      "Este",
      "texto",
      "longo",
      "não",
      "tem",
      "nenhuma",
      "pontuação",
      "e",
      "continua",
      "por",
      "mais",
      "de",
      "quarenta",
      "caracteres",
      "seguidos",
    ],
  },
  {
    text: "This long passage contains no punctuation at all and keeps going well beyond forty characters",
    words: [
      "This",
      "long",
      "passage",
      "contains",
      "no",
      "punctuation",
      "at",
      "all",
      "and",
      "keeps",
      "going",
      "well",
      "beyond",
      "forty",
      "characters",
    ],
  },
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
  it("has at least 50 word table cases", () => {
    expect(WORD_CASES.length).toBeGreaterThanOrEqual(50);
  });

  it("covers every SEG-T03 category", () => {
    const categories: Record<string, RegExp> = {
      compoundHyphens: /\p{L}-\p{L}/u,
      apostrophes: /['’]/u,
      numberSeparators: /\d[.,]\d/u,
      emDashSeparator: /\S—\S/u,
      urlsEmails: /(?:https?:\/\/|[\w.+-]+@[\w-]+\.\w)/u,
    };
    for (const [name, pattern] of Object.entries(categories)) {
      const count = WORD_CASES.filter((testCase) => pattern.test(testCase.text)).length;
      expect(count, `category ${name}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("covers every SEG-T04 category", () => {
    const categories: Record<string, RegExp> = {
      greekScript: /\p{Script=Greek}/u,
      latinExcerpt: /\b(?:carpe diem|sic transit)\b/iu,
      punctuationOnly: /^[^\p{L}\p{N}\s]+$/u,
      emptyOrWhitespace: /^\s*$/u,
      longWithoutPunctuation: /^[^.!?…]{40,}$/u,
    };
    for (const [name, pattern] of Object.entries(categories)) {
      const count = WORD_CASES.filter((testCase) => pattern.test(testCase.text)).length;
      expect(count, `category ${name}`).toBeGreaterThanOrEqual(2);
    }
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
