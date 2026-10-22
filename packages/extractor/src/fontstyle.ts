/**
 * Bold/italic from the embedded font name (E4-T01 — REQ-EXT-05, layer 5
 * "estilos inline").
 *
 * The pdf.js flags `font.bold`/`font.italic` are `undefined` for every
 * embedded font (409/409 in the corpus, spike S2 §3), so the PostScript name
 * is the source of truth. Three bases decide, in order (spike S2 §8):
 *
 * 1. **convention** — historical families whose style lives in the name code:
 *    Computer Modern (`CMBX` bold, `CMTI`/`CMSL` italic, `CMMI` math italic...),
 *    SUfonts (`SFBX`, `SFTI`...) and TeX Type1 suffixes (`t1xbtt`, `rtxbmi`...).
 *    Without this table only 72% of the corpus fonts are decided and 10.286
 *    letters lose their style (all in the TeX books).
 * 2. **token** — style words inside the name: `bold`, `black`, `heavy`,
 *    `semibold`... and `italic`, `oblique`, `cursive`... against `roman`,
 *    `regular`, `light`... The name is split on camel case and separators.
 * 3. **default** — no marker but a plausible family (`TimesNewRomanPSMT`,
 *    `Avenir-Roman`) reads as regular.
 * 4. **unknown** — nothing decided (0 fonts in the corpus): no style is
 *    written, the run stays plain (a silent regular would be a wrong answer).
 *
 * Bytes (OS/2, head) are never parsed: they lose recall on the TeX subsets
 * (37 conflicts where the bytes say regular and the name says style) and the
 * 18 Type3 fonts have no bytes at all (S2 §3). Deterministic: same name, same
 * decision; no I/O, no clock.
 */

/** How a font name was decided. Kept for the confidence overlay (E7). */
export type FontStyleBasis = "convention" | "token" | "default" | "unknown";

export interface FontStyle {
  bold: boolean;
  italic: boolean;
  basis: FontStyleBasis;
}

/** Subset prefix a producer may leave on the name (`ABCDEF+Georgia`). */
const SUBSET_PREFIX = /^[A-Z]{6}\+/;
const TRAILING_DIGITS = /\d+$/;
const VOWEL = /[aeiouy]/i;

const BOLD_WORDS: ReadonlySet<string> = new Set([
  "bold",
  "boldmt",
  "bd",
  "black",
  "heavy",
  "demi",
  "demibold",
  "semibold",
  "extrabold",
  "ultrabold",
  "superbold",
  "cmssbx",
]);
const ITALIC_WORDS: ReadonlySet<string> = new Set([
  "italic",
  "ital",
  "oblique",
  "obl",
  "slanted",
  "slant",
  "cursive",
  "it",
]);
const REGULAR_WORDS: ReadonlySet<string> = new Set([
  "roman",
  "regu",
  "regular",
  "normal",
  "mt",
  "psmt",
  "std",
  "text",
  "book",
  "base",
  "rom",
  "reg",
]);
const LIGHT_WORDS: ReadonlySet<string> = new Set(["light", "thin", "narrow", "cond", "condensed"]);
const MEDIUM_WORDS: ReadonlySet<string> = new Set(["medium", "medi", "mediummt"]);

/** Families whose pictographic glyphs are never bold/italic text. */
const SYMBOL_FAMILIES = /^(Symbol|ZapfDingbats|Dingbats|Marlett|Wingdings|Webdings)/i;

/**
 * Whether a font is a symbol/dingbat family whose glyphs are ornaments or
 * pictographs, not reader text (backlog 3A): pdf.js maps a Wingdings3 arrow
 * to `` ` `` and a Wingdings square to a plain space by codepoint collision,
 * so the item's text is not what the typesetter meant.
 */
export function isSymbolFontName(rawName: string): boolean {
  return SYMBOL_FAMILIES.test(rawName.replace(SUBSET_PREFIX, ""));
}

interface ConventionStyle {
  bold: boolean;
  italic: boolean;
}

/**
 * Historical name codes (spike S2, versioned here because CM/SF/TeX are
 * stable). `null` bold/italic (symbols) reads as "no text style".
 */
const CONVENTION_RULES: readonly (readonly [RegExp, ConventionStyle])[] = [
  [/^CMBX\d/i, { bold: true, italic: false }],
  [/^CMB\d/i, { bold: true, italic: false }],
  [/^CMTI\d/i, { bold: false, italic: true }],
  [/^CMSL\d/i, { bold: false, italic: true }],
  [/^CMSSBX\d/i, { bold: true, italic: false }],
  [/^CMSSB\d/i, { bold: true, italic: false }],
  [/^CMSSI\d/i, { bold: false, italic: true }],
  [/^CMSS\d/i, { bold: false, italic: false }],
  [/^CMTT\d/i, { bold: false, italic: false }],
  [/^CMR\d/i, { bold: false, italic: false }],
  [/^CMMI\d/i, { bold: false, italic: true }],
  [/^CMSY\d/i, { bold: false, italic: false }],
  [/^CMEX\d/i, { bold: false, italic: false }],
  [/^CMSC\d/i, { bold: false, italic: false }],
  [/^CMU\d/i, { bold: false, italic: false }],
  [/^SFRM\d/, { bold: false, italic: false }],
  [/^SFBX\d/, { bold: true, italic: false }],
  [/^SFTI\d/, { bold: false, italic: true }],
  [/^SFTT\d/, { bold: false, italic: false }],
  [/^SFCC\d/, { bold: false, italic: false }],
  [/^SFSX\d/, { bold: false, italic: false }],
  [/^SFMI\d/, { bold: false, italic: true }],
  [/^SF(?:SY|EX)\d/, { bold: false, italic: false }],
  [/^(?:t1x|rtx|tx)r$/, { bold: false, italic: false }],
  [/^(?:t1x|rtx|tx)b$/, { bold: true, italic: false }],
  [/^(?:t1x|rtx|tx)i$/, { bold: false, italic: true }],
  [/^(?:t1x|rtx|tx)bi$/, { bold: true, italic: true }],
  [/^(?:t1x|rtx|tx)bmi$/, { bold: true, italic: true }],
  [/^(?:t1x|rtx|tx)mi$/, { bold: false, italic: true }],
  [/^(?:t1x|rtx|tx)tt$/, { bold: false, italic: false }],
  [/^(?:t1x|rtx|tx)btt$/, { bold: true, italic: false }],
  [/^(?:t1x|rtx|tx)(?:sy|ex)$/, { bold: false, italic: false }],
];

/** Splits a PostScript name into lowercase word tokens (`TimesNewRomanPS-BoldMT`). */
export function fontNameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+|\s+/)
    .filter((token) => token !== "")
    .map((token) => token.toLowerCase());
}

/** A name without style markers but with a family-like word reads as regular. */
function familyPlausible(name: string): boolean {
  return fontNameTokens(name.replace(TRAILING_DIGITS, "")).some(
    (token) => token.length >= 3 && VOWEL.test(token),
  );
}

/** Bold/italic of one embedded font, from its name (order: convention → token → default). */
export function classifyFontName(rawName: string): FontStyle {
  const name = rawName.replace(SUBSET_PREFIX, "");

  for (const [pattern, style] of CONVENTION_RULES) {
    if (pattern.test(name)) return { ...style, basis: "convention" };
  }
  if (SYMBOL_FAMILIES.test(name)) return { bold: false, italic: false, basis: "convention" };

  const tokens = fontNameTokens(name);
  const has = (set: ReadonlySet<string>): boolean => tokens.some((token) => set.has(token));

  let bold: boolean | null = null;
  let italic: boolean | null = null;
  let basis: FontStyleBasis = "unknown";

  if (has(BOLD_WORDS)) {
    bold = true;
    basis = "token";
  } else if (has(MEDIUM_WORDS)) {
    bold = false;
    basis = "token";
  } else if (has(LIGHT_WORDS)) {
    bold = false;
    basis = "token";
  } else if (has(REGULAR_WORDS)) {
    bold = false;
    basis = "token";
  }
  if (has(ITALIC_WORDS)) {
    italic = true;
    basis = "token";
  } else if (italic === null && basis === "token") {
    italic = false;
  }

  if ((bold === null || italic === null) && familyPlausible(name)) {
    if (bold === null) bold = false;
    if (italic === null) italic = false;
    if (basis === "unknown") basis = "default";
  }

  return {
    bold: bold ?? false,
    italic: italic ?? false,
    basis: basis === "unknown" ? "unknown" : basis,
  };
}
