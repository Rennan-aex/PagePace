import type { TextLine } from "./lines";
import { lineText } from "./spaces";

/**
 * Hyphenation join (E3-T03 — REQ-EXT-07): a word the typesetter broke with a
 * hyphen at the end of a line (`pala-` + `vra`) is glued back into one word
 * for the reader, while legitimate hyphens keep theirs (`guarda-chuva`,
 * `disse-lhe`, `well-known`, ranges like `1998-2004`).
 *
 * A hyphen site is a pair of consecutive lines where the first ends with `-`
 * preceded by a letter or digit and the second starts with a letter or digit.
 * The decision for each site, in order:
 *
 * 1. **Digits** on either side keep the hyphen (year ranges, page spans).
 * 2. **Lexicon** — the full form `left-right` (lowercased) is in the small
 *    per-language compound list (`guarda-chuva`, `well-known`...).
 * 3. **Clitics** — the right part is a Portuguese enclisis pronoun (`lhe`,
 *    `me`...). English has none after a hyphen; its list is empty.
 * 4. **Uppercase right part** — usually a proper noun (`Ex-Ministro`,
 *    `McDonald`): the hyphen is kept but the site is **uncertain**, so the
 *    block gets `flags: ["uncertain-hyphen"]` and a reduced confidence.
 * 5. **Default: join** and drop the hyphen — in running prose most line-end
 *    hyphens are typesetting, not content.
 *
 * Without a dictionary the two sides of case 2/3 are indistinguishable from a
 * broken word (`no-`+`me` looks like `dá-`+`me`); the rules shift probability,
 * they do not prove. That is why the lexicons stay tiny and the leftover
 * doubt is flagged instead of silenced (ARCHITECTURE decision 6).
 *
 * Known limits: never crosses a page (that join is E3-T04), one decision per
 * site (no re-reading of the joined word), and soft hyphens (U+00AD) are not
 * sites — they leave no printed `-` and `normalizeUnicode` removes them.
 */

/** Flag written on a block that made at least one uncertain hyphen decision. */
export const UNCERTAIN_HYPHEN_FLAG = "uncertain-hyphen";
/** Confidence of a block with at least one uncertain hyphen decision. */
export const HYPHEN_UNCERTAIN_CONFIDENCE = 0.7;

/** Portuguese enclisis pronouns that keep the hyphen (`disse-lhe`, `dá-me`). */
export const HYPHEN_CLITICS_PT: ReadonlySet<string> = new Set([
  "la",
  "las",
  "lo",
  "los",
  "lhe",
  "lhes",
  "ma",
  "me",
  "mo",
  "nas",
  "nos",
  "se",
  "ta",
  "te",
  "to",
  "vos",
]);

/** English clitics after a hyphen: none in running prose (kept for symmetry). */
export const HYPHEN_CLITICS_EN: ReadonlySet<string> = new Set([]);

/** Small per-language lexicon of compounds whose hyphen is content. */
export const HYPHEN_LEXICON_PT: ReadonlySet<string> = new Set([
  "bem-estar",
  "guarda-chuva",
  "guarda-roupa",
  "segunda-feira",
]);
export const HYPHEN_LEXICON_EN: ReadonlySet<string> = new Set([
  "long-term",
  "self-esteem",
  "short-term",
  "so-called",
  "up-to-date",
  "well-known",
]);

/** What the reader gets for one hyphen site. */
export type HyphenJoinDecision = "join" | "keep" | "uncertain";

export interface HyphenSite {
  /** Word before the hyphen, without it (`pala`). */
  left: string;
  /** Word after the line break (`vra`). */
  right: string;
  decision: HyphenJoinDecision;
  /** Word the reader gets: `left+right` (join) or `left-right` (keep/uncertain). */
  word: string;
}

const LETTER_OR_DIGIT_END = /([\p{L}\p{M}\p{N}]+)$/u;
const LETTER_OR_DIGIT_START = /^([\p{L}\p{M}\p{N}]+)/u;
const UPPERCASE_START = /^\p{Lu}/u;
const HAS_DIGIT = /\d/;

/**
 * Decision for a word broken by a line-end hyphen. The arguments are the bare
 * words around the site (`pala`, `vra`); the rules and their order are
 * documented at the top of the module.
 */
export function hyphenJoinDecision(left: string, right: string): HyphenJoinDecision {
  if (HAS_DIGIT.test(left) || HAS_DIGIT.test(right)) return "keep";
  const form = `${left}-${right}`.toLowerCase();
  if (HYPHEN_LEXICON_PT.has(form) || HYPHEN_LEXICON_EN.has(form)) return "keep";
  const tail = right.toLowerCase();
  if (HYPHEN_CLITICS_PT.has(tail) || HYPHEN_CLITICS_EN.has(tail)) return "keep";
  if (UPPERCASE_START.test(right)) return "uncertain";
  return "join";
}

/**
 * The hyphen site between two consecutive lines, or `null` when the pair is
 * not one (no trailing hyphen, nothing word-like around it).
 */
export function hyphenSiteBetween(previous: string, next: string): HyphenSite | null {
  if (!previous.endsWith("-")) return null;
  const left = LETTER_OR_DIGIT_END.exec(previous.slice(0, -1))?.[1];
  const right = LETTER_OR_DIGIT_START.exec(next)?.[1];
  if (left === undefined || right === undefined || left === "" || right === "") return null;
  const decision = hyphenJoinDecision(left, right);
  return { left, right, decision, word: decision === "join" ? left + right : `${left}-${right}` };
}

export interface HyphenJoinResult {
  /** The lines glued into the reader's text. */
  text: string;
  /** Every hyphen site the join met, in order. */
  sites: HyphenSite[];
  /** Whether at least one site was decided `"uncertain"`. */
  uncertain: boolean;
}

/**
 * Joins visual lines into the reader's text: a hyphen site loses the joining
 * space (and the hyphen when the decision is `join`), every other boundary
 * becomes a single space. Sites and doubt are reported so the block builder
 * can flag them and the evaluation can score them.
 */
export function joinHyphenatedLines(lines: readonly string[]): HyphenJoinResult {
  const sites: HyphenSite[] = [];
  let uncertain = false;
  let output = "";

  for (const [index, line] of lines.entries()) {
    if (index === 0) {
      output = line;
      continue;
    }
    // `output` always ends with the previous line's text, so the site test
    // can run against the accumulated text.
    const site = hyphenSiteBetween(output, line);
    if (site === null) {
      output += ` ${line}`;
    } else {
      sites.push(site);
      if (site.decision === "uncertain") uncertain = true;
      // The printed hyphen already ends `output`: `join` drops it, `keep` and
      // `uncertain` leave it in place — neither takes the joining space.
      output = site.decision === "join" ? output.slice(0, -1) + line : output + line;
    }
  }
  return { text: output, sites, uncertain };
}

/**
 * Same join over a text whose lines are separated by `\n` (the page text the
 * evaluation compares). Each page is joined on its own — a hyphen never
 * crosses a page (E3-T04 owns that).
 */
export function joinHyphenatedText(text: string): string {
  return joinHyphenatedLines(text.split("\n")).text;
}

/**
 * Reader's text of one paragraph (E2-T04 lines, E3-T03 hyphens): every line
 * through the space rule, hyphen sites glued by the decision above.
 */
export function paragraphHyphenText(paragraph: readonly TextLine[]): HyphenJoinResult {
  return joinHyphenatedLines(paragraph.map((line) => lineText(line.items)));
}
