import { describe, expect, it } from "vitest";
import { normalizeForReader, normalizeUnicode, SOFT_HYPHEN } from "./unicode";

const ff = String.fromCharCode(0xfb00);
const fi = String.fromCharCode(0xfb01);
const fl = String.fromCharCode(0xfb02);
const ffi = String.fromCharCode(0xfb03);
const ffl = String.fromCharCode(0xfb04);
const nbsp = String.fromCharCode(0x00a0);
const figureSpace = String.fromCharCode(0x2007);
const narrowNbsp = String.fromCharCode(0x202f);
const lsquo = String.fromCharCode(0x2018);
const rsquo = String.fromCharCode(0x2019);
const ldquo = String.fromCharCode(0x201c);
const rdquo = String.fromCharCode(0x201d);
const combiningAcute = String.fromCharCode(0x0301);
const bell = String.fromCharCode(0x07);
const del = String.fromCharCode(0x7f);
const tab = String.fromCharCode(0x09);
const newline = String.fromCharCode(0x0a);
const spacingAcute = String.fromCharCode(0x00b4);

describe("normalizeUnicode", () => {
  it("composes combining marks into precomposed characters (NFC)", () => {
    expect(normalizeUnicode(`cafe${combiningAcute}`)).toBe("café");
  });

  it("removes the soft hyphen", () => {
    expect(normalizeUnicode(`co${SOFT_HYPHEN}operate`)).toBe("cooperate");
  });

  it("expands the five f-ligatures", () => {
    expect(normalizeUnicode(`e${ff}ect`)).toBe("effect");
    expect(normalizeUnicode(`a${fi}`)).toBe("afi");
    expect(normalizeUnicode(`a${fl}`)).toBe("afl");
    expect(normalizeUnicode(`a${ffi}`)).toBe("affi");
    expect(normalizeUnicode(`a${ffl}`)).toBe("affl");
  });

  it("converts tab to space and keeps newline", () => {
    expect(normalizeUnicode(`a${tab}b`)).toBe("a b");
    expect(normalizeUnicode(`a${newline}b`)).toBe(`a${newline}b`);
  });

  it("removes control characters (C0, C1, DEL)", () => {
    expect(normalizeUnicode(`a${bell}b${del}c`)).toBe("abc");
  });

  it("preserves Greek and accented Latin", () => {
    expect(normalizeUnicode("αβγΩ")).toBe("αβγΩ");
    expect(normalizeUnicode("ação")).toBe("ação");
  });

  it("does not touch spacing accents (LaTeX case, E3-T01b)", () => {
    expect(normalizeUnicode(`EXERC${spacingAcute}ICIOS`)).toBe(`EXERC${spacingAcute}ICIOS`);
  });

  it("is idempotent", () => {
    const once = normalizeUnicode(`${ff}${SOFT_HYPHEN}${nbsp}`);
    expect(normalizeUnicode(once)).toBe(once);
  });

  it("is deterministic", () => {
    const input = `a${fi}${SOFT_HYPHEN}b`;
    expect(normalizeUnicode(input)).toBe(normalizeUnicode(input));
  });
});

describe("normalizeForReader", () => {
  it("converts non-breaking space variants to a regular space", () => {
    expect(normalizeForReader(`a${nbsp}b`)).toBe("a b");
    expect(normalizeForReader(`a${figureSpace}b`)).toBe("a b");
    expect(normalizeForReader(`a${narrowNbsp}b`)).toBe("a b");
  });

  it("folds typographic quotes to ASCII", () => {
    expect(normalizeForReader(`${lsquo}hi${rsquo}`)).toBe("'hi'");
    expect(normalizeForReader(`${ldquo}hi${rdquo}`)).toBe('"hi"');
  });

  it("applies every normalizeUnicode rule", () => {
    expect(normalizeForReader(`e${ff}ect${nbsp}${ldquo}ok${rdquo}`)).toBe('effect "ok"');
  });

  it("does not collapse whitespace runs (evaluation normalizer does that)", () => {
    expect(normalizeForReader("a  b")).toBe("a  b");
  });
});

describe("SOFT_HYPHEN", () => {
  it("is U+00AD", () => {
    expect(SOFT_HYPHEN).toBe(String.fromCharCode(0x00ad));
  });
});
