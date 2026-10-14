import { describe, expect, it } from "vitest";
import { classifyFontName, fontNameTokens } from "./fontstyle";

describe("fontNameTokens", () => {
  it("splits camel case, separators and acronym runs", () => {
    expect(fontNameTokens("TimesNewRomanPS-BoldMT")).toEqual([
      "times",
      "new",
      "roman",
      "ps",
      "bold",
      "mt",
    ]);
    expect(fontNameTokens("Helvetica-Oblique")).toEqual(["helvetica", "oblique"]);
    expect(fontNameTokens("CMTI10")).toEqual(["cmti10"]);
  });
});

describe("classifyFontName — conventions (spike S2)", () => {
  it("decides Computer Modern by the name code", () => {
    expect(classifyFontName("CMBX10")).toEqual({ bold: true, italic: false, basis: "convention" });
    expect(classifyFontName("CMTI10")).toEqual({ bold: false, italic: true, basis: "convention" });
    expect(classifyFontName("CMSL10")).toEqual({ bold: false, italic: true, basis: "convention" });
    expect(classifyFontName("CMMI10")).toEqual({ bold: false, italic: true, basis: "convention" });
    expect(classifyFontName("CMR10")).toEqual({ bold: false, italic: false, basis: "convention" });
    expect(classifyFontName("CMTT9")).toEqual({ bold: false, italic: false, basis: "convention" });
  });

  it("decides SUfonts by the name code", () => {
    expect(classifyFontName("SFBX1095")).toEqual({
      bold: true,
      italic: false,
      basis: "convention",
    });
    expect(classifyFontName("SFTI1000")).toEqual({
      bold: false,
      italic: true,
      basis: "convention",
    });
    expect(classifyFontName("SFRM1000")).toEqual({
      bold: false,
      italic: false,
      basis: "convention",
    });
  });

  it("decides TeX Type1 suffixes, including bold-italic", () => {
    expect(classifyFontName("t1xbtt")).toEqual({ bold: true, italic: false, basis: "convention" });
    expect(classifyFontName("rtxbmi")).toEqual({ bold: true, italic: true, basis: "convention" });
    expect(classifyFontName("rtxbi")).toEqual({ bold: true, italic: true, basis: "convention" });
    expect(classifyFontName("rtxmi")).toEqual({ bold: false, italic: true, basis: "convention" });
  });

  it("reads symbol families as plain (no text style)", () => {
    expect(classifyFontName("Symbol")).toEqual({ bold: false, italic: false, basis: "convention" });
    expect(classifyFontName("ZapfDingbats")).toEqual({
      bold: false,
      italic: false,
      basis: "convention",
    });
  });

  it("strips a leftover subset prefix before deciding", () => {
    expect(classifyFontName("ABCDEF+CMBX10")).toEqual({
      bold: true,
      italic: false,
      basis: "convention",
    });
  });
});

describe("classifyFontName — tokens", () => {
  it("decides bold and italic words", () => {
    expect(classifyFontName("Arial-BoldMT")).toEqual({ bold: true, italic: false, basis: "token" });
    expect(classifyFontName("Times-Italic")).toEqual({ bold: false, italic: true, basis: "token" });
    expect(classifyFontName("DejaVuSans-Oblique")).toEqual({
      bold: false,
      italic: true,
      basis: "token",
    });
    expect(classifyFontName("Helvetica-BoldOblique")).toEqual({
      bold: true,
      italic: true,
      basis: "token",
    });
  });

  it("reads weight words that are not bold as regular", () => {
    expect(classifyFontName("GillSans-Light")).toEqual({
      bold: false,
      italic: false,
      basis: "token",
    });
    expect(classifyFontName("MyFont-Medium")).toEqual({
      bold: false,
      italic: false,
      basis: "token",
    });
  });
});

describe("classifyFontName — default and unknown", () => {
  it("reads a plausible family without markers as regular", () => {
    expect(classifyFontName("Palatino Linotype")).toEqual({
      bold: false,
      italic: false,
      basis: "default",
    });
    expect(classifyFontName("Avenir-Roman")).toEqual({
      bold: false,
      italic: false,
      basis: "token",
    });
    expect(classifyFontName("TimesNewRomanPSMT")).toEqual({
      bold: false,
      italic: false,
      basis: "token",
    });
  });

  it("returns no style for an undecidable name (never a silent regular)", () => {
    expect(classifyFontName("FFF123")).toEqual({ bold: false, italic: false, basis: "unknown" });
    expect(classifyFontName("g_d0_f1")).toEqual({ bold: false, italic: false, basis: "unknown" });
  });
});
