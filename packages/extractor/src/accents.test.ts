import type { RawPage, RawTextItem } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { composeAccentItems, stripOrnamentItems } from "./accents";

/**
 * E3-T01b — spacing-accent recomposition.
 *
 * The fixtures mirror the shapes pdf.js delivers from LaTeX PDFs: an accent
 * as its own item overlapping the next letter, an accent run at the end of an
 * item, and the traps that must survive (ornament tildes, the `~` non-breaking
 * space, digits, already-accented letters, whitespace).
 */

interface ItemSpec {
  text: string;
  x: number;
  width: number;
  y?: number;
  height?: number;
  fontSize?: number;
  fontName?: string;
  hasEOL?: boolean;
}

function pageOf(...specs: ItemSpec[]): RawPage {
  return {
    index: 0,
    width: 600,
    height: 800,
    rotation: 0,
    items: specs.map(
      (spec): RawTextItem => ({
        text: spec.text,
        x: spec.x,
        y: spec.y ?? 100,
        width: spec.width,
        height: spec.height ?? 12,
        fontName: spec.fontName ?? "Helvetica",
        fontSize: spec.fontSize ?? 12,
        ...(spec.hasEOL === true ? { hasEOL: true } : {}),
      }),
    ),
  };
}

const textsOf = (page: RawPage): string[] => page.items.map((item) => item.text);

describe("standalone accent items", () => {
  it("composes forward into the first letter of the next item", () => {
    const input = pageOf(
      { text: "Solu", x: 0, width: 40 },
      { text: "¸", x: 40, width: 4 },
      { text: "cao", x: 42, width: 30, hasEOL: true },
    );

    const result = composeAccentItems(input);

    expect(textsOf(result)).toEqual(["Solu", "", "çao"]);
    // The consumed item keeps its box and the neighbour keeps its flags.
    expect(result.items[1]).toMatchObject({ x: 40, width: 4, text: "" });
    expect(result.items[2]).toMatchObject({ x: 42, width: 30, hasEOL: true });
  });

  it("composes backward when the next item cannot take the accent", () => {
    const input = pageOf(
      { text: "FORMAC", x: 0, width: 60 },
      { text: "¸", x: 56, width: 4 },
      { text: "2020", x: 58, width: 30 },
    );

    const result = composeAccentItems(input);

    expect(textsOf(result)).toEqual(["FORMAÇ", "", "2020"]);
  });

  it("blocks the backward composition when the next item overlaps at least as much", () => {
    // The math tilde of n4 p131: `n` + `~` would become `ñ`, but the accent
    // sits over the next box, so nothing may move.
    const input = pageOf(
      { text: "n", x: 0, width: 100 },
      { text: "~", x: 95, width: 10 },
      { text: "2", x: 100, width: 50 },
    );

    expect(textsOf(composeAccentItems(input))).toEqual(["n", "~", "2"]);
  });

  it("keeps an accent that overlaps no neighbour or is fenced by whitespace", () => {
    const far = pageOf(
      { text: "abc", x: 0, width: 40 },
      { text: "´", x: 50, width: 4 },
      { text: "def", x: 60, width: 30 },
    );
    const fenced = pageOf(
      { text: "abc", x: 0, width: 40 },
      { text: " ¸ ", x: 40, width: 16 },
      { text: "def", x: 60, width: 30 },
    );

    expect(composeAccentItems(far)).toBe(far);
    expect(composeAccentItems(fenced)).toBe(fenced);
  });
});

describe("trailing accent runs", () => {
  it("composes forward and leaves the head of the item in place", () => {
    const input = pageOf({ text: "EXERC´", x: 0, width: 54 }, { text: "ICIOS", x: 50, width: 45 });

    const result = composeAccentItems(input);

    expect(textsOf(result)).toEqual(["EXERC", "ÍCIOS"]);
    expect(result.items[0]).toMatchObject({ x: 0, width: 54, text: "EXERC" });
    expect(result.items[1]).toMatchObject({ x: 50, width: 45, text: "ÍCIOS" });
  });

  it("re-classifies the residue of the item after a successful composition", () => {
    // `¸ ˜` spends its `˜` on the next item (round 1) and the `¸ ` left behind
    // fences itself out of the forward path, so it composes backward (round 2).
    const input = pageOf(
      { text: "FORMAC", x: 0, width: 60 },
      { text: "¸ ˜", x: 58, width: 12 },
      { text: "def", x: 66, width: 30 },
    );

    const result = composeAccentItems(input);

    expect(textsOf(result)).toEqual(["FORMAÇ", " ", "d̃ef"]);
  });
});

describe("traps the rule must not touch", () => {
  it("rejects an ornament tilde drawn in another font size", () => {
    const input = pageOf(
      { text: "abc", x: 0, width: 60, fontSize: 9.4 },
      { text: "~", x: 56, width: 8, fontSize: 13 },
      { text: "def", x: 60, width: 30, fontSize: 9.4 },
    );

    expect(composeAccentItems(input)).toBe(input);
  });

  it("keeps `~` non-breaking spaces inside an item", () => {
    const input = pageOf(
      { text: "~Equal", x: 0, width: 50 },
      { text: "Hans~Thomas", x: 60, width: 80 },
      { text: "www.astro.iag.usp.br/~user", x: 150, width: 120 },
    );

    expect(composeAccentItems(input)).toBe(input);
  });

  it("refuses a base that is already accented", () => {
    const input = pageOf({ text: "´", x: 0, width: 4 }, { text: "Área", x: 2, width: 40 });

    expect(composeAccentItems(input)).toBe(input);
  });

  it("folds the LaTeX dotless bases before composing", () => {
    const dotlessI = pageOf(
      { text: "G", x: 0, width: 30 },
      { text: "´", x: 28, width: 4 },
      { text: "ıso", x: 30, width: 30 },
    );
    const dotlessJ = pageOf(
      { text: "x", x: 0, width: 30 },
      { text: "˜", x: 28, width: 4 },
      { text: "ȷumps", x: 30, width: 40 },
    );

    expect(textsOf(composeAccentItems(dotlessI))).toEqual(["G", "", "íso"]);
    expect(textsOf(composeAccentItems(dotlessJ))).toEqual(["x", "", "j̃umps"]);
  });
});

describe("symbol-font ornaments (backlog 3A)", () => {
  it("drops a lone spacing-accent item drawn in a symbol font", () => {
    // The SciELO section ornament of n3-pt-scielo-wittgenstein: a Wingdings3
    // glyph pdf.js maps to "`" by codepoint collision, sitting right before
    // the heading text. Composition never claims it; the reader must not see it.
    const input = pageOf(
      { text: "`", x: 187.65, width: 7.95, fontName: "Wingdings3", fontSize: 15 },
      { text: "1 Considerações iniciais", x: 197.1, width: 120, fontName: "MyriadPro-Bold" },
    );

    const result = stripOrnamentItems(input);

    expect(textsOf(result)).toEqual(["", "1 Considerações iniciais"]);
    expect(result.items[0]).toMatchObject({ x: 187.65, width: 7.95, text: "" });
  });

  it("drops a whitespace-only item drawn in a symbol font", () => {
    // The same producer leaves a Wingdings3 space after the ornament and at
    // the end of a heading run; neither is reader text.
    const input = pageOf(
      { text: " ", x: 195.6, width: 0.11, fontName: "Wingdings3", fontSize: 15 },
      { text: "Artigo", x: 197.1, width: 40, fontName: "MyriadPro-Bold" },
    );

    expect(textsOf(stripOrnamentItems(input))).toEqual(["", "Artigo"]);
  });

  it("keeps a spacing accent drawn in a text font", () => {
    // The math tilde of n4 p131 is text-font content: composition decides it.
    const input = pageOf(
      { text: "n", x: 0, width: 10 },
      { text: "~", x: 9.5, width: 10, fontName: "CMMI12" },
      { text: "2", x: 10, width: 10 },
    );

    expect(stripOrnamentItems(input)).toBe(input);
  });

  it("keeps a real glyph of a symbol font (a math sum)", () => {
    const input = pageOf(
      { text: "∑", x: 0, width: 10, fontName: "Symbol" },
      { text: " x", x: 12, width: 10 },
    );

    expect(stripOrnamentItems(input)).toBe(input);
  });

  it("returns the same page when there is no ornament", () => {
    const plain = pageOf({ text: "abc", x: 0, width: 30 }, { text: "def", x: 40, width: 30 });

    expect(stripOrnamentItems(plain)).toBe(plain);
  });
});

describe("the function itself", () => {
  it("returns the same page when there is nothing to compose", () => {
    const plain = pageOf(
      { text: "− 5 = 3", x: 0, width: 60 },
      { text: "“quoted”", x: 70, width: 70 },
    );

    expect(composeAccentItems(plain)).toBe(plain);
  });

  it("never mutates the input page", () => {
    const input = pageOf({ text: "EXERC´", x: 0, width: 54 }, { text: "ICIOS", x: 50, width: 45 });
    const before = textsOf(input);

    composeAccentItems(input);

    expect(textsOf(input)).toEqual(before);
  });

  it("is deterministic", () => {
    const build = (): RawPage =>
      pageOf(
        { text: "FORMAC", x: 0, width: 60 },
        { text: "¸", x: 56, width: 4 },
        { text: "cao", x: 58, width: 30 },
      );

    expect(composeAccentItems(build())).toEqual(composeAccentItems(build()));
  });
});
