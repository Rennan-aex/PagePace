import { opensWithNoteMarker } from "./footnotes";
import type { HeadingDecision } from "./headings";
import type { JoinedParagraph } from "./pagejoin";
import { lineText } from "./spaces";

/**
 * Endnotes (E5-T03 — REQ-EXT-08, layer 4 "semântica").
 *
 * A book that moves its notes to the end of the book (or of the chapter)
 * cannot use the foot-region signals of E5-T01: the notes are set in the
 * **body size**, stand anywhere in the page and share the leading of the text
 * they annotate. What identifies them is the **section** they stand in: a
 * paragraph titled with a notes heading (`ENDNOTE_SECTION_TITLES`, matched by
 * exact normalized equality — the title has to be the word itself, so
 * "Notes on Light" is a chapter, not a section of notes), followed by a run of
 * paragraphs whose first line opens with a note marker (`opensWithNoteMarker`,
 * the very test E5-T01 applies — punctuated `1.`/`(2)`/`[3]`/`*` or the bare
 * SciELO `1 Prose…`). The run stops at the first paragraph that does not open
 * with a marker and at the first heading, and the title itself is never a
 * note.
 *
 * The notes become `footnote` blocks — the same concept the schema already
 * carries, so there is no schema change (ADR-061) — and their calls live on
 * earlier pages: `linkFootnoteCalls` falls back to the endnote list, matching
 * by label in reading order instead of by page. The `footnote_link_acc`
 * metric scores (call page, label) pairs only, so a note standing on another
 * page does not change it.
 *
 * Known limits: the title has to equal one lexicon entry — "Notes to Chapter
 * 1" or "Notes on Light" are not sections, and a book that titles the section
 * only with a symbol (`*`) is not read; a note whose first line has no
 * parseable marker stays a paragraph; the pass never raises
 * `call-without-note` by itself (only genuine foot notes make a page evidence
 * of orphans); a note of the section set smaller than the body may also be
 * caught by E5-T01 — the two passes agree on the kind; and a call appearing
 * after its note in reading order is left unlinked. Deterministic: same
 * paragraphs, same decisions.
 */

/** Section titles, normalized (NFC, lowercase): a title has to equal one of them. */
export const ENDNOTE_SECTION_TITLES = ["notes", "endnotes", "notas", "notas de rodapé"] as const;

/** One decision per input paragraph, in the same order. */
export interface EndnoteDecision {
  endnote: boolean;
}

/** Everything the decision needs from the document, measured once. */
export interface EndnoteContext {
  /** Heading decisions of the same paragraphs (the output of `detectHeadings`). */
  headings: readonly HeadingDecision[];
}

const NOT_AN_ENDNOTE: EndnoteDecision = { endnote: false };

/**
 * Title of a section, normalized the way the reader compares text: NFC,
 * trimmed, internal spaces collapsed, a trailing colon or full stop stripped
 * (typesetters print "Notes:"), case folded. Shared with the reference pass
 * (E5-T06), which matches its own lexicon the same way.
 */
export function normalizeSectionTitle(text: string): string {
  return text
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[:.]+$/u, "")
    .toLowerCase();
}

function isSectionTitle(paragraph: JoinedParagraph): boolean {
  const first = paragraph.lines[0];
  if (first === undefined) return false;
  const title = normalizeSectionTitle(lineText(first.items));
  return (ENDNOTE_SECTION_TITLES as readonly string[]).includes(title);
}

/**
 * One decision per paragraph: which paragraphs are endnotes. A title opens
 * the section (even one the pass is already inside — a second "Notes" starts
 * it again), the marker-led paragraphs that follow belong to it, and the first
 * heading or the first paragraph without a marker closes it. The title is
 * never a note. Deterministic: same paragraphs, same decisions.
 */
export function detectEndnotes(
  paragraphs: readonly JoinedParagraph[],
  context: EndnoteContext,
): EndnoteDecision[] {
  let inSection = false;
  return paragraphs.map((paragraph, index) => {
    if (isSectionTitle(paragraph)) {
      inSection = true;
      return NOT_AN_ENDNOTE;
    }
    if (!inSection) return NOT_AN_ENDNOTE;
    if (context.headings[index]?.heading === true) {
      inSection = false;
      return NOT_AN_ENDNOTE;
    }
    const first = paragraph.lines[0];
    const text = first === undefined ? "" : lineText(first.items).trim();
    if (!opensWithNoteMarker(text)) {
      inSection = false;
      return NOT_AN_ENDNOTE;
    }
    return { endnote: true };
  });
}
