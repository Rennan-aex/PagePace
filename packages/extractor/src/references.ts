import { normalizeSectionTitle } from "./endnotes";
import type { HeadingDecision } from "./headings";
import type { JoinedParagraph } from "./pagejoin";
import { lineText } from "./spaces";

/**
 * Bibliographic references (E5-T06 — REQ-EXT-08/19, layer 4 "semântica").
 *
 * A book gathers its bibliography under a title of its own — `References`,
 * `Bibliography`, `Works Cited`, `Referências`, `Bibliografia`, `Obras
 * citadas` — matched by **exact normalized equality** the same way the
 * endnote pass matches its own lexicon (`normalizeSectionTitle`, shared):
 * the title has to be the word itself, so "References in Everyday Life" is
 * a chapter, not a section.
 *
 * Inside the section, the paragraphs that follow the title become
 * `reference` blocks. An entry has to **open like a reference**
 * (`opensLikeReference`): a bracketed label (`[1]`, `[12b]`), a year
 * (`(2020)`, `2019,` — author-date style) or an upper-case letter, a digit
 * or an opening quote (the author, or a numbered entry of the numeric
 * style). The section closes at the first paragraph that fails that shape
 * and at the first heading; the title itself is never a reference.
 *
 * The section title is the evidence — the layout of an entry is too varied
 * to open a section on its own (a hanging indent, the "recuo deslocado" of
 * the typeset bibliography, looks like a shallow list to E5-T05 and like a
 * quote when it grows). So the indent neither opens nor closes the section;
 * inside it, `reference` simply outranks every other kind in `buildBook`,
 * including the foot-region note of E5-T01 (a numbered entry set smaller
 * than the body reads as a footnote to that pass — the backlog audit of
 * 2026-10-16 measured exactly that).
 *
 * Known limits: a bibliography with no titled section is not detected; an
 * entry split by the paragraph layer (a wrapped line that reads as new
 * prose) closes the section early; a genuine footnote standing inside the
 * section is read as a reference; and a title the lexicon does not hold
 * ("Literaturverzeichnis", "Fuentes") opens nothing. Deterministic: same
 * paragraphs, same decisions.
 */

/** Section titles, normalized (NFC, lowercase): a title has to equal one of them. */
export const REFERENCE_SECTION_TITLES = [
  "references",
  "bibliography",
  "works cited",
  "referências",
  "bibliografia",
  "obras citadas",
] as const;

/** Bracketed entry label (`[1]`, `[12b]`) that opens a numbered reference. */
export const REFERENCE_BRACKET_LABEL = /^\[[0-9]{1,4}[a-z]?\]/;

/** A year opening an author-date reference (`(2020) …`, `2019, …`). */
export const REFERENCE_YEAR_OPENING = /^\(?(?:1[5-9]|20)[0-9]{2}[a-z]?\)?[.,\s]/;

/** First character of an entry: an upper-case letter, a digit or an opening quote. */
export const REFERENCE_OPENING = /^[\p{Lu}\p{N}"'“‘«]/u;

/** One decision per input paragraph, in the same order. */
export interface ReferenceDecision {
  reference: boolean;
}

/** Everything the decision needs from the document, measured once. */
export interface ReferenceContext {
  /** Heading decisions of the same paragraphs (the output of `detectHeadings`). */
  headings: readonly HeadingDecision[];
}

const NOT_A_REFERENCE: ReferenceDecision = { reference: false };

/** Whether the first line of a paragraph opens the way a bibliography entry opens. */
export function opensLikeReference(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  return (
    REFERENCE_BRACKET_LABEL.test(trimmed) ||
    REFERENCE_YEAR_OPENING.test(trimmed) ||
    REFERENCE_OPENING.test(trimmed)
  );
}

function isSectionTitle(paragraph: JoinedParagraph): boolean {
  const first = paragraph.lines[0];
  if (first === undefined) return false;
  const title = normalizeSectionTitle(lineText(first.items));
  return (REFERENCE_SECTION_TITLES as readonly string[]).includes(title);
}

/**
 * One decision per paragraph: which paragraphs are bibliography entries. A
 * title opens the section (even one the pass is already inside — a second
 * "References" starts it again), the entry-shaped paragraphs that follow
 * belong to it, and the first heading or the first paragraph that does not
 * open like an entry closes it. The title is never a reference.
 * Deterministic: same paragraphs, same decisions.
 */
export function detectReferences(
  paragraphs: readonly JoinedParagraph[],
  context: ReferenceContext,
): ReferenceDecision[] {
  let inSection = false;
  return paragraphs.map((paragraph, index) => {
    if (isSectionTitle(paragraph)) {
      inSection = true;
      return NOT_A_REFERENCE;
    }
    if (!inSection) return NOT_A_REFERENCE;
    if (context.headings[index]?.heading === true) {
      inSection = false;
      return NOT_A_REFERENCE;
    }
    const first = paragraph.lines[0];
    const text = first === undefined ? "" : lineText(first.items);
    if (!opensLikeReference(text)) {
      inSection = false;
      return NOT_A_REFERENCE;
    }
    return { reference: true };
  });
}
