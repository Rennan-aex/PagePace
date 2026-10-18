import { describe, expect, it } from "vitest";
import { GREEK_LANG, GREEK_MIN_LETTERS, greekScriptSignal, tagGreekRuns } from "./greek";

describe("greekScriptSignal", () => {
  it("reports a run whose every letter is Greek script", () => {
    const signal = greekScriptSignal("Σωκράτης");
    expect(signal.letters).toBe(8);
    expect(signal.greekLetters).toBe(8);
    expect(signal.greek).toBe(true);
  });

  it("counts polytonic letters (Greek Extended) as Greek", () => {
    const signal = greekScriptSignal("ψυχή");
    expect(signal.greekLetters).toBe(4);
    expect(signal.greek).toBe(true);
  });

  it("ignores punctuation, digits and spaces toward the decision", () => {
    const signal = greekScriptSignal("Σωκράτης, 480!");
    expect(signal.letters).toBe(8);
    expect(signal.greekLetters).toBe(8);
    expect(signal.greek).toBe(true);
  });

  it("needs the letter floor: two Greek letters are not a block", () => {
    expect(GREEK_MIN_LETTERS).toBe(3);
    const short = greekScriptSignal("αβ");
    expect(short.greekLetters).toBe(2);
    expect(short.greek).toBe(false);
  });

  it("never tags a lone math-symbol letter", () => {
    expect(greekScriptSignal("ρ").greek).toBe(false);
    expect(greekScriptSignal("σ + π").greek).toBe(false);
  });

  it("never tags a run mixing Greek with the document alphabet", () => {
    const signal = greekScriptSignal("λόγος logos");
    expect(signal.greekLetters).toBe(5);
    expect(signal.letters).toBe(10);
    expect(signal.greek).toBe(false);
  });

  it("reports plain Latin text as not Greek", () => {
    const signal = greekScriptSignal("the heart knows");
    expect(signal.greekLetters).toBe(0);
    expect(signal.greek).toBe(false);
  });

  it("reports an empty or punctuation-only text as not Greek", () => {
    expect(greekScriptSignal("").greek).toBe(false);
    expect(greekScriptSignal("... — ").greek).toBe(false);
  });

  it("keeps the tag and the floor as named constants", () => {
    expect(GREEK_LANG).toBe("grc");
    expect(GREEK_MIN_LETTERS).toBe(3);
  });

  it("is pure and deterministic", () => {
    const text = "Σωκράτης λέγει περὶ τῆς ψυχῆς.";
    expect(greekScriptSignal(text)).toEqual(greekScriptSignal(text));
    expect(text).toContain("Σωκράτης");
  });
});

describe("tagGreekRuns", () => {
  it("adds lang grc to an obvious Greek run", () => {
    const tagged = tagGreekRuns([{ text: "Σωκράτης λέγει" }]);
    expect(tagged).toEqual([{ text: "Σωκράτης λέγει", lang: "grc" }]);
  });

  it("leaves Latin, mixed and short runs without lang", () => {
    const tagged = tagGreekRuns([
      { text: "the heart knows" },
      { text: "λόγος logos" },
      { text: "ρ" },
    ]);
    expect(tagged).toEqual([{ text: "the heart knows" }, { text: "λόγος logos" }, { text: "ρ" }]);
    expect(tagged.every((run) => run.lang === undefined)).toBe(true);
  });

  it("preserves the text and the styles of every run", () => {
    const runs = [
      { text: "Σωκράτης", bold: true },
      { text: " said ", italic: true },
      { text: "λόγος", italic: true },
    ];
    const tagged = tagGreekRuns(runs);
    expect(tagged[0]).toEqual({ text: "Σωκράτης", bold: true, lang: "grc" });
    expect(tagged[1]).toEqual({ text: " said ", italic: true });
    expect(tagged[2]).toEqual({ text: "λόγος", italic: true, lang: "grc" });
  });

  it("does not mutate the input", () => {
    const runs = [{ text: "Σωκράτης" }];
    const tagged = tagGreekRuns(runs);
    expect(runs).toEqual([{ text: "Σωκράτης" }]);
    expect(tagged).not.toBe(runs);
    expect(tagged[0]).not.toBe(runs[0]);
  });

  it("is deterministic", () => {
    const runs = [{ text: "Σωκράτης λέγει" }, { text: "logos" }];
    expect(tagGreekRuns(runs)).toEqual(tagGreekRuns(runs));
  });
});
