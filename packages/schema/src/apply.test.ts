import { describe, expect, it } from "vitest";
import { applyOverlay, blockText } from "./apply";
import type { Anchor, Block, Book, TocEntry } from "./book";
import {
  FIXTURE_SHA256,
  figureBlock,
  footnoteBlock,
  headingBlock,
  paragraphBlock,
  validBook,
  validOverlay,
} from "./fixtures";
import type { CorrectionOp, Overlay } from "./overlay";
import { SCHEMA_VERSION } from "./version";

const AT = "2026-10-20T12:00:00Z";
const PARA_TEXT = "Minds are not the same as a brain.";

function anchorOf(block: Block, start: number, end: number, extra?: Partial<Anchor>): Anchor {
  return {
    blockId: block.id,
    start,
    end,
    quote: blockText(block).slice(start, end),
    prefix: "",
    suffix: "",
    ...extra,
  };
}

function correction(id: string, target: Anchor, body: Record<string, unknown>): CorrectionOp {
  return { id, createdAt: AT, target, ...body } as unknown as CorrectionOp;
}

function overlayOf(ops: CorrectionOp[], bookId = FIXTURE_SHA256): Overlay {
  return { schemaVersion: SCHEMA_VERSION, bookId, ops };
}

function makeBook(blocks: Block[], toc: TocEntry[] = []): Book {
  return { ...validBook, toc, blocks };
}

function paraBlock(): Block {
  return structuredClone(paragraphBlock);
}

describe("applyOverlay", () => {
  it("returns the book untouched when the overlay has no ops", () => {
    const { book, unapplied } = applyOverlay(validBook, overlayOf([]));
    expect(unapplied).toEqual([]);
    expect(book).toEqual(validBook);
  });

  it("applies nothing when the overlay declares another bookId", () => {
    const ops = [correction("op-1", anchorOf(paragraphBlock, 0, 11), { op: "delete_block" })];
    const { book, unapplied } = applyOverlay(validBook, overlayOf(ops, "f".repeat(64)));
    expect(book).toEqual(validBook);
    expect(unapplied.map((op) => op.id)).toEqual(["op-1"]);
  });

  it("never mutates the input book", () => {
    const before = structuredClone(validBook);
    applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(headingBlock, 0, 12), { op: "merge_with_next" }),
        correction("op-2", anchorOf(paragraphBlock, 10, 13), {
          op: "edit_text",
          replacement: "certainly",
        }),
      ]),
    );
    expect(validBook).toEqual(before);
  });

  it("is deterministic: same book + overlay produce the same result", () => {
    const overlay = overlayOf([
      correction("op-1", anchorOf(paragraphBlock, 10, 13), { op: "split_at", offset: 12 }),
    ]);
    const first = applyOverlay(validBook, overlay);
    const second = applyOverlay(validBook, overlay);
    expect(first).toEqual(second);
  });

  it("keeps unapplied ops in overlay order", () => {
    const last = figureBlock;
    const ops = [
      correction("op-1", anchorOf(last, 0, 0), { op: "merge_with_next" }),
      correction("op-2", anchorOf(paragraphBlock, 0, 11, { quote: "gone forever" }), {
        op: "delete_block",
      }),
    ];
    const { unapplied } = applyOverlay(validBook, overlayOf(ops));
    expect(unapplied.map((op) => op.id)).toEqual(["op-1", "op-2"]);
  });

  it("replays the whole valid overlay fixture, leaving failures in unapplied", () => {
    const { book, unapplied } = applyOverlay(validBook, structuredClone(validOverlay));
    // op-1 merges and op-2 splits; the split breaks the quote suffix, so
    // op-3..op-6 can no longer re-anchor and go to `unapplied` in order.
    expect(book.blocks).toHaveLength(4);
    expect(unapplied.map((op) => op.id)).toEqual(["op-3", "op-4", "op-5", "op-6"]);
  });
});

describe("merge_with_next", () => {
  it("absorbs the next block: first id/kind, concatenated runs, spanned origin", () => {
    const { book, unapplied } = applyOverlay(
      validBook,
      overlayOf([correction("op-1", anchorOf(headingBlock, 0, 12), { op: "merge_with_next" })]),
    );
    expect(unapplied).toEqual([]);
    expect(book.blocks).toHaveLength(3);
    const merged = book.blocks[0];
    expect(merged?.id).toBe("b-heading-1");
    expect(merged?.kind).toBe("heading");
    expect(merged?.level).toBe(1);
    expect(blockText(merged as Block)).toBe(`Introduction${PARA_TEXT}`);
    expect(merged?.origin).toEqual({
      pageFrom: 0,
      pageTo: 1,
      bbox: [{ x: 72, y: 90, width: 300, height: 24 }],
      originalPageLabel: "12",
    });
    expect(merged?.confidence).toBe(0.9);
    expect(merged?.flags).toEqual(["uncertain-paragraph-join"]);
  });

  it("retargets toc entries and note pointers from the swallowed id", () => {
    const book = makeBook(
      [paraBlock(), structuredClone(footnoteBlock)],
      [{ title: "Note", blockId: "b-footnote-1", level: 1 }],
    );
    const { book: result } = applyOverlay(
      book,
      overlayOf([correction("op-1", anchorOf(paragraphBlock, 0, 11), { op: "merge_with_next" })]),
    );
    expect(result.toc).toEqual([{ title: "Note", blockId: "b-para-1", level: 1 }]);
    const merged = result.blocks[0] as Block;
    const call = merged.runs.find((run) => run.noteRef !== undefined);
    expect(call?.noteRef).toBe("b-para-1");
  });

  it("unapplies when the target is the last block", () => {
    const { book, unapplied } = applyOverlay(
      validBook,
      overlayOf([correction("op-1", anchorOf(figureBlock, 0, 0), { op: "merge_with_next" })]),
    );
    expect(book.blocks).toHaveLength(4);
    expect(unapplied.map((op) => op.id)).toEqual(["op-1"]);
  });
});

describe("split_at", () => {
  it("cuts the block, splitting the run that straddles the offset", () => {
    const { book, unapplied } = applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(paragraphBlock, 0, 11), { op: "split_at", offset: 12 }),
      ]),
    );
    expect(unapplied).toEqual([]);
    const left = book.blocks[1] as Block;
    const right = book.blocks[2] as Block;
    expect(blockText(left)).toBe("Minds are no");
    expect(blockText(right)).toBe("t the same as a brain.");
    expect(right.id).toBe("b-para-1#2");
    expect(left.kind).toBe("paragraph");
    expect(right.kind).toBe("paragraph");
    expect(right.confidence).toBe(left.confidence);
    expect(right.flags).toEqual(left.flags);
    expect(right.runs[0]).toEqual({ text: "t", bold: true, noteRef: "b-footnote-1" });
  });

  it("keeps the heading level on both halves", () => {
    const { book } = applyOverlay(
      validBook,
      overlayOf([correction("op-1", anchorOf(headingBlock, 0, 12), { op: "split_at", offset: 5 })]),
    );
    expect(blockText(book.blocks[0] as Block)).toBe("Intro");
    expect(blockText(book.blocks[1] as Block)).toBe("duction");
    expect(book.blocks[0]?.level).toBe(1);
    expect(book.blocks[1]?.level).toBe(1);
  });

  it("numbers repeated splits deterministically (#2 then #3)", () => {
    const { book } = applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(paragraphBlock, 0, 11), { op: "split_at", offset: 12 }),
        correction("op-2", anchorOf(paragraphBlock, 0, 10), { op: "split_at", offset: 5 }),
      ]),
    );
    const ids = book.blocks.map((block) => block.id);
    expect(ids).toContain("b-para-1#2");
    expect(ids).toContain("b-para-1#3");
  });

  it("unapplies at offset 0 and at or past the end", () => {
    for (const offset of [0, PARA_TEXT.length, PARA_TEXT.length + 3]) {
      const { unapplied } = applyOverlay(
        validBook,
        overlayOf([
          correction("op-1", anchorOf(paragraphBlock, 0, 11), { op: "split_at", offset }),
        ]),
      );
      expect(unapplied.map((op) => op.id)).toEqual(["op-1"]);
    }
  });
});

describe("set_kind", () => {
  it("turns a paragraph into a heading with the given level", () => {
    const { book } = applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(paragraphBlock, 0, 11), {
          op: "set_kind",
          kind: "heading",
          level: 2,
        }),
      ]),
    );
    expect(book.blocks[1]?.kind).toBe("heading");
    expect(book.blocks[1]?.level).toBe(2);
  });

  it("turns a heading into a paragraph and drops the stale level", () => {
    const { book } = applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(headingBlock, 0, 12), { op: "set_kind", kind: "paragraph" }),
      ]),
    );
    expect(book.blocks[0]?.kind).toBe("paragraph");
    expect("level" in (book.blocks[0] as Block)).toBe(false);
  });

  it("unapplies a heading op without level (schema requires it)", () => {
    const { book, unapplied } = applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(paragraphBlock, 0, 11), { op: "set_kind", kind: "heading" }),
      ]),
    );
    expect(book.blocks[1]?.kind).toBe("paragraph");
    expect(unapplied.map((op) => op.id)).toEqual(["op-1"]);
  });
});

describe("delete_block", () => {
  it("removes the block, its toc entries and the pointers to it", () => {
    const book = makeBook(
      [paraBlock(), structuredClone(footnoteBlock)],
      [
        { title: "Body", blockId: "b-para-1", level: 1 },
        { title: "Note", blockId: "b-footnote-1", level: 1 },
      ],
    );
    const { book: result } = applyOverlay(
      book,
      overlayOf([correction("op-1", anchorOf(footnoteBlock, 0, 18), { op: "delete_block" })]),
    );
    expect(result.blocks.map((block) => block.id)).toEqual(["b-para-1"]);
    expect(result.toc).toEqual([{ title: "Body", blockId: "b-para-1", level: 1 }]);
    const para = result.blocks[0] as Block;
    expect(para.runs.some((run) => run.noteRef !== undefined)).toBe(false);
  });

  it("clears a footnote call anchor that pointed at the deleted block", () => {
    const book = makeBook([paraBlock(), structuredClone(footnoteBlock)]);
    const { book: result } = applyOverlay(
      book,
      overlayOf([correction("op-1", anchorOf(paragraphBlock, 0, 11), { op: "delete_block" })]),
    );
    const footnote = result.blocks[0] as Block;
    expect(footnote.id).toBe("b-footnote-1");
    expect(footnote.anchor).toBeUndefined();
  });

  it("refuses to delete the last remaining block", () => {
    const book = makeBook([paraBlock()]);
    const { book: result, unapplied } = applyOverlay(
      book,
      overlayOf([correction("op-1", anchorOf(paragraphBlock, 0, 11), { op: "delete_block" })]),
    );
    expect(result.blocks).toHaveLength(1);
    expect(unapplied.map((op) => op.id)).toEqual(["op-1"]);
  });
});

describe("edit_text", () => {
  it("replaces the anchored range and treats the block as user truth", () => {
    const { book } = applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(paragraphBlock, 10, 13), {
          op: "edit_text",
          replacement: "certainly",
        }),
      ]),
    );
    const para = book.blocks[1] as Block;
    expect(blockText(para)).toBe("Minds are certainly the same as a brain.");
    expect(para.confidence).toBe(1);
    expect(para.flags).toEqual([]);
    expect(para.runs).toEqual([
      { text: "Minds are " },
      { text: "certainly" },
      { text: " the same as a brain.", italic: false },
    ]);
  });

  it("deletes a range when the replacement is empty", () => {
    const { book } = applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(paragraphBlock, 5, 9), { op: "edit_text", replacement: "" }),
      ]),
    );
    expect(blockText(book.blocks[1] as Block)).toBe("Minds not the same as a brain.");
  });

  it("replaces the whole block text via a full-quote anchor", () => {
    const { book } = applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(paragraphBlock, 0, PARA_TEXT.length), {
          op: "edit_text",
          replacement: "Fixed by the reader.",
        }),
      ]),
    );
    expect(book.blocks[1]?.runs).toEqual([{ text: "Fixed by the reader." }]);
  });

  it("unapplies when the replacement would empty the block", () => {
    const { book, unapplied } = applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(paragraphBlock, 0, PARA_TEXT.length), {
          op: "edit_text",
          replacement: "",
        }),
      ]),
    );
    expect(blockText(book.blocks[1] as Block)).toBe(PARA_TEXT);
    expect(unapplied.map((op) => op.id)).toEqual(["op-1"]);
  });
});

describe("set_style", () => {
  it("sets a flag on the range, splitting runs at its edges", () => {
    const { book } = applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(paragraphBlock, 0, 5), {
          op: "set_style",
          start: 0,
          end: 5,
          style: { bold: true },
        }),
      ]),
    );
    const para = book.blocks[1] as Block;
    expect(para.runs[0]).toEqual({ text: "Minds", bold: true });
    expect(para.runs[1]).toEqual({ text: " are " });
    expect(para.runs[2]).toEqual({ text: "not", bold: true, noteRef: "b-footnote-1" });
    expect(blockText(para)).toBe(PARA_TEXT);
  });

  it("removes a flag when the value is false", () => {
    const { book } = applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(paragraphBlock, 10, 13), {
          op: "set_style",
          start: 10,
          end: 13,
          style: { bold: false },
        }),
      ]),
    );
    const call = (book.blocks[1] as Block).runs[1];
    expect(call).toEqual({ text: "not", noteRef: "b-footnote-1" });
    expect("bold" in (call as NonNullable<typeof call>)).toBe(false);
  });

  it("unapplies when the range is outside the block text", () => {
    const { book, unapplied } = applyOverlay(
      validBook,
      overlayOf([
        correction("op-1", anchorOf(paragraphBlock, 0, 11), {
          op: "set_style",
          start: 0,
          end: PARA_TEXT.length + 5,
          style: { italic: true },
        }),
      ]),
    );
    expect(book.blocks[1]?.runs).toEqual(paragraphBlock.runs);
    expect(unapplied.map((op) => op.id)).toEqual(["op-1"]);
  });
});

describe("re-anchoring", () => {
  it("re-anchors into the block that now holds the quote when ids changed", () => {
    const reextracted: Block[] = [
      { ...structuredClone(headingBlock), id: "p0-b0-aaaa" },
      { ...paraBlock(), id: "p0-b1-bbbb" },
      { ...structuredClone(footnoteBlock), id: "p0-b2-cccc" },
    ];
    const stale = anchorOf(footnoteBlock, 0, 18);
    const { book, unapplied } = applyOverlay(
      makeBook(reextracted),
      overlayOf([correction("op-1", stale, { op: "set_kind", kind: "paragraph" })]),
    );
    expect(unapplied).toEqual([]);
    expect(book.blocks[2]?.kind).toBe("paragraph");
  });

  it("falls back to the quote when the id exists but the text moved", () => {
    const stale: Anchor = {
      blockId: "b-para-1",
      start: 0,
      end: 12,
      quote: "Introduction",
      prefix: "",
      suffix: "",
    };
    const { book } = applyOverlay(
      validBook,
      overlayOf([correction("op-1", stale, { op: "set_kind", kind: "paragraph" })]),
    );
    expect(book.blocks[0]?.kind).toBe("paragraph");
    expect(book.blocks[1]?.kind).toBe("paragraph");
  });

  it("shifts op offsets by the re-anchor delta", () => {
    const shifted: Block = {
      ...paraBlock(),
      id: "p1-b0-zzzz",
      runs: [{ text: `Einstein said: ${PARA_TEXT}` }],
    };
    const stale: Anchor = {
      blockId: "b-para-1",
      start: 10,
      end: 13,
      quote: "not",
      prefix: "",
      suffix: "",
    };
    const { book, unapplied } = applyOverlay(
      makeBook([shifted]),
      overlayOf([
        correction("op-1", stale, {
          op: "set_style",
          start: 10,
          end: 13,
          style: { bold: true },
        }),
      ]),
    );
    expect(unapplied).toEqual([]);
    const block = book.blocks[0] as Block;
    expect(block.runs).toEqual([
      { text: "Einstein said: Minds are " },
      { text: "not", bold: true },
      { text: " the same as a brain." },
    ]);
  });

  it("unapplies when the quote is gone", () => {
    const stale: Anchor = {
      blockId: "b-para-1-deleted",
      start: 0,
      end: 5,
      quote: "Minds",
      prefix: "",
      suffix: " totally different tail",
    };
    const { unapplied } = applyOverlay(
      validBook,
      overlayOf([correction("op-1", stale, { op: "delete_block" })]),
    );
    expect(unapplied.map((op) => op.id)).toEqual(["op-1"]);
  });

  it("unapplies when the quote matches more than one spot", () => {
    const twin: Block = { ...paraBlock(), id: "p0-b3-twin" };
    const stale: Anchor = {
      blockId: "gone",
      start: 0,
      end: PARA_TEXT.length,
      quote: PARA_TEXT,
      prefix: "",
      suffix: "",
    };
    const { unapplied } = applyOverlay(
      makeBook([paraBlock(), twin]),
      overlayOf([correction("op-1", stale, { op: "delete_block" })]),
    );
    expect(unapplied.map((op) => op.id)).toEqual(["op-1"]);
  });

  it("picks the right occurrence with the prefix", () => {
    const chatty: Block = {
      ...paraBlock(),
      id: "p0-b0-talk",
      runs: [{ text: "Hello a. Hello b." }],
    };
    const stale: Anchor = {
      blockId: "gone",
      start: 0,
      end: 5,
      quote: "Hello",
      prefix: "a. ",
      suffix: "",
    };
    const { book } = applyOverlay(
      makeBook([chatty]),
      overlayOf([
        correction("op-1", stale, {
          op: "set_style",
          start: 0,
          end: 5,
          style: { italic: true },
        }),
      ]),
    );
    const block = book.blocks[0] as Block;
    expect(block.runs).toEqual([
      { text: "Hello a. " },
      { text: "Hello", italic: true },
      { text: " b." },
    ]);
  });

  it("re-anchors a later op into the block created by a merge", () => {
    const noteAnchor = anchorOf(footnoteBlock, 0, 18);
    const { book, unapplied } = applyOverlay(
      makeBook([paraBlock(), structuredClone(footnoteBlock)]),
      overlayOf([
        correction("op-1", anchorOf(paragraphBlock, 0, 11), { op: "merge_with_next" }),
        correction("op-2", noteAnchor, { op: "edit_text", replacement: "Fixed note." }),
      ]),
    );
    expect(unapplied).toEqual([]);
    expect(blockText(book.blocks[0] as Block)).toBe(`${PARA_TEXT}Fixed note.`);
  });

  it("sends later ops to unapplied when a delete removed their only copy", () => {
    const noteAnchor = anchorOf(footnoteBlock, 0, 18);
    const { unapplied } = applyOverlay(
      makeBook([paraBlock(), structuredClone(footnoteBlock)]),
      overlayOf([
        correction("op-1", anchorOf(footnoteBlock, 0, 18), { op: "delete_block" }),
        correction("op-2", noteAnchor, { op: "set_kind", kind: "paragraph" }),
      ]),
    );
    expect(unapplied.map((op) => op.id)).toEqual(["op-2"]);
  });
});
