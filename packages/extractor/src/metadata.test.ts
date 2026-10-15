import type { Block } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import {
  AUTHOR_MAX_COUNT,
  buildMetadata,
  detectLanguage,
  foldForLanguage,
  LANGUAGE_MIN_HITS,
  LANGUAGE_MIN_SAMPLE_CHARS,
  LANGUAGE_MIXED_MIN_HITS,
  LANGUAGE_STOPWORDS_PT,
  langHintOf,
  sanitizePdfTitle,
  splitPdfAuthors,
  TITLE_MAX_CHARS,
} from "./metadata";

const PT_TEXT =
  "O livro que ela comprou na cidade era muito interessante porque contava a história " +
  "de uma família que vivia no campo. A autora descreve os personagens com cuidado " +
  "e mostra como eles mudam ao longo dos anos. Não é um romance simples, mas sim um " +
  "estudo sobre a memória e o tempo, escrito com muita atenção aos detalhes do cotidiano.";

const EN_TEXT =
  "The book that she bought in the city was very interesting because it told the story " +
  "of a family who lived in the countryside. The author describes the characters with care " +
  "and shows how they change over the years. It is not a simple novel, but a study of memory " +
  "and time, written with great attention to the details of everyday life.";

const MIXED_TEXT =
  "The book that she bought in the city told the story of a family. The author describes " +
  "the characters with care and shows how they change over the years. O livro que ela " +
  "comprou na cidade contava a história de uma família. A autora descreve os personagens " +
  "com cuidado e mostra como eles mudam ao longo dos anos. It is not a simple novel but " +
  "a study of memory and time. Não é um romance simples, mas um estudo sobre a memória. " +
  "Quando ela chegou em casa, mostrou o livro para a mãe. Não tinha pressa, mas queria " +
  "ler tudo muito depressa, porque o livro era mesmo bom de princípio ao fim.";

function paragraph(text: string): Block {
  return {
    id: "p0-b0-00000000",
    kind: "paragraph",
    runs: [{ text }],
    origin: { pageFrom: 0, pageTo: 0 },
    confidence: 0.9,
    flags: [],
  };
}

describe("detectLanguage", () => {
  it("recognizes Portuguese prose by its stopwords", () => {
    expect(detectLanguage(PT_TEXT)).toBe("pt");
  });

  it("recognizes English prose by its stopwords", () => {
    expect(detectLanguage(EN_TEXT)).toBe("en");
  });

  it("calls a document mixed when both languages are strong and close", () => {
    expect(detectLanguage(MIXED_TEXT)).toBe("mixed");
  });

  it("keeps the dominant language when the other one only quotes", () => {
    const quote =
      ' "It was the best of times," he said, and the audience fell silent ' +
      "before the reading continued.";
    expect(detectLanguage(`${PT_TEXT}${quote}`, undefined)).toBe("pt");
  });

  it("matches folded words, so accents never hide a stopword", () => {
    expect(foldForLanguage("Não")).toBe("nao");
    expect(LANGUAGE_STOPWORDS_PT.has(foldForLanguage("você"))).toBe(true);
    expect(detectLanguage(`${PT_TEXT} Você não está aqui, não é verdade?`, undefined)).toBe("pt");
  });

  it("falls back to the PDF /Lang hint when the sample is too small", () => {
    expect(detectLanguage("Short text.", "pt-BR")).toBe("pt");
    expect(detectLanguage("Short text.", "en-US")).toBe("en");
  });

  it("falls back to the PDF /Lang hint when there are too few hits", () => {
    const weak = "A paper about philosophy and physics. ".repeat(4);
    expect(detectLanguage(weak, "en")).toBe("en");
    expect(detectLanguage(weak)).toBe("unknown");
  });

  it("returns unknown when there is neither text nor hint", () => {
    expect(detectLanguage("")).toBe("unknown");
    expect(detectLanguage("Short text.")).toBe("unknown");
    expect(detectLanguage(PT_TEXT.slice(0, LANGUAGE_MIN_SAMPLE_CHARS - 1))).toBe("unknown");
  });

  it("ignores hints of other languages", () => {
    expect(langHintOf("fr-FR")).toBeUndefined();
    expect(detectLanguage("Short text.", "fr-FR")).toBe("unknown");
  });

  it("is deterministic", () => {
    expect(detectLanguage(MIXED_TEXT)).toBe(detectLanguage(MIXED_TEXT));
  });

  it("exposes the named thresholds", () => {
    expect(LANGUAGE_MIN_SAMPLE_CHARS).toBeGreaterThan(0);
    expect(LANGUAGE_MIN_HITS).toBeGreaterThan(0);
    expect(LANGUAGE_MIXED_MIN_HITS).toBeGreaterThanOrEqual(LANGUAGE_MIN_HITS);
  });
});

describe("langHintOf", () => {
  it("reads the primary subtag of pt and en values", () => {
    expect(langHintOf("pt")).toBe("pt");
    expect(langHintOf("pt-BR")).toBe("pt");
    expect(langHintOf("en_US")).toBe("en");
    expect(langHintOf(" EN ")).toBe("en");
    // ISO 639-2 aliases show up in real /Lang values (n1-en-lostworld: "eng").
    expect(langHintOf("eng")).toBe("en");
    expect(langHintOf("por")).toBe("pt");
  });

  it("rejects anything else", () => {
    expect(langHintOf(undefined)).toBeUndefined();
    expect(langHintOf("de-DE")).toBeUndefined();
    expect(langHintOf("")).toBeUndefined();
  });
});

describe("sanitizePdfTitle", () => {
  it("keeps a real title and collapses its whitespace", () => {
    expect(sanitizePdfTitle("  O Mundo   de Sofia  ", "sofia.pdf")).toBe("O Mundo de Sofia");
  });

  it("drops blank and missing values", () => {
    expect(sanitizePdfTitle(undefined)).toBeUndefined();
    expect(sanitizePdfTitle("")).toBeUndefined();
    expect(sanitizePdfTitle("   ")).toBeUndefined();
  });

  it("drops titles that are just the file name (producer noise)", () => {
    expect(sanitizePdfTitle("book.pdf", "book.pdf")).toBeUndefined();
    expect(sanitizePdfTitle("BOOK", "book.pdf")).toBeUndefined();
  });

  it("drops URL-shaped titles (a download location is not a title)", () => {
    expect(
      sanitizePdfTitle("file://C:/Temp/Sophie's%20World%20-%20Jostien%20", "sofia.pdf"),
    ).toBeUndefined();
    expect(sanitizePdfTitle("https://example.org/book", "book.pdf")).toBeUndefined();
  });

  it("drops overlong titles", () => {
    expect(sanitizePdfTitle("x".repeat(TITLE_MAX_CHARS + 1))).toBeUndefined();
    expect(sanitizePdfTitle("x".repeat(TITLE_MAX_CHARS))).toBe("x".repeat(TITLE_MAX_CHARS));
  });
});

describe("splitPdfAuthors", () => {
  it("splits on semicolons and trims", () => {
    expect(splitPdfAuthors("Ana Silva;  Beto  ; Carla")).toEqual(["Ana Silva", "Beto", "Carla"]);
  });

  it("drops blanks and rejects empty values", () => {
    expect(splitPdfAuthors(";; Ana ; ")).toEqual(["Ana"]);
    expect(splitPdfAuthors("")).toBeUndefined();
    expect(splitPdfAuthors(undefined)).toBeUndefined();
  });

  it("caps the number of authors", () => {
    const many = Array.from({ length: AUTHOR_MAX_COUNT + 5 }, (_, i) => `A${i}`).join(";");
    expect(splitPdfAuthors(many)).toHaveLength(AUTHOR_MAX_COUNT);
  });
});

describe("buildMetadata", () => {
  const source = {
    fileName: "sofia.pdf",
    sha256: "a".repeat(64),
    pageCount: 1,
    tagged: false,
  };

  it("fills language from the text and title/authors from the PDF claims", () => {
    const metadata = buildMetadata([paragraph(PT_TEXT)], {
      ...source,
      title: "O Mundo de Sofia",
      author: "Jostein Gaarder",
      lang: "pt-BR",
    });
    expect(metadata).toEqual({
      title: "O Mundo de Sofia",
      authors: ["Jostein Gaarder"],
      language: "pt",
    });
  });

  it("leaves title and authors absent when the PDF says nothing usable", () => {
    expect(buildMetadata([paragraph(EN_TEXT)], source)).toEqual({ language: "en" });
    expect(
      buildMetadata([paragraph(EN_TEXT)], { ...source, title: "sofia.pdf", author: " ; " }),
    ).toEqual({ language: "en" });
  });

  it("prefers the text over a wrong /Lang hint", () => {
    expect(buildMetadata([paragraph(PT_TEXT)], { ...source, lang: "en-US" })).toEqual({
      language: "pt",
    });
  });
});
