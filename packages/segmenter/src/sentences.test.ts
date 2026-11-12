import { describe, expect, it } from "vitest";
import { EN_ABBREVIATIONS } from "./abbreviations/en";
import { PT_ABBREVIATIONS } from "./abbreviations/pt";
import {
  DEFAULT_MAX_SPAN_LENGTH,
  type SegmentLang,
  type SentenceSpan,
  splitSentences,
} from "./index";

interface SentenceCase {
  lang: SegmentLang;
  text: string;
  sentences: string[];
  /** SEG-T04: optional cap (in characters) applied to every sentence span. */
  maxSpanLength?: number;
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
  // SEG-T02: abbreviations (pt and en) never end a sentence.
  { lang: "pt", text: "O Sr. Silva chegou ontem.", sentences: ["O Sr. Silva chegou ontem."] },
  {
    lang: "pt",
    text: "A Sra. Maria e o Dr. João vieram.",
    sentences: ["A Sra. Maria e o Dr. João vieram."],
  },
  {
    lang: "pt",
    text: "Ele falou com o Prof. Almeida e com a Dra. Ana.",
    sentences: ["Ele falou com o Prof. Almeida e com a Dra. Ana."],
  },
  {
    lang: "pt",
    text: "Leia o cap. 3 e depois a p. 25.",
    sentences: ["Leia o cap. 3 e depois a p. 25."],
  },
  {
    lang: "pt",
    text: "Veja as pp. 10-12 do vol. 2.",
    sentences: ["Veja as pp. 10-12 do vol. 2."],
  },
  {
    lang: "pt",
    text: "Compramos frutas, legumes, etc. e voltamos.",
    sentences: ["Compramos frutas, legumes, etc. e voltamos."],
  },
  {
    lang: "pt",
    text: "Isso acontece, por ex. quando chove.",
    sentences: ["Isso acontece, por ex. quando chove."],
  },
  { lang: "pt", text: "Fale com o Dr.", sentences: ["Fale com o Dr."] },
  { lang: "en", text: "Mr. Smith arrived late.", sentences: ["Mr. Smith arrived late."] },
  { lang: "en", text: "Mrs. Jones met Dr. Brown.", sentences: ["Mrs. Jones met Dr. Brown."] },
  { lang: "en", text: "See e.g. the first figure.", sentences: ["See e.g. the first figure."] },
  {
    lang: "en",
    text: "Use the same value, i.e. the first one.",
    sentences: ["Use the same value, i.e. the first one."],
  },
  { lang: "en", text: "It was cats vs. dogs.", sentences: ["It was cats vs. dogs."] },
  { lang: "en", text: "Fig. 3 shows the trend.", sentences: ["Fig. 3 shows the trend."] },
  {
    lang: "en",
    text: "Read chap. 4 before tomorrow.",
    sentences: ["Read chap. 4 before tomorrow."],
  },
  {
    lang: "en",
    text: "Vol. 2 was published. Then it stopped.",
    sentences: ["Vol. 2 was published.", "Then it stopped."],
  },
  // SEG-T02: initials stay inside the sentence.
  { lang: "en", text: "J. S. Mill wrote it.", sentences: ["J. S. Mill wrote it."] },
  { lang: "pt", text: "J. Silva assinou o texto.", sentences: ["J. Silva assinou o texto."] },
  { lang: "en", text: "Ask Dr. Who about it.", sentences: ["Ask Dr. Who about it."] },
  // SEG-T02: numbers and decimals never break.
  {
    lang: "pt",
    text: "O valor é 3.14 e o total é 1.000,50.",
    sentences: ["O valor é 3.14 e o total é 1.000,50."],
  },
  {
    lang: "pt",
    text: "Custou R$ 1.000. O troco ficou.",
    sentences: ["Custou R$ 1.000.", "O troco ficou."],
  },
  {
    lang: "en",
    text: "The price is $1,000.50 today.",
    sentences: ["The price is $1,000.50 today."],
  },
  {
    lang: "en",
    text: "The atom is 3.14 units wide.",
    sentences: ["The atom is 3.14 units wide."],
  },
  // SEG-T02: dialogue dashes.
  {
    lang: "pt",
    text: "— Disse ele. — Você vem?",
    sentences: ["— Disse ele.", "— Você vem?"],
  },
  {
    lang: "en",
    text: "— She left. — Did you see it?",
    sentences: ["— She left.", "— Did you see it?"],
  },
  // SEG-T02: a sentence end followed by closing quotes or brackets.
  {
    lang: "pt",
    text: 'Ele disse: "Vou. Depois volto."',
    sentences: ['Ele disse: "Vou.', 'Depois volto."'],
  },
  {
    lang: "pt",
    text: "Ela respondeu (sem pensar). Ele insistiu.",
    sentences: ["Ela respondeu (sem pensar).", "Ele insistiu."],
  },
  {
    lang: "en",
    text: "He waited (for hours?). She never came.",
    sentences: ["He waited (for hours?).", "She never came."],
  },
  // SEG-T04: mixed script — a Greek initial must not end the sentence (pt).
  {
    lang: "pt",
    text: "Κ. Σολωμός escreveu o poema.",
    sentences: ["Κ. Σολωμός escreveu o poema."],
  },
  {
    lang: "pt",
    text: "O termo grego ἀρχή significa início.",
    sentences: ["O termo grego ἀρχή significa início."],
  },
  // SEG-T04: mixed script — a Greek initial must not end the sentence (en).
  { lang: "en", text: "Κ. Solon wrote the laws.", sentences: ["Κ. Solon wrote the laws."] },
  {
    lang: "en",
    text: "Ἐν ἀρχῇ ἦν ὁ λόγος. Καὶ τὸ φῶς.",
    sentences: ["Ἐν ἀρχῇ ἦν ὁ λόγος.", "Καὶ τὸ φῶς."],
  },
  // SEG-T04: Latin excerpts stay inside the sentence.
  {
    lang: "pt",
    text: "O lema carpe diem ainda vale.",
    sentences: ["O lema carpe diem ainda vale."],
  },
  {
    lang: "pt",
    text: "Sic transit gloria mundi, disse o novato.",
    sentences: ["Sic transit gloria mundi, disse o novato."],
  },
  {
    lang: "en",
    text: "The motto carpe diem still holds.",
    sentences: ["The motto carpe diem still holds."],
  },
  {
    lang: "en",
    text: "Pliny et al. (1999) reported it.",
    sentences: ["Pliny et al. (1999) reported it."],
  },
  // SEG-T04: accented abbreviation and accented initial (pt).
  {
    lang: "pt",
    text: "Veja a pág. 12 do volume 3.",
    sentences: ["Veja a pág. 12 do volume 3."],
  },
  { lang: "pt", text: "Á. Silva assinou o texto.", sentences: ["Á. Silva assinou o texto."] },
  // SEG-T04: punctuation-only text is one span (pt and en).
  { lang: "pt", text: "...", sentences: ["..."] },
  { lang: "en", text: "!?…", sentences: ["!?…"] },
  // SEG-T04: trailing whitespace on a span without terminator is trimmed.
  { lang: "en", text: "abc ", sentences: ["abc"] },
  { lang: "pt", text: "Fim sem pontuação   ", sentences: ["Fim sem pontuação"] },
  // SEG-T04: long text without punctuation stays whole (under the default cap).
  {
    lang: "pt",
    text: "Este texto longo não tem nenhuma pontuação e continua por mais de quarenta caracteres seguidos",
    sentences: [
      "Este texto longo não tem nenhuma pontuação e continua por mais de quarenta caracteres seguidos",
    ],
  },
  {
    lang: "en",
    text: "This long passage contains no punctuation at all and keeps going well beyond forty characters",
    sentences: [
      "This long passage contains no punctuation at all and keeps going well beyond forty characters",
    ],
  },
  // SEG-T04: maxSpanLength caps every span.
  {
    lang: "pt",
    text: "um dois tres quatro",
    sentences: ["um dois", "tres", "quatro"],
    maxSpanLength: 10,
  },
  {
    lang: "pt",
    text: "palavra palavra palavra palavra palavra",
    sentences: ["palavra palavra", "palavra palavra", "palavra"],
    maxSpanLength: 16,
  },
  { lang: "en", text: "abcdefghij", sentences: ["abcd", "efgh", "ij"], maxSpanLength: 4 },
  {
    lang: "en",
    text: "alpha beta gamma",
    sentences: ["alpha beta", "gamma"],
    maxSpanLength: 10,
  },
  // SEG-T05: the eval corpus needed the address abbreviations `snr.`/`snra.` (pt).
  {
    lang: "pt",
    text: "O snr. Silva chegou tarde.",
    sentences: ["O snr. Silva chegou tarde."],
  },
  {
    lang: "pt",
    text: "A snra. Costa esperou na sala.",
    sentences: ["A snra. Costa esperou na sala."],
  },
  // SEG-T05: a lowercase attribution after a closing quote continues the sentence.
  {
    lang: "pt",
    text: 'Ele perguntou: "Vamos?" e eu concordei.',
    sentences: ['Ele perguntou: "Vamos?" e eu concordei.'],
  },
  {
    lang: "pt",
    text: '"Já acabou." disse ela, sem olhar.',
    sentences: ['"Já acabou." disse ela, sem olhar.'],
  },
  // SEG-T05: an uppercase word after the closer still starts a new sentence.
  { lang: "pt", text: '"Fim." Ele saiu.', sentences: ['"Fim."', "Ele saiu."] },
  {
    lang: "en",
    text: '"Are you sure?" she asked.',
    sentences: ['"Are you sure?" she asked.'],
  },
  {
    lang: "en",
    text: 'He said, "Stop." and left the room.',
    sentences: ['He said, "Stop." and left the room.'],
  },
  { lang: "en", text: '"Stop." He left.', sentences: ['"Stop."', "He left."] },
  { lang: "en", text: '"Is it done?" "Yes."', sentences: ['"Is it done?"', '"Yes."'] },
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
  it("has at least 60 sentence table cases", () => {
    expect(SENTENCE_CASES.length).toBeGreaterThanOrEqual(60);
  });

  it("covers every SEG-T02 category in both languages", () => {
    const categories: Record<string, RegExp> = {
      abbreviations: /\b(Sr|Sra|Dr|Dra|Prof|etc|cap|pp|e\.g|i\.e|vs|Fig|chap)\./u,
      initials: /\b[A-Z]\. [A-Z]/u,
      decimals: /\d\.\d/u,
      dialogue: /— /u,
    };
    for (const [name, pattern] of Object.entries(categories)) {
      const langs = new Set(
        SENTENCE_CASES.filter((testCase) => pattern.test(testCase.text)).map(
          (testCase) => testCase.lang,
        ),
      );
      expect({ name, langs: [...langs].sort() }).toEqual({ name, langs: ["en", "pt"] });
    }
  });

  it("covers every SEG-T04 category in both languages", () => {
    const categories: Record<string, (testCase: SentenceCase) => boolean> = {
      greekScript: (testCase) => /\p{Script=Greek}/u.test(testCase.text),
      latinExcerpt: (testCase) => /\b(?:carpe diem|sic transit|et al)\b/iu.test(testCase.text),
      punctuationOnly: (testCase) => /^[^\p{L}\p{N}\s]+$/u.test(testCase.text),
      emptyOrWhitespace: (testCase) => /^\s*$/u.test(testCase.text),
      longWithoutPunctuation: (testCase) => /^[^.!?…]{40,}$/u.test(testCase.text),
      cappedSpan: (testCase) => testCase.maxSpanLength !== undefined,
    };
    for (const [name, matches] of Object.entries(categories)) {
      const langs = new Set(SENTENCE_CASES.filter(matches).map((testCase) => testCase.lang));
      expect({ name, langs: [...langs].sort() }).toEqual({ name, langs: ["en", "pt"] });
    }
  });

  it("covers every SEG-T05 category where it applies", () => {
    const categories: Record<
      string,
      { matches: (testCase: SentenceCase) => boolean; langs: string[] }
    > = {
      closerContinuation: {
        matches: (testCase) => /[.!?…]["'”’)\]]\s+\p{Ll}/u.test(testCase.text),
        langs: ["en", "pt"],
      },
      addressAbbreviation: {
        matches: (testCase) => /\bsnra?\./u.test(testCase.text),
        langs: ["pt"],
      },
    };
    for (const [name, { matches, langs }] of Object.entries(categories)) {
      const found = new Set(SENTENCE_CASES.filter(matches).map((testCase) => testCase.lang));
      expect({ name, langs: [...found].sort() }).toEqual({ name, langs: [...langs].sort() });
    }
  });

  it("keeps the abbreviation data files easy to extend", () => {
    for (const list of [PT_ABBREVIATIONS, EN_ABBREVIATIONS]) {
      expect(list.length).toBeGreaterThan(10);
      expect(new Set(list).size).toBe(list.length);
      for (const entry of list) {
        expect(entry).toBe(entry.toLowerCase());
        expect(entry).not.toMatch(/^\.|\.$/u);
        expect(entry.trim()).toBe(entry);
      }
    }
  });

  for (const testCase of SENTENCE_CASES) {
    it(`${testCase.lang}: ${JSON.stringify(testCase.text)}`, () => {
      const spans = splitSentences(testCase.text, {
        lang: testCase.lang,
        maxSpanLength: testCase.maxSpanLength,
      });
      expectValidSpans(testCase.text, spans, testCase.sentences);
      if (testCase.maxSpanLength !== undefined) {
        for (const span of spans) {
          expect(span.end - span.start).toBeLessThanOrEqual(testCase.maxSpanLength);
        }
      }
    });
  }

  it("caps every span at the default maxSpanLength of 1000 characters", () => {
    expect(DEFAULT_MAX_SPAN_LENGTH).toBe(1000);
    const text = "a".repeat(1200);
    expect(splitSentences(text, { lang: "en" })).toEqual([
      { start: 0, end: 1000 },
      { start: 1000, end: 1200 },
    ]);
  });

  it("accepts Infinity to disable the span cap", () => {
    const text = "a".repeat(1500);
    expect(splitSentences(text, { lang: "en", maxSpanLength: Infinity })).toEqual([
      { start: 0, end: 1500 },
    ]);
  });

  it("rejects an invalid maxSpanLength with RangeError", () => {
    expect(() => splitSentences("Olá.", { lang: "pt", maxSpanLength: 0 })).toThrow(RangeError);
    expect(() => splitSentences("Olá.", { lang: "pt", maxSpanLength: -3 })).toThrow(RangeError);
    expect(() => splitSentences("Olá.", { lang: "pt", maxSpanLength: 2.5 })).toThrow(RangeError);
  });

  it("is deterministic for the same input", () => {
    const text = "Uma frase. Outra frase! E a última?";
    expect(splitSentences(text, { lang: "pt" })).toEqual(splitSentences(text, { lang: "pt" }));
  });

  it("rejects an unknown language with RangeError", () => {
    // @ts-expect-error - deliberately invalid at runtime.
    expect(() => splitSentences("Olá.", { lang: "fr" })).toThrow(RangeError);
  });
});
