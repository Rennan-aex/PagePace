import { describe, expect, it } from "vitest";
import { type SegmentLang, type SentenceSpan, splitSentences } from "./index";

interface SentenceCase {
  lang: SegmentLang;
  text: string;
  sentences: string[];
}

// SEG-T01: table-driven cases, written before the implementation.
export const SENTENCE_CASES: SentenceCase[] = [
  // Portuguese
  { lang: "pt", text: "Olá mundo.", sentences: ["Olá mundo."] },
  { lang: "pt", text: "Uma frase. Outra frase.", sentences: ["Uma frase.", "Outra frase."] },
  {
    lang: "pt",
    text: "Que dia bonito! Vamos sair?",
    sentences: ["Que dia bonito!", "Vamos sair?"],
  },
  {
    lang: "pt",
    text: "Ele perguntou: você vem? Eu respondi que sim.",
    sentences: ["Ele perguntou: você vem?", "Eu respondi que sim."],
  },
  { lang: "pt", text: "Texto sem ponto final", sentences: ["Texto sem ponto final"] },
  { lang: "pt", text: "", sentences: [] },
  { lang: "pt", text: "   ", sentences: [] },
  { lang: "pt", text: "Só pontuação?!", sentences: ["Só pontuação?!"] },
  { lang: "pt", text: "Fim... Começo.", sentences: ["Fim...", "Começo."] },
  { lang: "pt", text: "Ela pensou… e desistiu.", sentences: ["Ela pensou…", "e desistiu."] },
  {
    lang: "pt",
    text: "Primeira. Segunda! Terceira?",
    sentences: ["Primeira.", "Segunda!", "Terceira?"],
  },
  {
    lang: "pt",
    text: "A vírgula, o ponto e a interrogação? Tudo aqui.",
    sentences: ["A vírgula, o ponto e a interrogação?", "Tudo aqui."],
  },
  {
    lang: "pt",
    text: 'Ele disse "vai". Ela ficou.',
    sentences: ['Ele disse "vai".', "Ela ficou."],
  },
  {
    lang: "pt",
    text: "'Tudo bem.' Depois eu conto.",
    sentences: ["'Tudo bem.'", "Depois eu conto."],
  },
  { lang: "pt", text: "(Ele saiu.) Ela ficou.", sentences: ["(Ele saiu.)", "Ela ficou."] },
  {
    lang: "pt",
    text: "Parágrafo\ncom quebra de linha. Segunda frase.",
    sentences: ["Parágrafo\ncom quebra de linha.", "Segunda frase."],
  },
  {
    lang: "pt",
    text: "Ele gritou!!! Ninguém ouviu.",
    sentences: ["Ele gritou!!!", "Ninguém ouviu."],
  },
  {
    lang: "pt",
    text: "  Espaços antes.  Espaços depois.  ",
    sentences: ["Espaços antes.", "Espaços depois."],
  },
  {
    lang: "pt",
    text: "Capítulo 1. O começo.",
    sentences: ["Capítulo 1.", "O começo."],
  },
  {
    lang: "pt",
    text: "Ele chegou; ela saiu. Fim da história.",
    sentences: ["Ele chegou; ela saiu.", "Fim da história."],
  },
  // English
  { lang: "en", text: "Hello world.", sentences: ["Hello world."] },
  {
    lang: "en",
    text: "First sentence. Second sentence.",
    sentences: ["First sentence.", "Second sentence."],
  },
  { lang: "en", text: "Is it ready? Yes!", sentences: ["Is it ready?", "Yes!"] },
  { lang: "en", text: "Wait... what happened?", sentences: ["Wait...", "what happened?"] },
  {
    lang: "en",
    text: "A list: one, two, three. Done.",
    sentences: ["A list: one, two, three.", "Done."],
  },
  { lang: "en", text: "No terminator here", sentences: ["No terminator here"] },
  { lang: "en", text: "", sentences: [] },
  {
    lang: "en",
    text: "Multiple   spaces. Between   sentences.",
    sentences: ["Multiple   spaces.", "Between   sentences."],
  },
  { lang: "en", text: 'He said "go". She stayed.', sentences: ['He said "go".', "She stayed."] },
  {
    lang: "en",
    text: "It works (really). Trust me.",
    sentences: ["It works (really).", "Trust me."],
  },
  {
    lang: "en",
    text: "Text\nbroken\nacross lines. Next one.",
    sentences: ["Text\nbroken\nacross lines.", "Next one."],
  },
  { lang: "en", text: "Wow?!", sentences: ["Wow?!"] },
  {
    lang: "en",
    text: "Ends with ellipsis… Then continues.",
    sentences: ["Ends with ellipsis…", "Then continues."],
  },
  { lang: "en", text: '"Punctuation only !!!"', sentences: ['"Punctuation only !!!"'] },
  {
    lang: "en",
    text: "One. Two. Three. Four.",
    sentences: ["One.", "Two.", "Three.", "Four."],
  },
  { lang: "en", text: "Trailing spaces.   ", sentences: ["Trailing spaces."] },
  {
    lang: "en",
    text: "Uppercase and lowercase. ALL CAPS.",
    sentences: ["Uppercase and lowercase.", "ALL CAPS."],
  },
  { lang: "en", text: "The end.", sentences: ["The end."] },
  { lang: "en", text: "Chapter 2. The middle.", sentences: ["Chapter 2.", "The middle."] },
  {
    lang: "en",
    text: "He arrived; she left. The story ends.",
    sentences: ["He arrived; she left.", "The story ends."],
  },
];

function expectValidSpans(text: string, spans: SentenceSpan[], expected: string[]): void {
  expect(spans.map((span) => text.slice(span.start, span.end))).toEqual(expected);
  let previousEnd = 0;
  let covered = "";
  for (const span of spans) {
    expect(span.start).toBeGreaterThanOrEqual(previousEnd);
    expect(span.end).toBeGreaterThan(span.start);
    expect(text.slice(span.start, span.end)).toBe(text.slice(span.start, span.end).trim());
    covered += text.slice(previousEnd, span.start);
    previousEnd = span.end;
  }
  covered += text.slice(previousEnd);
  // Everything outside the sentence spans is whitespace.
  expect(covered.trim()).toBe("");
}

describe("splitSentences", () => {
  it("has at least 40 sentence table cases", () => {
    expect(SENTENCE_CASES.length).toBeGreaterThanOrEqual(40);
  });

  for (const testCase of SENTENCE_CASES) {
    it(`${testCase.lang}: ${JSON.stringify(testCase.text)}`, () => {
      expectValidSpans(
        testCase.text,
        splitSentences(testCase.text, { lang: testCase.lang }),
        testCase.sentences,
      );
    });
  }

  it("is deterministic for the same input", () => {
    const text = "Uma frase. Outra frase! E a última?";
    expect(splitSentences(text, { lang: "pt" })).toEqual(splitSentences(text, { lang: "pt" }));
  });

  it("rejects an unknown language with RangeError", () => {
    // @ts-expect-error - deliberately invalid at runtime.
    expect(() => splitSentences("Olá.", { lang: "fr" })).toThrow(RangeError);
  });
});
