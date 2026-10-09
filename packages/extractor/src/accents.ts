import type { RawPage, RawTextItem } from "@pagepace/schema";

/**
 * Spacing-accent recomposition (E3-T01b — REQ-EXT-18, layer 7 "saida").
 *
 * LaTeX/pdfTeX draws an accent as its own glyph, so pdf.js hands it over as a
 * separate item that overlaps the letter it belongs to. NFC cannot merge the
 * two: the glyph is a *spacing* accent (U+00B4 ´, U+0060 `, U+00B8 ¸,
 * U+02DC ˜, U+02C6 ˆ, U+00A8 ¨, U+00AF ¯, and the ASCII look-alikes `~` `^`),
 * not a combining mark. The S1 spike counted 9013 such items in
 * `n4-pt-astrofisica` alone (92% of that file's overlaps).
 *
 * The rule was validated over every PDF of the corpus (probe 13): the spike
 * falls to 0 in `n4-pt-astrofisica` (9655 forward + 22 backward), to 0 in
 * `n2-en-astrofisica` (18 compositions, all of them correct), and no other
 * book changes at all — including the 13 pt tilde ornaments of
 * `n1-en-lostworld` and the `~` non-breaking spaces of `n4-en-fisica`.
 *
 *   1. A **standalone** accent item composes **forward** with the first
 *      non-space character of the next item when the accent box overlaps it,
 *      the text stream is adjacent on both sides (no whitespace) and the font
 *      sizes match (±1%); otherwise **backward** with the last character of
 *      the previous item under the same gates *plus* a strictly larger
 *      overlap (`previous > next`). That extra gate blocks the math tilde of
 *      n4 p131, whose box touches both neighbours equally.
 *   2. An accent run at the **end** of an item composes **forward only** —
 *      the item's own last letter is a measured false positive (`s` + ´ became
 *      `ś` instead of the next item's `e` + ´ in "série"). Whatever is left
 *      of the item is then re-classified from scratch (up to 3 rounds): an
 *      item like `¸ ˜` spends its run on round 1 and its `¸ ` residue is
 *      composed on round 2.
 *   3. Leading accents with content after them (`~Equal`), and accents in the
 *      middle of an item (`Hans~Thomas`, URLs), are **never** touched: LaTeX
 *      reuses `~` as a non-breaking space.
 *   4. `compose(base, run)` accepts a base that is a single letter and not
 *      already accented (NFD length 1, so `Á` + ´ never becomes `Á́`), folds
 *      the LaTeX dotless forms `ı`/`ȷ` to `i`/`j`, appends the combining
 *      equivalent of each accent and returns the NFC form — accepted only
 *      while it is still one letter plus combining marks, which leaves digits,
 *      punctuation and foreign letters out of the rule.
 *
 * The font-size gate is what separates a LaTeX accent from the 13 pt tilde
 * ornament of `n1-en-lostworld` sitting over 9.4 pt text.
 *
 * Boxes are never edited, only `text`: line grouping, space inference and
 * `itemsText` keep seeing the same geometry, and a consumed accent stays in
 * place as whitespace, which `itemsText` already skips. Same page in, same
 * page out (REQ-EXT-16): no clock, no randomness.
 */

/** The spacing accents pdf.js may deliver as their own item (the S1 set). */
const SPACING_ACCENTS = new Set(["´", "`", "¸", "˜", "ˆ", "¨", "¯", "~", "^"]);

/** An accent run at the very end of an item, matched right to left. */
const TRAILING_ACCENTS = /[´`¸˜ˆ¨¯~^]+$/;

/** Spacing accent → the combining mark LaTeX meant it to be. */
const ACCENT_TO_COMBINING: Readonly<Record<string, string>> = {
  "´": "\u0301",
  "`": "\u0300",
  "¸": "\u0327",
  "˜": "\u0303",
  ˆ: "\u0302",
  "¨": "\u0308",
  "¯": "\u0304",
  "~": "\u0303",
  "^": "\u0302",
};

/** The LaTeX dotless bases (`\i`, `\j`) only compose after folding. */
const DOTLESS_BASES: Readonly<Record<string, string>> = { "\u0131": "i", "\u0237": "j" };

const SINGLE_LETTER = /^\p{L}$/u;
const LETTER_WITH_MARKS = /^[\p{L}][\p{M}]*$/u;

/** Safety bound of the re-classification loop (the residue of `¸ ˜` needs 2). */
const RECLASSIFY_ROUNDS = 3;

const isSpacingAccent = (char: string): boolean => SPACING_ACCENTS.has(char);
const endsWithWhitespace = (text: string): boolean => /\s$/.test(text);
const startsWithWhitespace = (text: string): boolean => /^\s/.test(text);
const sameFontSize = (a: RawTextItem, b: RawTextItem): boolean =>
  Math.abs(a.fontSize - b.fontSize) <= 0.01 * Math.max(a.fontSize, b.fontSize);

const overlapX = (a: { x: number; width: number }, b: { x: number; width: number }): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));

/** One letter plus its combining marks after NFC, or `null`. */
function compose(base: string, run: string): string | null {
  if (!SINGLE_LETTER.test(base)) return null;
  // An already-accented base would collect a second mark (Á + ´ -> Á́).
  if ([...base.normalize("NFD")].length > 1) return null;
  let combined = DOTLESS_BASES[base] ?? base;
  for (const accent of run) {
    const combining = ACCENT_TO_COMBINING[accent];
    if (combining === undefined) return null;
    combined += combining;
  }
  const normalized = combined.normalize("NFC");
  return LETTER_WITH_MARKS.test(normalized) ? normalized : null;
}

/** The nearest item with content in `step` direction, skipping blanks. */
function contentNeighbor(
  texts: readonly string[],
  items: readonly RawTextItem[],
  from: number,
  step: number,
): { index: number; item: RawTextItem } | undefined {
  let index = from;
  while (index >= 0 && index < items.length && (texts[index] ?? "").trim() === "") index += step;
  const item = items[index];
  if (item === undefined) return undefined;
  return { index, item };
}

interface Edge {
  /** UTF-16 offset of the character inside its text. */
  index: number;
  /** The character itself (exactly one code point). */
  char: string;
}

function firstContentChar(text: string): Edge | undefined {
  const rest = text.trimStart();
  if (rest === "") return undefined;
  const char = [...rest][0];
  if (char === undefined) return undefined;
  return { index: text.length - rest.length, char };
}

function lastContentChar(text: string): Edge | undefined {
  const body = text.trimEnd();
  if (body === "") return undefined;
  const char = [...body].pop();
  if (char === undefined) return undefined;
  return { index: body.length - char.length, char };
}

const replaceChar = (text: string, edge: Edge, replacement: string): string =>
  text.slice(0, edge.index) + replacement + text.slice(edge.index + edge.char.length);

const removeRun = (text: string, run: string): string => text.split(run).join("");

/**
 * Recomposes the spacing-accent items of one page (E3-T01b).
 *
 * Returns the very same page object when nothing composed, and otherwise a
 * copy whose touched items carry the new text and unchanged geometry.
 */
export function composeAccentItems(page: RawPage): RawPage {
  const items = page.items;
  const texts: string[] = [];
  const touched: boolean[] = [];
  for (const item of items) {
    texts.push(item.text);
    touched.push(false);
  }

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (item === undefined) continue;
    const initial = texts[index] ?? "";
    if (initial.trim() === "" || ![...initial].some(isSpacingAccent)) continue;

    // A forward composition can leave the item as accents only: start over.
    for (let round = 0; round < RECLASSIFY_ROUNDS; round++) {
      const text = texts[index] ?? "";
      if (text.trim() === "" || ![...text].some(isSpacingAccent)) break;
      const trimmed = text.trim();
      const standalone = [...trimmed].every(isSpacingAccent);
      const trailing = TRAILING_ACCENTS.exec(text)?.[0] ?? "";
      const next = contentNeighbor(texts, items, index + 1, 1);
      const previous = contentNeighbor(texts, items, index - 1, -1);
      const nextText = next !== undefined ? (texts[next.index] ?? "") : "";
      const previousText = previous !== undefined ? (texts[previous.index] ?? "") : "";
      const first = next !== undefined ? firstContentChar(nextText) : undefined;
      const last = previous !== undefined ? lastContentChar(previousText) : undefined;
      const slot = item.width / Math.max(1, [...text].length);

      if (standalone) {
        const accentBox = { x: item.x, width: Math.max(trimmed.length, 1) * slot };
        const overlapPrev = previous !== undefined ? overlapX(accentBox, previous.item) : 0;
        const overlapNext = next !== undefined ? overlapX(accentBox, next.item) : 0;
        const forwardOk =
          next !== undefined &&
          first !== undefined &&
          !endsWithWhitespace(text) &&
          !startsWithWhitespace(nextText) &&
          sameFontSize(item, next.item) &&
          overlapNext > 0 &&
          compose(first.char, trimmed) !== null;
        const backwardOk =
          previous !== undefined &&
          last !== undefined &&
          !startsWithWhitespace(text) &&
          !endsWithWhitespace(previousText) &&
          sameFontSize(item, previous.item) &&
          overlapPrev > 0 &&
          overlapPrev > overlapNext &&
          compose(last.char, trimmed) !== null;

        if (forwardOk && next !== undefined && first !== undefined) {
          const composed = compose(first.char, trimmed) as string;
          texts[next.index] = replaceChar(nextText, first, composed);
          texts[index] = removeRun(text, trimmed);
          touched[next.index] = true;
          touched[index] = true;
        } else if (backwardOk && previous !== undefined && last !== undefined) {
          const composed = compose(last.char, trimmed) as string;
          texts[previous.index] = replaceChar(previousText, last, composed);
          texts[index] = removeRun(text, trimmed);
          touched[previous.index] = true;
          touched[index] = true;
        }
        break;
      }

      if (trailing.length > 0) {
        const accentBox = {
          x: item.x + item.width - trailing.length * slot,
          width: trailing.length * slot,
        };
        const head = text.slice(0, text.length - trailing.length);
        const forwardOk =
          next !== undefined &&
          first !== undefined &&
          !endsWithWhitespace(text) &&
          !startsWithWhitespace(nextText) &&
          sameFontSize(item, next.item) &&
          overlapX(accentBox, next.item) > 0 &&
          compose(first.char, trailing) !== null;
        if (forwardOk && next !== undefined && first !== undefined) {
          const composed = compose(first.char, trailing) as string;
          texts[next.index] = replaceChar(nextText, first, composed);
          texts[index] = head;
          touched[next.index] = true;
          touched[index] = true;
        }
        continue;
      }

      break; // leading or mid-item accents: the LaTeX `~ non-breaking space
    }
  }

  if (!touched.some(Boolean)) return page;
  return {
    ...page,
    items: items.map((original, index) =>
      touched[index] === true && texts[index] !== undefined
        ? { ...original, text: texts[index] }
        : original,
    ),
  };
}
