import type { TextLine } from "./lines";
import type { JoinedParagraph } from "./pagejoin";

/**
 * Line claims and the paragraph cut they cause (E10).
 *
 * Tables (E10-T02) and equations (E10-T03) decide on the raw lines while
 * every other pass decides on paragraphs: `claimsByLine` turns a decision
 * list into the per-line lookup the cut needs, and `splitParagraphsAtClaims`
 * cuts the paragraphs at the claimed runs. A claimed run becomes its own
 * fragment — merged with the fragment before it when the same decision spans
 * two input paragraphs — and a paragraph with no claim keeps its identity, so
 * the index-parallel passes downstream stay aligned with `paragraphs`.
 */

/** One entry per line of the document, keyed by the line itself. */
export function claimsByLine<T extends { lines: readonly TextLine[] }>(
  decisions: readonly T[],
): Map<TextLine, T> {
  const claims = new Map<TextLine, T>();
  for (const decision of decisions) {
    for (const line of decision.lines) claims.set(line, decision);
  }
  return claims;
}

/** The paragraphs cut at the claims, the claim each fragment reads as and its source. */
export interface SplitAtClaimsResult<C> {
  /** Fragments in reading order: claimed runs cut out, the rest untouched. */
  paragraphs: JoinedParagraph[];
  /** Parallel to `paragraphs`: the claim of the fragment, `undefined` for prose. */
  claims: (C | undefined)[];
  /** Parallel to `paragraphs`: index of the input paragraph the fragment came from. */
  sources: number[];
}

/**
 * Cuts every paragraph at the lines a decision claimed (E10-T02/T03): the
 * claimed runs become their own fragments — one decision per claim, merged
 * when the claim spans two paragraphs — and the untouched paragraphs keep
 * their identity, so the per-paragraph passes downstream stay index-parallel.
 */
export function splitParagraphsAtClaims<C>(
  paragraphs: readonly JoinedParagraph[],
  claims: ReadonlyMap<TextLine, C>,
  linePages: ReadonlyMap<TextLine, number>,
): SplitAtClaimsResult<C> {
  const outParagraphs: JoinedParagraph[] = [];
  const outClaims: (C | undefined)[] = [];
  const sources: number[] = [];
  for (const [index, paragraph] of paragraphs.entries()) {
    const lines = paragraph.lines;
    if (lines.length === 0) {
      outParagraphs.push(paragraph);
      outClaims.push(undefined);
      sources.push(index);
      continue;
    }
    const runs: { start: number; end: number; claim: C | undefined }[] = [];
    let start = 0;
    let claim = claims.get(lines[0] as TextLine);
    for (let position = 1; position < lines.length; position++) {
      const next = claims.get(lines[position] as TextLine);
      if (next === claim) continue;
      runs.push({ start, end: position, claim });
      start = position;
      claim = next;
    }
    runs.push({ start, end: lines.length, claim });

    for (const run of runs) {
      const previous = outClaims[outClaims.length - 1];
      if (run.claim !== undefined && previous === run.claim) {
        const merged = outParagraphs[outParagraphs.length - 1] as JoinedParagraph;
        merged.lines.push(...lines.slice(run.start, run.end));
        merged.pageTo = linePages.get(lines[run.end - 1] as TextLine) ?? merged.pageTo;
        continue;
      }
      if (run.claim === undefined && runs.length === 1) {
        outParagraphs.push(paragraph);
        outClaims.push(undefined);
        sources.push(index);
        continue;
      }
      outParagraphs.push({
        lines: lines.slice(run.start, run.end),
        pageFrom: linePages.get(lines[run.start] as TextLine) ?? paragraph.pageFrom,
        pageTo: linePages.get(lines[run.end - 1] as TextLine) ?? paragraph.pageTo,
      });
      outClaims.push(run.claim);
      sources.push(index);
    }
  }
  return { paragraphs: outParagraphs, claims: outClaims, sources };
}
