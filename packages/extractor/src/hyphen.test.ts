// E3-T03: line-end hyphenation. A word the typesetter broke with a hyphen is
// glued back for the reader; legitimate hyphens (compounds, enclisis, ranges)
// keep theirs; a proper noun after the hyphen is kept but flagged uncertain.
// Every rule here comes from the pt/en corpus reading recorded in ADR-047.
import type { RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import {
  HYPHEN_UNCERTAIN_CONFIDENCE,
  hyphenJoinDecision,
  hyphenSiteBetween,
  joinHyphenatedLines,
  joinHyphenatedText,
  paragraphHyphenText,
  UNCERTAIN_HYPHEN_FLAG,
} from "./hyphen";
import type { TextLine } from "./lines";

describe("hyphenJoinDecision", () => {
  it("joins a broken word in running prose (the default)", () => {
    expect(hyphenJoinDecision("pala", "vra")).toBe("join");
    expect(hyphenJoinDecision("con", "tinua")).toBe("join");
    expect(hyphenJoinDecision("trans", "porte")).toBe("join");
    expect(hyphenJoinDecision("un", "believable")).toBe("join");
  });

  it("keeps the hyphen when either side carries a digit (ranges)", () => {
    expect(hyphenJoinDecision("1998", "2004")).toBe("keep");
    expect(hyphenJoinDecision("página", "12")).toBe("keep");
  });

  it("keeps known pt/en compounds (tiny lexicon)", () => {
    expect(hyphenJoinDecision("guarda", "chuva")).toBe("keep");
    expect(hyphenJoinDecision("guarda", "roupa")).toBe("keep");
    expect(hyphenJoinDecision("segunda", "feira")).toBe("keep");
    expect(hyphenJoinDecision("bem", "estar")).toBe("keep");
    expect(hyphenJoinDecision("well", "known")).toBe("keep");
    expect(hyphenJoinDecision("long", "term")).toBe("keep");
    // The lexicon check is case-insensitive: `Guarda-` at a line end still hits.
    expect(hyphenJoinDecision("Guarda", "chuva")).toBe("keep");
  });

  it("keeps pt enclisis pronouns (disse-lhe, dá-me)", () => {
    expect(hyphenJoinDecision("disse", "lhe")).toBe("keep");
    expect(hyphenJoinDecision("entregou", "lhes")).toBe("keep");
    expect(hyphenJoinDecision("dá", "me")).toBe("keep");
    // `demos-` + `la` is enclisis too (the clitic list wins over the default).
    expect(hyphenJoinDecision("demos", "la")).toBe("keep");
  });

  it("keeps the compounds the corpus found broken at a line end (backlog 3A)", () => {
    // Read off the 40 printed line-end hyphens of `n1-pt-sofia`, whose
    // default join was mangling them (`lírios-` + `amarelos` → the reported
    // "líriosamarelos"). Each pair is a compound the book prints whole.
    const compounds = [
      ["lírios", "amarelos"],
      ["quebra", "cabeça"],
      ["bem", "vindo"],
      ["meia", "idade"],
      ["pré", "socráticos"],
      ["greco", "romano"],
      ["marxismo", "leninismo"],
      ["cartões", "postais"],
      ["cartão", "postal"],
      ["palavras", "chave"],
      ["sexta", "feira"],
      ["recém", "nascido"],
      ["sul", "americano"],
      ["livre", "arbítrio"],
      ["inter", "relação"],
      ["matérias", "primas"],
      ["todo", "poderosa"],
    ] as const;
    for (const [left, right] of compounds) {
      expect(hyphenJoinDecision(left, right), `${left}-${right}`).toBe("keep");
    }
  });

  it("keeps but doubts a proper noun after the hyphen", () => {
    expect(hyphenJoinDecision("Ex", "Ministro")).toBe("uncertain");
    expect(hyphenJoinDecision("Mc", "Donald")).toBe("uncertain");
  });
});

describe("hyphenSiteBetween", () => {
  it("detects the site and reports the word the reader gets", () => {
    const site = hyphenSiteBetween("A pala-", "vra bonita.");
    expect(site).toEqual({ left: "pala", right: "vra", decision: "join", word: "palavra" });
  });

  it("is null without a trailing hyphen", () => {
    expect(hyphenSiteBetween("A palavra", "vem depois")).toBeNull();
  });

  it("is null when the hyphen is a dash separated from the words", () => {
    // `foo -` ends the line with a space before the hyphen: not a break site.
    expect(hyphenSiteBetween("foo -", "bar")).toBeNull();
  });

  it("is null when the next line starts with punctuation", () => {
    expect(hyphenSiteBetween("pala-", ", vra")).toBeNull();
  });

  it("is null for a soft hyphen (U+00AD leaves no printed dash)", () => {
    expect(hyphenSiteBetween("pala\u00AD", "vra")).toBeNull();
  });

  it("collapses a compound broken at its hyphen (backlog 3A)", () => {
    // The producer split "não-teórico" at its own hyphen and reprinted the
    // hyphen on both sides of the break: one hyphen survives for the reader.
    expect(hyphenSiteBetween("pré-reflexivo, não-", "-teórico, numa postura")).toEqual({
      left: "não",
      right: "teórico",
      decision: "keep",
      word: "não-teórico",
    });
  });

  it("gives the reader lírios-amarelos, not líriosamarelos (backlog 3A)", () => {
    expect(hyphenSiteBetween("os jardins os lírios-", "amarelos já floresciam.")).toEqual({
      left: "lírios",
      right: "amarelos",
      decision: "keep",
      word: "lírios-amarelos",
    });
  });

  it("is null when the next line starts a dash item (a list marker)", () => {
    expect(hyphenSiteBetween("algo que termina-", "- primeiro ponto")).toBeNull();
  });

  it("reports keep for a lexicon compound and uncertain for a proper noun", () => {
    expect(hyphenSiteBetween("A guarda-", "chuva")).toEqual({
      left: "guarda",
      right: "chuva",
      decision: "keep",
      word: "guarda-chuva",
    });
    expect(hyphenSiteBetween("O Ex-", "Ministro")).toEqual({
      left: "Ex",
      right: "Ministro",
      decision: "uncertain",
      word: "Ex-Ministro",
    });
  });
});

describe("joinHyphenatedLines", () => {
  it("glues a broken word and drops the hyphen", () => {
    const result = joinHyphenatedLines(["A pala-", "vra bonita."]);
    expect(result.text).toBe("A palavra bonita.");
    expect(result.sites.map((site) => site.decision)).toEqual(["join"]);
    expect(result.uncertain).toBe(false);
  });

  it("keeps legitimate hyphens and takes no joining space", () => {
    expect(joinHyphenatedLines(["A guarda-", "chuva abria."]).text).toBe("A guarda-chuva abria.");
    expect(joinHyphenatedLines(["Ele disse-", "lhe a verdade."]).text).toBe(
      "Ele disse-lhe a verdade.",
    );
    expect(joinHyphenatedLines(["Entre 1998-", "2004 tudo mudou."]).text).toBe(
      "Entre 1998-2004 tudo mudou.",
    );
  });

  it("collapses the reprinted hyphen of a compound broken at its hyphen", () => {
    // Both sides printed the compound hyphen; the reader gets one.
    const result = joinHyphenatedLines([
      "numa atitude pré-reflexiva, não-",
      "-teórico, sem dogmas.",
    ]);
    expect(result.text).toBe("numa atitude pré-reflexiva, não-teórico, sem dogmas.");
    expect(result.sites).toEqual([
      { left: "não", right: "teórico", decision: "keep", word: "não-teórico" },
    ]);
    expect(result.uncertain).toBe(false);
  });

  it("keeps and flags an uncertain hyphen", () => {
    const result = joinHyphenatedLines(["O Ex-", "Ministro falou."]);
    expect(result.text).toBe("O Ex-Ministro falou.");
    expect(result.uncertain).toBe(true);
  });

  it("turns every other line boundary into a single space", () => {
    expect(joinHyphenatedLines(["linha um.", "linha dois."]).text).toBe("linha um. linha dois.");
  });

  it("handles several sites in one paragraph", () => {
    const result = joinHyphenatedLines(["A pala-", "vra que con-", "tinua aqui."]);
    expect(result.text).toBe("A palavra que continua aqui.");
    expect(result.sites).toHaveLength(2);
  });

  it("returns the single line untouched", () => {
    expect(joinHyphenatedLines(["sem quebra"])).toEqual({
      text: "sem quebra",
      sites: [],
      uncertain: false,
    });
  });
});

describe("joinHyphenatedText", () => {
  it("joins the lines of a page text and leaves other boundaries as spaces", () => {
    expect(joinHyphenatedText("A pala-\nvra bonita\noutra linha.")).toBe(
      "A palavra bonita outra linha.",
    );
  });
});

describe("paragraphHyphenText", () => {
  /** One visual line carrying a single item (the ingestion shape). */
  function line(text: string, baseline: number): TextLine {
    const item: RawTextItem = {
      text,
      x: 72,
      y: baseline - 11,
      width: text.length * 5.5,
      height: 11,
      fontName: "Helvetica",
      fontSize: 11,
    };
    return {
      items: [item],
      top: baseline - 11,
      bottom: baseline,
      x: 72,
      width: item.width,
      fontSize: 11,
    };
  }

  it("returns the joined text, the sites and the doubt of the paragraph", () => {
    const joined = paragraphHyphenText([
      line("A pala-", 100),
      line("vra que con-", 115),
      line("tinua.", 130),
    ]);
    expect(joined.text).toBe("A palavra que continua.");
    expect(joined.sites).toHaveLength(2);
    expect(joined.uncertain).toBe(false);

    const kept = paragraphHyphenText([line("O Ex-", 100), line("Ministro saiu.", 115)]);
    expect(kept.text).toBe("O Ex-Ministro saiu.");
    expect(kept.uncertain).toBe(true);
  });
});

describe("hyphen constants", () => {
  it("exposes the flag and the reduced confidence of an uncertain block", () => {
    expect(UNCERTAIN_HYPHEN_FLAG).toBe("uncertain-hyphen");
    expect(HYPHEN_UNCERTAIN_CONFIDENCE).toBe(0.7);
  });
});
