// applyOverlay (E7-T02 — REQ-EXT-14): applies the user's corrections
// (Overlay) on top of an extracted Book without losing the link to the
// original PDF. Corrections never edit the extraction in place; this
// function replays them, in order, on the book the extractor produced.
//
// Every CorrectionOp targets an Anchor (blockId + offsets + quote/prefix/
// suffix). Before an op runs, the anchor is resolved against the **current**
// book: first by id (when the id still exists and the quote still sits at
// the recorded offsets), then by searching the quote with its prefix and
// suffix across every block — that is what keeps corrections alive after a
// re-extraction changed the block ids (ADR-004). An op that cannot be
// resolved (quote gone, or the same quote matching more than one spot) is
// never dropped: it goes to `unapplied`, in order, so the app can show it.
//
// Semantics per op (ADR-072):
//   merge_with_next   the target block absorbs the next one; the first
//                     block's id/kind survive, runs concatenate, origin
//                     spans both, confidence is the minimum, flags unite,
//                     toc/noteRef/anchor references to the swallowed id
//                     retarget to the survivor.
//   split_at          the block is cut at an absolute offset; the right
//                     half gets a fresh deterministic id (`<id>#<n>`, the
//                     smallest free n ≥ 2) and the same kind/level/origin/
//                     confidence/flags; no geometry exists to divide, so
//                     both halves share the block's origin.
//   set_kind          changes the kind; heading requires `level`, any other
//                     kind drops a stale `level`.
//   delete_block      removes the block (the book always keeps ≥ 1 block),
//                     its toc entries, and clears noteRef/anchor pointers
//                     that would dangle.
//   edit_text         replaces the anchored range with `replacement`
//                     (plain, unstyled); the corrected block is user
//                     truth: confidence 1 and no doubt flags.
//   set_style         applies bold/italic/sup/sub flags on absolute offsets
//                     (true sets, false removes); runs split at the range
//                     edges so only the selected text changes.
//
// Offsets recorded in an op shift by the re-anchor delta when the quote is
// found somewhere else. Everything is deterministic (no clock, no random):
// the same book + overlay always produce the same result (rule 7).
import type { Anchor, Block, Book, Run, TocEntry } from "./book";
import { bookSchema } from "./book";
import { parseWith } from "./errors";
import type { CorrectionOp, CorrectionStyle, Overlay } from "./overlay";

export interface ApplyOverlayResult {
  /** The corrected book; valid per `parseBook`. */
  book: Book;
  /** Ops that could not be re-anchored or applied, in overlay order. */
  unapplied: CorrectionOp[];
}

/**
 * Applies `overlay.ops` in order on top of `book`. The input is never
 * mutated; the output validates against the book schema. An overlay that
 * declares another `bookId` applies nothing (every op is unapplied).
 */
export function applyOverlay(book: Book, overlay: Overlay): ApplyOverlayResult {
  if (overlay.bookId !== book.id) {
    return { book, unapplied: [...overlay.ops] };
  }
  let blocks = book.blocks.map(cloneBlock);
  let toc = book.toc.map((entry) => ({ ...entry }));
  const unapplied: CorrectionOp[] = [];
  for (const op of overlay.ops) {
    const target = resolveAnchor(blocks, op.target);
    const outcome = target ? applyOp(blocks, toc, op, target) : null;
    if (!outcome) {
      unapplied.push(op);
      continue;
    }
    blocks = outcome.blocks;
    toc = outcome.toc;
  }
  const result: Book = { ...book, toc, blocks };
  return { book: parseWith(bookSchema, result, "Book"), unapplied };
}

/** Concatenated text of a block — the reference for every anchor offset. */
export function blockText(block: Block): string {
  let text = "";
  for (const run of block.runs) text += run.text;
  return text;
}

interface ResolvedTarget {
  blockIndex: number;
  /** Absolute offsets of the anchor quote in the current block text. */
  start: number;
  end: number;
  /** `start − anchor.start`; op offsets shift by this when re-anchored. */
  delta: number;
}

/**
 * Finds where an anchor points in the current book: by id when the quote
 * still sits at the recorded offsets, otherwise by searching the quote with
 * its prefix/suffix across every block. No match or more than one match
 * means the op cannot be trusted → `null`.
 */
function resolveAnchor(blocks: readonly Block[], anchor: Anchor): ResolvedTarget | null {
  const byId = blocks.findIndex((block) => block.id === anchor.blockId);
  const idBlock = blockAt(blocks, byId);
  if (idBlock) {
    const text = blockText(idBlock);
    if (text.slice(anchor.start, anchor.end) === anchor.quote) {
      return { blockIndex: byId, start: anchor.start, end: anchor.end, delta: 0 };
    }
  }
  if (anchor.quote.length === 0) return null;
  const matches: { blockIndex: number; start: number }[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blockAt(blocks, i);
    if (!block) continue;
    const text = blockText(block);
    let from = 0;
    for (;;) {
      const at = text.indexOf(anchor.quote, from);
      if (at < 0) break;
      const prefixStart = at - anchor.prefix.length;
      const suffixStart = at + anchor.quote.length;
      const prefixOk = prefixStart >= 0 && text.slice(prefixStart, at) === anchor.prefix;
      const suffixOk =
        text.slice(suffixStart, suffixStart + anchor.suffix.length) === anchor.suffix;
      if (prefixOk && suffixOk) matches.push({ blockIndex: i, start: at });
      from = at + 1;
    }
  }
  if (matches.length !== 1) return null;
  const match = matches[0];
  if (!match) return null;
  return {
    blockIndex: match.blockIndex,
    start: match.start,
    end: match.start + anchor.quote.length,
    delta: match.start - anchor.start,
  };
}

/** `blocks[index]` with the `noUncheckedIndexedAccess` guard in one place. */
function blockAt(blocks: readonly Block[], index: number): Block | null {
  return blocks[index] ?? null;
}

type OpOutcome = { blocks: Block[]; toc: TocEntry[] } | null;

function applyOp(
  blocks: Block[],
  toc: TocEntry[],
  op: CorrectionOp,
  target: ResolvedTarget,
): OpOutcome {
  switch (op.op) {
    case "merge_with_next":
      return applyMerge(blocks, toc, target);
    case "split_at":
      return applySplit(blocks, toc, op, target);
    case "set_kind":
      return applySetKind(blocks, toc, op, target);
    case "delete_block":
      return applyDelete(blocks, toc, target);
    case "edit_text":
      return applyEditText(blocks, toc, op, target);
    case "set_style":
      return applySetStyle(blocks, toc, op, target);
  }
}

function applyMerge(blocks: Block[], toc: TocEntry[], target: ResolvedTarget): OpOutcome {
  const first = blocks[target.blockIndex];
  const second = blocks[target.blockIndex + 1];
  if (!first || !second) return null;
  const bboxes = [...(first.origin.bbox ?? []), ...(second.origin.bbox ?? [])];
  const label = first.origin.originalPageLabel ?? second.origin.originalPageLabel;
  const anchor = first.anchor ?? second.anchor;
  const placeholder = first.placeholder ?? second.placeholder;
  const merged: Block = {
    id: first.id,
    kind: first.kind,
    ...(first.level !== undefined ? { level: first.level } : {}),
    runs: [...first.runs, ...second.runs].map((run) => ({ ...run })),
    origin: {
      pageFrom: Math.min(first.origin.pageFrom, second.origin.pageFrom),
      pageTo: Math.max(first.origin.pageTo, second.origin.pageTo),
      ...(bboxes.length > 0 ? { bbox: bboxes } : {}),
      ...(label !== undefined ? { originalPageLabel: label } : {}),
    },
    confidence: Math.min(first.confidence, second.confidence),
    flags: [...new Set([...first.flags, ...second.flags])],
    ...(anchor !== undefined ? { anchor: { ...anchor } } : {}),
    ...(placeholder !== undefined ? { placeholder: { ...placeholder } } : {}),
  };
  const nextBlocks = [...blocks];
  nextBlocks.splice(target.blockIndex, 2, merged);
  return {
    blocks: retargetBlockIds(nextBlocks, second.id, first.id),
    toc: retargetToc(toc, second.id, first.id),
  };
}

function applySplit(
  blocks: Block[],
  toc: TocEntry[],
  op: Extract<CorrectionOp, { op: "split_at" }>,
  target: ResolvedTarget,
): OpOutcome {
  const block = blockAt(blocks, target.blockIndex);
  if (!block) return null;
  const text = blockText(block);
  const offset = op.offset + target.delta;
  if (!(offset > 0 && offset < text.length)) return null;
  const { before, after } = splitRunsAt(block.runs, offset);
  if (before.length === 0 || after.length === 0) return null;
  const left: Block = { ...block, runs: before };
  const right: Block = {
    id: uniqueSplitId(blocks, block.id),
    kind: block.kind,
    ...(block.level !== undefined ? { level: block.level } : {}),
    runs: after,
    origin: {
      ...block.origin,
      ...(block.origin.bbox ? { bbox: block.origin.bbox.map((box) => ({ ...box })) } : {}),
    },
    confidence: block.confidence,
    flags: [...block.flags],
  };
  const nextBlocks = [...blocks];
  nextBlocks.splice(target.blockIndex, 1, left, right);
  return { blocks: nextBlocks, toc };
}

function applySetKind(
  blocks: Block[],
  toc: TocEntry[],
  op: Extract<CorrectionOp, { op: "set_kind" }>,
  target: ResolvedTarget,
): OpOutcome {
  const block = blockAt(blocks, target.blockIndex);
  if (!block) return null;
  let next: Block;
  if (op.kind === "heading") {
    if (op.level === undefined) return null;
    next = { ...block, kind: "heading", level: op.level };
  } else {
    next = { ...block, kind: op.kind };
    delete next.level;
  }
  const nextBlocks = [...blocks];
  nextBlocks[target.blockIndex] = next;
  return { blocks: nextBlocks, toc };
}

function applyDelete(blocks: Block[], toc: TocEntry[], target: ResolvedTarget): OpOutcome {
  if (blocks.length <= 1) return null;
  const gone = blockAt(blocks, target.blockIndex);
  if (!gone) return null;
  const goneId = gone.id;
  const nextBlocks = blocks.filter((_, index) => index !== target.blockIndex);
  return {
    blocks: clearReferences(nextBlocks, goneId),
    toc: toc.filter((entry) => entry.blockId !== goneId),
  };
}

function applyEditText(
  blocks: Block[],
  toc: TocEntry[],
  op: Extract<CorrectionOp, { op: "edit_text" }>,
  target: ResolvedTarget,
): OpOutcome {
  const block = blockAt(blocks, target.blockIndex);
  if (!block) return null;
  const runs = replaceRange(block.runs, target.start, target.end, op.replacement);
  if (runs.map((run) => run.text).join("").length === 0) return null;
  const nextBlocks = [...blocks];
  nextBlocks[target.blockIndex] = { ...block, runs, confidence: 1, flags: [] };
  return { blocks: nextBlocks, toc };
}

function applySetStyle(
  blocks: Block[],
  toc: TocEntry[],
  op: Extract<CorrectionOp, { op: "set_style" }>,
  target: ResolvedTarget,
): OpOutcome {
  const block = blockAt(blocks, target.blockIndex);
  if (!block) return null;
  const text = blockText(block);
  const start = op.start + target.delta;
  const end = op.end + target.delta;
  if (start < 0 || end > text.length || end < start) return null;
  const nextBlocks = [...blocks];
  nextBlocks[target.blockIndex] = { ...block, runs: styleRuns(block.runs, start, end, op.style) };
  return { blocks: nextBlocks, toc };
}

function cloneBlock(block: Block): Block {
  return {
    ...block,
    runs: block.runs.map((run) => ({ ...run })),
    origin: {
      ...block.origin,
      ...(block.origin.bbox ? { bbox: block.origin.bbox.map((box) => ({ ...box })) } : {}),
    },
    ...(block.anchor ? { anchor: { ...block.anchor } } : {}),
    ...(block.placeholder ? { placeholder: { ...block.placeholder } } : {}),
  };
}

/** Splits `runs` at an absolute character offset; empty pieces are dropped. */
function splitRunsAt(runs: readonly Run[], offset: number): { before: Run[]; after: Run[] } {
  const before: Run[] = [];
  const after: Run[] = [];
  let position = 0;
  for (const run of runs) {
    const runEnd = position + run.text.length;
    if (runEnd <= offset) before.push({ ...run });
    else if (position >= offset) after.push({ ...run });
    else {
      const cut = offset - position;
      before.push({ ...run, text: run.text.slice(0, cut) });
      after.push({ ...run, text: run.text.slice(cut) });
    }
    position = runEnd;
  }
  return {
    before: before.filter((run) => run.text.length > 0),
    after: after.filter((run) => run.text.length > 0),
  };
}

/** Runs covering exactly [start, end) of the block text. */
function sliceRuns(runs: readonly Run[], start: number, end: number): Run[] {
  const { after } = splitRunsAt(runs, start);
  const { before } = splitRunsAt(after, end - start);
  return before;
}

/** Rebuilds runs applying `style` on [start, end): true sets, false removes. */
function styleRuns(
  runs: readonly Run[],
  start: number,
  end: number,
  style: CorrectionStyle,
): Run[] {
  if (start === end) return runs.map((run) => ({ ...run }));
  const { before: head } = splitRunsAt(runs, start);
  const middle = sliceRuns(runs, start, end).map((run) => applyStyle(run, style));
  const { after: tail } = splitRunsAt(runs, end);
  return [...head, ...middle, ...tail].filter((run) => run.text.length > 0);
}

function applyStyle(run: Run, style: CorrectionStyle): Run {
  const next: Run = { ...run };
  for (const key of ["bold", "italic", "sup", "sub"] as const) {
    const value = style[key];
    if (value === undefined) continue;
    if (value) next[key] = true;
    else delete next[key];
  }
  return next;
}

/** Replaces [start, end) with `replacement` as a plain, unstyled run. */
function replaceRange(
  runs: readonly Run[],
  start: number,
  end: number,
  replacement: string,
): Run[] {
  const { before: head } = splitRunsAt(runs, start);
  const { after: tail } = splitRunsAt(runs, end);
  const pieces = [...head, ...tail].filter((run) => run.text.length > 0);
  if (replacement.length > 0) pieces.splice(head.length, 0, { text: replacement });
  return pieces;
}

/** Smallest free `<baseId>#<n>` (n ≥ 2) — deterministic split ids. */
function uniqueSplitId(blocks: readonly Block[], baseId: string): string {
  const taken = new Set(blocks.map((block) => block.id));
  for (let n = 2; ; n++) {
    const candidate = `${baseId}#${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function retargetToc(toc: readonly TocEntry[], from: string, to: string): TocEntry[] {
  return toc.map((entry) => (entry.blockId === from ? { ...entry, blockId: to } : { ...entry }));
}

function retargetBlockIds(blocks: Block[], from: string, to: string): Block[] {
  return blocks.map((block) => {
    const runs = block.runs.map((run) => (run.noteRef === from ? { ...run, noteRef: to } : run));
    const currentAnchor = block.anchor;
    const anchor =
      currentAnchor !== undefined && currentAnchor.blockId === from
        ? { ...currentAnchor, blockId: to }
        : currentAnchor;
    const changed =
      runs.some((run, index) => run !== block.runs[index]) || anchor !== currentAnchor;
    if (!changed) return block;
    return { ...block, runs, ...(anchor !== undefined ? { anchor } : {}) };
  });
}

function clearReferences(blocks: Block[], goneId: string): Block[] {
  return blocks.map((block) => {
    const runs = block.runs.map((run) => {
      if (run.noteRef !== goneId) return run;
      const next: Run = { ...run };
      delete next.noteRef;
      return next;
    });
    const currentAnchor = block.anchor;
    const anchorCleared = currentAnchor !== undefined && currentAnchor.blockId === goneId;
    const runsChanged = runs.some((run, index) => run !== block.runs[index]);
    if (!runsChanged && !anchorCleared) return block;
    const next: Block = { ...block, runs };
    if (anchorCleared) delete next.anchor;
    return next;
  });
}
