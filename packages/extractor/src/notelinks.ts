import type { BlockAnchor, BlockKind } from "@pagepace/schema";
import { FOOTNOTE_BARE_MARKER, FOOTNOTE_MARKER } from "./footnotes";

/**
 * Footnote calls (E5-T02 — REQ-EXT-08, layer 4 "semântica").
 *
 * Each note is linked to the call that points at it. The two live on the
 * **same page** (numbering restarts by page and by chapter, so a label
 * without a page is meaningless), and the match is on the **label**: the
 * marker the note opens with (`1.`, `(2)`, `[3]`, `*`) against the text of a
 * superscript run (`Run.sup`, `runs.ts`) that is itself a call marker
 * (`NOTE_CALL_TEXT`). The schema contract already exists — the call's run
 * gets `noteRef` (the id of the note block) and the note gets `anchor`
 * (`BlockAnchor`: the call's block, run, offset and label).
 *
 * Orphans become flags, never silent drops:
 * - a note with no call on its page carries `note-without-call`;
 * - a superscript call whose label matches no note is `call-without-note`,
 *   but **only on a page that has at least one detected note** — a page
 *   without notes gives no evidence at all, so exponents (`x2`) and
 *   ordinals (`21st`) outside the footnote machinery stay untouched.
 *
 * Both flags carry `NOTE_LINK_UNCERTAIN_CONFIDENCE` (the ARCHITECTURE
 * decision 6 pattern). Limits, on purpose: a note whose first line has no
 * parseable marker (the rule-only uncertain note) is neither linked nor
 * flagged — nothing names its call; an OCR text layer (`styles: false`)
 * never gets the pass, because without `sup` it could only invent flags;
 * and a call whose block spans a page boundary searches each of its pages.
 * Deterministic: same blocks, same decisions.
 */

/** Flag of a note whose page has no call pointing at it. */
export const NOTE_WITHOUT_CALL_FLAG = "note-without-call";
/** Flag of a block holding a call whose label matches no note of its page. */
export const CALL_WITHOUT_NOTE_FLAG = "call-without-note";
/** Reduced confidence of a block carrying either flag. */
export const NOTE_LINK_UNCERTAIN_CONFIDENCE = 0.7;

/** Superscript text that can be a call: digits, or footnote symbols, brackets allowed. */
export const NOTE_CALL_TEXT = /^(?:\(\d{1,3}\)|\[\d{1,3}\]|\d{1,3}|[*†‡§¶]{1,3})$/;

/** The label a marker carries: `1.` → `1`, `(2)` → `2`, `††` → `††`. */
function normalizeLabel(marker: string): string {
  const digits = /\d{1,3}/.exec(marker);
  if (digits !== null) return digits[0];
  return marker.replace(/[^*†‡§¶]/g, "");
}

/** Label of the marker a note opens with, or `null` when there is no marker. */
export function noteMarkerLabel(text: string): string | null {
  const trimmed = text.trimStart();
  const punctuated = FOOTNOTE_MARKER.exec(trimmed);
  if (punctuated !== null) return normalizeLabel(punctuated[0]);
  const bare = FOOTNOTE_BARE_MARKER.exec(trimmed);
  if (bare !== null) return normalizeLabel(bare[0]);
  return null;
}

/** Label of a superscript call, or `null` when the run text is not a call marker. */
export function callLabel(text: string): string | null {
  const trimmed = text.trim();
  if (!NOTE_CALL_TEXT.test(trimmed)) return null;
  return normalizeLabel(trimmed);
}

/** What the linking pass needs from a block (the `Book` blocks, narrowed). */
export interface NoteCallBlock {
  id: string;
  kind: BlockKind;
  pageFrom: number;
  pageTo: number;
  runs: readonly { text: string; sup?: boolean }[];
}

/** One decision per input block, in the same order. */
export interface NoteLinkDecision {
  /** runIndex → id of the note block that run calls. */
  noteRefs: ReadonlyMap<number, string>;
  /** Anchor of the first call, to write on the note block. */
  anchor: BlockAnchor | null;
  /** The note has no call pointing at it. */
  withoutCall: boolean;
  /** The block holds a call whose label matches no note of a page with notes. */
  orphanCall: boolean;
}

/** Mutable twin of `NoteLinkDecision`, built once per block. */
interface MutableDecision {
  noteRefs: Map<number, string>;
  anchor: BlockAnchor | null;
  withoutCall: boolean;
  orphanCall: boolean;
}

/**
 * Links every note to its call (E5-T02). Reads the blocks in order, matches
 * calls to notes by `(page, label)` and reports what to write back:
 * `noteRefs` for the call runs, `anchor` for the note, and the two orphan
 * flags. The caller applies the decisions (and the confidence floor);
 * this function never mutates its input.
 */
export function linkFootnoteCalls(blocks: readonly NoteCallBlock[]): NoteLinkDecision[] {
  const decisions: MutableDecision[] = blocks.map(() => ({
    noteRefs: new Map<number, string>(),
    anchor: null,
    withoutCall: false,
    orphanCall: false,
  }));

  // Notes by page and label: the first note in reading order wins a label,
  // a later one with the same label on the same page is simply not callable.
  const notesByPage = new Map<number, Map<string, number>>();
  const pagesWithNotes = new Set<number>();
  blocks.forEach((block, index) => {
    if (block.kind !== "footnote") return;
    const text = block.runs.map((run) => run.text).join("");
    const label = noteMarkerLabel(text);
    if (label === null) return;
    pagesWithNotes.add(block.pageFrom);
    const byLabel = notesByPage.get(block.pageFrom) ?? new Map<string, number>();
    if (!byLabel.has(label)) byLabel.set(label, index);
    notesByPage.set(block.pageFrom, byLabel);
  });

  const called = new Set<number>();
  blocks.forEach((block, index) => {
    if (block.kind === "footnote") return;
    const decision = decisions[index];
    if (decision === undefined) return;
    block.runs.forEach((run, runIndex) => {
      if (run.sup !== true) return;
      const label = callLabel(run.text);
      if (label === null) return;
      let noteIndex: number | undefined;
      for (let page = block.pageFrom; page <= block.pageTo; page += 1) {
        noteIndex = notesByPage.get(page)?.get(label);
        if (noteIndex !== undefined) break;
      }
      if (noteIndex === undefined) {
        // A page without notes cannot tell a call from an exponent: only a
        // page that has notes makes the absence meaningful.
        for (let page = block.pageFrom; page <= block.pageTo; page += 1) {
          if (pagesWithNotes.has(page)) {
            decision.orphanCall = true;
            return;
          }
        }
        return;
      }
      const note = blocks[noteIndex];
      if (note === undefined) return;
      decision.noteRefs.set(runIndex, note.id);
      called.add(noteIndex);
      // The anchor is written on the NOTE: it points back at this call.
      const noteDecision = decisions[noteIndex];
      if (noteDecision !== undefined && noteDecision.anchor === null) {
        const offset = Math.max(0, run.text.indexOf(label));
        noteDecision.anchor = { blockId: block.id, runIndex, offset, label };
      }
    });
  });

  // A label-carrying note nobody called. The first call already claimed the
  // label above, so a duplicate label on the same page is flagged too.
  blocks.forEach((block, index) => {
    if (block.kind !== "footnote" || called.has(index)) return;
    const decision = decisions[index];
    if (decision === undefined) return;
    const text = block.runs.map((run) => run.text).join("");
    if (noteMarkerLabel(text) === null) return;
    decision.withoutCall = true;
  });

  return decisions;
}
