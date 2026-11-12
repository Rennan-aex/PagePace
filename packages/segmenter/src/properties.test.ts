import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_SPAN_LENGTH, type SegmentLang, splitSentences, splitWords } from "./index";

// SEG-T04: simple property tests. For every generated and fixed text the tokens
// must cover the text with monotonic, non-overlapping offsets, the gaps between
// them must be whitespace only, and both functions must be deterministic.

const ALPHABET = ["a", " ", ".", "—", "\n", "á", "Κ", "1"] as const;

/** Every string over `ALPHABET` with length 0..3 (1 + 8 + 64 + 512 = 585 texts). */
function allShortStrings(): string[] {
  const texts: string[] = [""];
  let previousLevel = [""];
  for (let length = 1; length <= 3; length += 1) {
    const level: string[] = [];
    for (const prefix of previousLevel) {
      for (const char of ALPHABET) level.push(prefix + char);
    }
    texts.push(...level);
    previousLevel = level;
  }
  return texts;
}

const FIXED_TEXTS: readonly string[] = [
  " ",
  "\n\t ",
  "...",
  "!?…",
  "abc ",
  "Fim sem pontuação   ",
  "Κ. Σολωμός escreveu o poema.",
  "Κ. Solon wrote the laws.",
  "Ἐν ἀρχῇ ἦν ὁ λόγος. Καὶ τὸ φῶς.",
  "O lema carpe diem ainda vale.",
  "Pliny et al. (1999) reported it.",
  "Veja a pág. 12 do volume 3.",
  "Á. Silva assinou o texto.",
  "Este texto longo não tem nenhuma pontuação e continua por mais de quarenta caracteres seguidos",
  "This long passage contains no punctuation at all and keeps going well beyond forty characters",
  "um dois tres quatro",
  "palavra palavra palavra palavra palavra",
  "a".repeat(1500),
  "x".repeat(5000),
];

const TEXTS: readonly string[] = [...allShortStrings(), ...FIXED_TEXTS];

const LANGS: readonly SegmentLang[] = ["pt", "en"];

function label(text: string): string {
  const short = text.length > 60 ? `${text.slice(0, 57)}...` : text;
  return JSON.stringify(short);
}

function expectWordInvariants(text: string): void {
  const tokens = splitWords(text);
  expect(splitWords(text), `determinism for ${label(text)}`).toEqual(tokens);
  let previousEnd = 0;
  for (const token of tokens) {
    expect(token.start, `monotonic start for ${label(text)}`).toBeGreaterThanOrEqual(previousEnd);
    expect(token.end, `non-empty token for ${label(text)}`).toBeGreaterThan(token.start);
    expect(text.slice(token.start, token.end), `token slice for ${label(text)}`).toBe(token.text);
    expect(token.text, `trimmed token for ${label(text)}`).toBe(token.text.trim());
    expect(text.slice(previousEnd, token.start).trim(), `gap for ${label(text)}`).toBe("");
    previousEnd = token.end;
  }
  expect(text.slice(previousEnd).trim(), `tail for ${label(text)}`).toBe("");
}

function expectSentenceInvariants(text: string, lang: SegmentLang, maxSpanLength?: number): void {
  const spans = splitSentences(text, { lang, maxSpanLength });
  expect(splitSentences(text, { lang, maxSpanLength }), `determinism for ${label(text)}`).toEqual(
    spans,
  );
  let previousEnd = 0;
  for (const span of spans) {
    expect(span.start, `monotonic start for ${label(text)}`).toBeGreaterThanOrEqual(previousEnd);
    expect(span.end, `non-empty span for ${label(text)}`).toBeGreaterThan(span.start);
    const slice = text.slice(span.start, span.end);
    expect(slice, `trimmed span for ${label(text)}`).toBe(slice.trim());
    expect(text.slice(previousEnd, span.start).trim(), `gap for ${label(text)}`).toBe("");
    const limit = maxSpanLength ?? DEFAULT_MAX_SPAN_LENGTH;
    expect(span.end - span.start, `cap for ${label(text)}`).toBeLessThanOrEqual(limit);
    previousEnd = span.end;
  }
  expect(text.slice(previousEnd).trim(), `tail for ${label(text)}`).toBe("");
}

describe("segmenter properties (SEG-T04)", () => {
  it(`splitWords holds its invariants for all ${TEXTS.length} texts`, () => {
    for (const text of TEXTS) expectWordInvariants(text);
  });

  it("splitSentences holds its invariants for all texts (pt and en, default cap)", () => {
    for (const text of TEXTS) {
      for (const lang of LANGS) expectSentenceInvariants(text, lang);
    }
  });

  it("splitSentences holds its invariants with a small maxSpanLength (pt and en)", () => {
    for (const text of TEXTS) {
      for (const lang of LANGS) expectSentenceInvariants(text, lang, 8);
    }
  });
});
