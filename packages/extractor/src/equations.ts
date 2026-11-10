import type { TextLine } from "./lines";
import type { JoinedParagraph } from "./pagejoin";
import { lineText } from "./spaces";
import type { TableDecision } from "./tables";
import { normalizeForReader } from "./unicode";

/**
 * Equations (E10-T03 — layer 4, "semântica").
 *
 * A paragraph whose lines all read as math — a broken piece of the same
 * formula included — becomes one `equation` block instead of prose carrying
 * math junk in the reader's text
 * (REQ-EXT-11). A line reads as math when it is not a side line and carries
 * no dot-leader, its characters sit in the document's math fonts
 * (`EQUATION_MATH_FONT_SHARE` of them) or its symbols are dense enough
 * (`EQUATION_SYMBOL_DENSITY`) or the typesetter printed its equation number
 * beside a relation; on top of that the line must hold a relation (`=`, `≈`,
 * `≤` …) or be short (`EQUATION_SHORT_WORDS`) — the qualifier that keeps a
 * prose line sprinkled with symbols out — carry at least one math symbol,
 * which is what keeps the superscripted author affiliation of a
 * by-line (set in CMMI, no symbol at all) a paragraph, and never trail off
 * into a word of prose (`Portanto`, `we obtain`), which is how a sentence
 * with inline math stays a sentence; a line too poor to
 * pass the gate on its own but carrying the ink of math and no word of prose
 * (`EQUATION_FRAGMENT_PROSE_WORDS`, never sentence punctuation) rides along
 * with the candidate lines of its paragraph. Consecutive equation
 * paragraphs on the same page and band, at most `EQUATION_LINK_GAP_FACTOR` ×
 * the body size apart, chain into a single decision, so a multi-line
 * derivation reads as one block (the split merges them, `claims.ts`).
 *
 * Tables claim first (ADR-100 priority `table > equation`): a paragraph a
 * table already claimed is never an equation. Known limits: a figure's
 * annotation lines that pass the gate are claimed too (no `nonText` guard),
 * a mostly-math short line of running text reads as an equation, and a
 * derivation broken by the page break stays two blocks.
 */

/** Share of a line's characters that must sit in a math font for the font gate. */
export const EQUATION_MATH_FONT_SHARE = 0.25;
/** Share of a line's characters that must be math symbols for the density gate. */
export const EQUATION_SYMBOL_DENSITY = 0.2;
/** Words above which a line needs a relation symbol to count as math. */
export const EQUATION_SHORT_WORDS = 8;
/** Plain lowercase words (`the`, `and`) a broken piece of a formula may hold:
 * none — the ink of math plus a digit is all such a line has, which keeps a
 * running head (`Article number, page 2`) and a heading (`4.2 Results`) out. */
export const EQUATION_FRAGMENT_PROSE_WORDS = 0;
/** Vertical space (x body) still allowed between two chained equation paragraphs. */
export const EQUATION_LINK_GAP_FACTOR = 1.5;
/** A dot-only item at least this wide (x body) is a contents leader, not content. */
export const EQUATION_DOT_LEADER_FACTOR = 1.0;

/** Math fonts a producer sets equations in (subset prefixes aside). */
const MATH_FONT =
  /C(MMI|MSY|EX)|MSAM|MSBM|Math|Symbol|rtx(mi|sy|ex)|tx(mi|sy|ex)|stix|mt(ex|2)|Euclid|EuScript|rsfs|Zapf/i;

/** Math symbols of a line: relations, operators and signs (prose punctuation out —
 * the ASCII hyphen is a word hyphen far more often than a minus, so only the
 * real minus sign `−` counts). */
const MATH_SYMBOL = /[=+−×÷±·⋅√∫∑∏∂∇∞≈≃≠≤≥≪≫→←↔⇒⇔∀∃∈∉⊂⊃⊆∪∩∧∨¬∼∝∘⟨⟩⊕⊗|/]/g;

/** A relation symbol: the line states an equation, not a list of symbols. */
const MATH_RELATION = /[=≈≃≡≤≥≪≫]/;

/** The typesetter's equation number at the line end (`(18)`, `(2.1)`), never a year. */
const EQUATION_TAG = /\(\d{1,3}(?:\.\d{1,2})?\)\s*$/;

/** A word of prose trailing the line (`Portanto`, `we obtain`): a sentence,
 * not a formula — an equation ends in a sign, a digit, a bracket or a
 * variable, never in `de modo que`. */
const PROSE_TAIL = /[a-z]{4,}$/;

/** A dot-only item wide enough to be a contents leader. */
const DOT_LEADER = /^[.·•‥…]+$/;

/** One equation of the document, ready to become an `equation` block (E10-T03). */
export interface EquationDecision {
  /** Marks the decision, like `quote`/`list`/`caption`. */
  equation: true;
  /** Lines of the equation in reading order (a chained derivation included). */
  lines: TextLine[];
}

/** Whitespace-free characters of the items of one line. */
function charCount(items: readonly { text: string }[]): number {
  let count = 0;
  for (const item of items) count += item.text.replace(/\s+/g, "").length;
  return count;
}

/** Words of a line: what `EQUATION_SHORT_WORDS` counts. */
function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Whether any item of the line is a dot-only run wide enough to be a contents leader. */
function hasDotLeader(line: TextLine, bodyFontSize: number): boolean {
  const minWidth = EQUATION_DOT_LEADER_FACTOR * bodyFontSize;
  for (const entry of line.items) {
    const text = entry.text.trim();
    if (text !== "" && DOT_LEADER.test(text) && entry.width >= minWidth) return true;
  }
  return false;
}

/** Whether the line reads as math — font share or symbol density, plus relation or brevity. */
function equationLine(line: TextLine, bodyFontSize: number): boolean {
  if (line.side === true) return false;
  const items = line.items.filter((entry) => entry.text.trim() !== "");
  if (items.length === 0) return false;
  if (hasDotLeader(line, bodyFontSize)) return false;
  const text = lineText(line.items);
  const chars = charCount(items);
  if (chars === 0) return false;
  if (PROSE_TAIL.test(text.trimEnd())) return false;
  let mathChars = 0;
  for (const entry of items) {
    if (MATH_FONT.test(entry.fontName)) mathChars += entry.text.replace(/\s+/g, "").length;
  }
  const symbols = text.match(MATH_SYMBOL)?.length ?? 0;
  // A line without a single math symbol is not math: the affiliation
  // superscripts of a by-line sit in CMMI but the line reads as prose.
  if (symbols === 0) return false;
  const strong =
    mathChars / chars >= EQUATION_MATH_FONT_SHARE ||
    symbols / chars >= EQUATION_SYMBOL_DENSITY ||
    // A printed equation number is the typesetter saying "this line is the
    // formula" — it carries a relation, so a citation never matches.
    (MATH_RELATION.test(text) && EQUATION_TAG.test(text));
  if (!strong) return false;
  return MATH_RELATION.test(text) || wordCount(text) <= EQUATION_SHORT_WORDS;
}

/** Sentence punctuation a fragment of a formula never ends with. */
const FRAGMENT_STOP = /[.!?,;:]$/;

/** A plain lowercase word of prose (`the`, `and`) — a formula never spells one. */
const PROSE_WORD = /^[a-z]{2,}$/;

/** A digit: together with the math symbols it is the ink of a formula. */
const DIGIT = /\d/;

/**
 * Whether the line is the remainder of a formula the typesetter broke over
 * two lines (a numerator like `M2 3M2(2a2 − b2 − c2) 3M1a`): it carries the
 * ink of math, spells no word of prose and never ends a sentence — so it can
 * ride along with the candidate lines of its paragraph instead of breaking
 * the claim, while a line of running text still can not.
 */
function equationFragment(line: TextLine, bodyFontSize: number): boolean {
  if (line.side === true) return false;
  if (hasDotLeader(line, bodyFontSize)) return false;
  const text = lineText(line.items).trimEnd();
  if (FRAGMENT_STOP.test(text)) return false;
  const symbols = text.match(MATH_SYMBOL)?.length ?? 0;
  if (symbols === 0 && !DIGIT.test(text)) return false;
  const proseWords = text.split(/\s+/).filter((token) => PROSE_WORD.test(token)).length;
  return proseWords <= EQUATION_FRAGMENT_PROSE_WORDS;
}

/**
 * Every equation of the document, in reading order. A paragraph a table
 * already claimed is skipped (ADR-100), so the decisions only ever hold the
 * lines the tables left; the claim itself is the maximal run of claimable
 * lines of a paragraph that holds at least one line passing the full math
 * gate — a line of running text ends the run and keeps its neighbours out,
 * while a broken piece of the same formula rides along. Consecutive runs of
 * one page and band chain into one decision.
 */
export function detectEquations(
  paragraphs: readonly JoinedParagraph[],
  options: { bodyFontSize: number; tables: readonly (TableDecision | undefined)[] },
): EquationDecision[] {
  const decisions: EquationDecision[] = [];
  let current: EquationDecision | undefined;
  let lastLine: TextLine | undefined;
  let currentPage = -1;
  const breakChain = (): void => {
    current = undefined;
    lastLine = undefined;
    currentPage = -1;
  };
  const emit = (run: readonly TextLine[], paragraph: JoinedParagraph): void => {
    const first = run[0] as TextLine;
    const last = run[run.length - 1] as TextLine;
    const link =
      current !== undefined &&
      lastLine !== undefined &&
      paragraph.pageFrom === paragraph.pageTo &&
      paragraph.pageFrom === currentPage &&
      first.band === lastLine.band &&
      first.top - lastLine.bottom <= EQUATION_LINK_GAP_FACTOR * options.bodyFontSize;
    if (link && current !== undefined) {
      current.lines.push(...run);
    } else {
      current = { equation: true, lines: [...run] };
      decisions.push(current);
    }
    lastLine = last;
    currentPage = paragraph.pageTo;
  };
  for (const [index, paragraph] of paragraphs.entries()) {
    if (options.tables[index] !== undefined || paragraph.lines.length === 0) {
      breakChain();
      continue;
    }
    const lines = paragraph.lines;
    let start = -1;
    let candidate = false;
    for (let position = 0; position <= lines.length; position++) {
      const line = position < lines.length ? (lines[position] as TextLine) : undefined;
      if (line !== undefined) {
        const isCandidate = equationLine(line, options.bodyFontSize);
        if (isCandidate || equationFragment(line, options.bodyFontSize)) {
          if (start === -1) {
            start = position;
            candidate = false;
          }
          if (isCandidate) candidate = true;
          continue;
        }
      }
      if (start !== -1) {
        const run = lines.slice(start, position);
        if (candidate) emit(run, paragraph);
        else breakChain();
        start = -1;
        candidate = false;
      }
      // A line of running text parts the decisions: the next one starts
      // fresh instead of chaining across it. The end of a paragraph keeps
      // the chain alive — the next paragraph may continue the same formula.
      if (line !== undefined) breakChain();
    }
  }
  return decisions;
}

/** The equation as the reader gets it: one normalized line per line of math. */
export function equationText(decision: EquationDecision): string {
  return normalizeForReader(decision.lines.map((line) => lineText(line.items)).join("\n"));
}
