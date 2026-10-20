// E7-T03 acceptance: a reader's corrections survive reprocessing. The Book
// comes from the production pipeline (`ingestPdfjs` + `buildBook`) over a
// synthetic PDF written by `minipdf` — no corpus needed, fully
// deterministic. The overlay carries every correction op of SCHEMA.md and
// applies 100% on the first extraction. A simulated "slightly different
// extraction" — all block ids renumbered, one paragraph split, two
// paragraphs joined, one junk line already stripped by the furniture pass
// and the run-on paragraph already split at the reader's own spot — then
// receives the same overlay again: at least 95% of the ops re-anchor by
// quote alone (the ids are all gone), and the two ops whose correction the
// new extraction already settled are reported in `unapplied`, in overlay
// order.
import { blockId, buildBook, ingestPdfjs } from "@pagepace/extractor";
import type { Anchor, Block, Book, CorrectionOp, Overlay, Run } from "@pagepace/schema";
import { applyOverlay, blockText, parseBook, parseOverlay } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

/** Share of ops that must re-anchor unaided after the re-extraction (E7-T03). */
const MIN_REANCHOR_SHARE = 0.95;
const AT = "2026-10-20T12:00:00Z";
const BODY = 12;
const HEADING = 24;
const LEADING = 15;

// Block indexes of the extracted book (asserted once below; the extraction
// is deterministic, so they stay stable).
const P_TEH = 1;
const P_COBBLESTONES = 3;
const P_EVENING = 5;
const JUNK_ADVERTISEMENT = 6;
const H_CHAPTER_TWO = 7;
const P_SOPHIE = 8;
const P_COURTYARD = 10;
const P_STAIRCASE = 11;
const P_CARTOGRAPHER = 12;
const H_CHAPTER_THREE = 13;
const P_OBSERVATORY = 14;
const P_MERIDIAN = 15;
const P_STAR_CHARTS = 16;
const P_LOG = 17;
const P_WALK = 18;
const H_CHAPTER_FOUR = 19;
const P_PRESS = 20;
const P_DICTIONARY = 21;
const P_PILOT = 22;
const P_PASSAGE = 23;
const P_KEEL = 24;
const JUNK_COLOPHON = 25;
const TOTAL_BLOCKS = 26;

/** The two ops the re-extraction leaves without work (reported unapplied). */
const UNAPPLIED_AFTER_REPROCESS = ["split-cartographer", "drop-colophon"];

function page(title: string, paragraphs: string[][], junk?: string): string {
  const streams = [textStream(title, { y: 700, size: HEADING })];
  let y = 660;
  for (const lines of paragraphs) {
    for (const [index, text] of lines.entries()) {
      streams.push(textStream(text, { y: y - index * LEADING, size: BODY }));
    }
    y -= lines.length * LEADING + 15;
  }
  if (junk !== undefined) streams.push(textStream(junk, { y: 250, size: BODY }));
  return streams.join("\n");
}

/** The synthetic book's pages: four chapters, body typos, two junk lines. */
const PAGES = [
  page(
    "Chapter One",
    [
      [
        "It began with teh discovery of a lantern stored in the",
        "old harbor house, where the salt had ruined every map and",
        "left only the brass instrument still readable by hand.",
      ],
      [
        "The keeper said the lantern had guided six ships through",
        "the winter fog, and that the last one carried a library",
        "of philosophy books printed far to the south of here.",
      ],
      [
        "We walked the cobblestones down to the water at dusk,",
        "counting the chimneys of the warehouses against the",
        "sky, each one leaning like a question left unanswered.",
      ],
      [
        "The market opened before the bells rang for the hour,",
        "and the fishmongers shouted prices that no one ever",
        "paid, least of all the printers who sold their sheets.",
      ],
      [
        "By evening the town was quiet again. The mind keeps",
        "such places long after the body has left them, and the",
        "harbor light still moves in memory like a slow tide.",
      ],
    ],
    "Advertisement. Write to press@pagepace.example about back issues.",
  ),
  page("Chpater Two", [
    [
      "Sophie's teacher once said that every question carries",
      "a hidden door, and that philosophy is only the habit",
      "of walking through doors that other people ignore.",
    ],
    [
      "The class laughed, but she wrote the sentence down",
      "twice in her notebook, once in ink and once in pencil",
      "for the day the ink might fade into the paper.",
    ],
    [
      "No one seemed to recieve the point until the snow",
      "began to fall on the courtyard and the bells stopped",
      "mid sentence, as if the town itself had paused to think.",
    ],
    [
      "The staircase of the old library creaked in three",
      "distinct places. She learned to read the sounds the",
      "way a sailor reads the weather offshore.",
    ],
    [
      "A cartographer lived above the bakery and used to",
      "seperate the rivers from the roads with a grey pencil.",
      "Graphite, he said, never lies the way colour does.",
    ],
  ]),
  page("Chapter Three", [
    [
      "The observatory definately stood on the wrong hill,",
      "every map agreed on that, and yet the door faced the",
      "sea as if the builders had argued with the surveyors.",
    ],
    [
      "Inside, a brass meridian crossed the floor and divided",
      "the room into a morning half and an evening half, and",
      "the keeper refused to stand on the wrong side of it.",
    ],
    [
      "We asked about the star charts pinned to the ceiling",
      "and he said they were forecasts of weather, not of",
      "fate, and that the difference matters more than men think.",
    ],
    [
      "Later, in the log of the station, an error occured in",
      "the column of winds, corrected twice by different hands",
      "and never agreed by either of the two assistants.",
    ],
    [
      "The walk back down took an hour and a half, past the",
      "kilns that still smoked in summer. Further down lay",
      "the orchard walls where the mirrors of the town hung.",
    ],
  ]),
  page(
    "Chapter Four",
    [
      [
        "The press on the quay was writting the same paragraph",
        "over and over, the compositors blaming the paper and",
        "the paper blaming the damp air coming off the water.",
      ],
      [
        "A dictionary lay open on the stones, marking a word",
        "that no one in the crew could pronounce correctly,",
        "so they agreed to call it simply the anchor of speech.",
      ],
      [
        "The pilot folded the chart and spoke of the city of",
        "glass, where every library keeps a copy of the same",
        "first book, written before the language had a name.",
      ],
      [
        "They paid thier passage with maps of the inland rivers,",
        "drawn at a scale no sailor needs but every editor",
        "wants, and stamped with the seal of the inland office.",
      ],
      [
        "At the keel of the old hull the painters had carved",
        "a small equation of speeds, now illegible. The curator",
        "of the museum refuses to have it restored.",
      ],
    ],
    "Colophon set in PagePace type by the quay press.",
  ),
];

async function extractBook(): Promise<Book> {
  const bytes = buildPdf(PAGES, { info: { Title: "The Harbor Philosophers" } });
  const document = await ingestPdfjs(bytes, { fileName: "harbor.pdf" });
  return buildBook(document);
}

/** First sentence cut of a block — the split point both the reader and the
 * simulated re-extraction agree on (`". "` + the following space). */
function sentenceCut(text: string): number {
  const at = text.indexOf(". ");
  if (at < 0) throw new Error(`no sentence boundary in: ${text.slice(0, 48)}`);
  return at + 2;
}

/** Mirrors the quote search of `apply.ts` (`resolveAnchor`) so the test can
 * assert uniqueness up front and the designed failures explicitly. */
function countAnchorMatches(blocks: readonly Block[], anchor: Anchor): number {
  let matches = 0;
  for (const block of blocks) {
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
      if (prefixOk && suffixOk) matches += 1;
      from = at + 1;
    }
  }
  return matches;
}

/** Anchors a correction on `needle` inside `block`, with 10 characters of
 * context, and fails fast when the anchor is not unique in the book. */
function anchorOf(blocks: readonly Block[], block: Block, needle: string): Anchor {
  const text = blockText(block);
  const start = text.indexOf(needle);
  if (start < 0) throw new Error(`needle ${JSON.stringify(needle)} not in block ${block.id}`);
  const anchor: Anchor = {
    blockId: block.id,
    start,
    end: start + needle.length,
    quote: needle,
    prefix: text.slice(Math.max(0, start - 10), start),
    suffix: text.slice(start + needle.length, start + needle.length + 10),
  };
  const matches = countAnchorMatches(blocks, anchor);
  if (matches !== 1) {
    throw new Error(`anchor for ${JSON.stringify(needle)} matches ${matches} blocks`);
  }
  return anchor;
}

function op(id: string, target: Anchor, body: Record<string, unknown>): CorrectionOp {
  return { id, createdAt: AT, target, ...body } as unknown as CorrectionOp;
}

/** Splits `runs` at an absolute character offset (same rule as `apply.ts`). */
function splitRuns(runs: readonly Run[], offset: number): { before: Run[]; after: Run[] } {
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

/**
 * A slightly different extraction of the same PDF (E7-T03): the same
 * production pipeline output, disturbed the way a heuristic tweak would
 * disturb it — every block id renumbered (the id hash folds a different
 * normalized form), paragraphs 16 and 17 already joined, paragraph 12
 * already split at the reader's own sentence cut, the colophon junk line
 * already stripped by the furniture pass. The result validates against the
 * book schema, exactly like a real extraction.
 */
function simulateReextraction(book: Book): Book {
  const V2_MERGE_SECOND = P_LOG;
  const V2_SPLIT = P_CARTOGRAPHER;
  const V2_STRIP = JUNK_COLOPHON;
  const carried: { block: Block; sources: string[] }[] = [];
  for (const [index, block] of structuredClone(book.blocks).entries()) {
    if (index === V2_STRIP) continue;
    if (index === V2_MERGE_SECOND) {
      const previous = carried.at(-1);
      if (previous === undefined) throw new Error("simulate: merge without a first block");
      previous.block.runs.push({ text: " " }, ...block.runs);
      previous.block.origin.pageTo = Math.max(previous.block.origin.pageTo, block.origin.pageTo);
      previous.block.confidence = Math.min(previous.block.confidence, block.confidence);
      previous.block.flags = [...new Set([...previous.block.flags, ...block.flags])];
      previous.sources.push(block.id);
      continue;
    }
    if (index === V2_SPLIT) {
      const { before, after } = splitRuns(block.runs, sentenceCut(blockText(block)));
      carried.push({ block: { ...block, runs: before }, sources: [block.id] });
      carried.push({ block: { ...block, runs: after }, sources: [block.id] });
      continue;
    }
    carried.push({ block, sources: [block.id] });
  }
  const idMap = new Map<string, string>();
  const ordinals = new Map<number, number>();
  const blocks: Block[] = [];
  for (const entry of carried) {
    const page = entry.block.origin.pageFrom;
    const ordinal = ordinals.get(page) ?? 0;
    ordinals.set(page, ordinal + 1);
    const nextId = blockId(page, ordinal, `v2 ${blockText(entry.block)}`);
    for (const source of entry.sources) idMap.set(source, nextId);
    blocks.push({ ...entry.block, id: nextId });
  }
  const toc = book.toc.flatMap((entry) => {
    const blockId = idMap.get(entry.blockId);
    return blockId === undefined ? [] : [{ ...entry, blockId }];
  });
  return parseBook({ ...book, toc, blocks });
}

/** The reader's corrections on the first extraction: all six op types, 42
 * ops in the order the app replays them (merges, kinds, texts, styles,
 * splits, junk removal). Every anchor is unique by construction. */
function readerOverlay(book: Book): Overlay {
  const blocks = book.blocks;
  const blockAt = (index: number): Block => {
    const block = blocks[index];
    if (block === undefined) throw new Error(`missing block ${index}`);
    return block;
  };
  const anchor = (index: number, needle: string): Anchor =>
    anchorOf(blocks, blockAt(index), needle);
  const merge = (id: string, index: number, needle: string): CorrectionOp =>
    op(id, anchor(index, needle), { op: "merge_with_next" });
  const split = (id: string, index: number, needle: string): CorrectionOp => {
    const target = anchor(index, needle);
    return op(id, target, { op: "split_at", offset: sentenceCut(blockText(blockAt(index))) });
  };
  const kind = (
    id: string,
    index: number,
    needle: string,
    kindName: string,
    level?: number,
  ): CorrectionOp =>
    op(id, anchor(index, needle), {
      op: "set_kind",
      kind: kindName,
      ...(level === undefined ? {} : { level }),
    });
  const edit = (id: string, index: number, needle: string, replacement: string): CorrectionOp =>
    op(id, anchor(index, needle), { op: "edit_text", replacement });
  const style = (
    id: string,
    index: number,
    needle: string,
    styleBody: Record<string, boolean>,
  ): CorrectionOp => {
    const target = anchor(index, needle);
    return op(id, target, {
      op: "set_style",
      start: target.start,
      end: target.end,
      style: styleBody,
    });
  };
  const drop = (id: string, index: number, needle: string): CorrectionOp =>
    op(id, anchor(index, needle), { op: "delete_block" });

  return parseOverlay({
    schemaVersion: book.schemaVersion,
    bookId: book.id,
    ops: [
      // The reader glued paragraphs (merge first: the surviving blocks keep
      // their text and every later anchor still resolves).
      merge("merge-harbor-house", P_TEH, "It began wit"),
      merge("merge-cobblestones", P_COBBLESTONES, "We walked the"),
      merge("merge-notebook", P_SOPHIE, "Sophie's teache"),
      merge("merge-observatory", P_OBSERVATORY, "The observator"),
      merge("merge-press", P_PRESS, "The press on th"),
      // Kind corrections (misread paragraphs and titles).
      kind("kind-sophie-heading", P_SOPHIE, "hidden door", "heading", 2),
      kind("kind-courtyard-quote", P_COURTYARD, "courtyard", "blockquote"),
      kind("kind-staircase-heading", P_STAIRCASE, "distinct places", "heading", 2),
      kind("kind-observatory-heading", P_OBSERVATORY, "wrong hill", "heading", 2),
      kind("kind-starcharts-heading", P_STAR_CHARTS, "star charts", "heading", 2),
      kind("kind-kilns-quote", P_WALK, "kilns", "blockquote"),
      kind("kind-press-heading", P_PRESS, "quay was", "heading", 2),
      kind("kind-pilot-quote", P_PILOT, "folded the chart", "blockquote"),
      kind("kind-passage-list", P_PASSAGE, "passage with maps", "list_item"),
      kind("kind-curator-list", P_KEEL, "curator", "list_item"),
      // Text fixes (the typos the reader caught).
      edit("fix-teh", P_TEH, "teh", "the"),
      edit("fix-chpater", H_CHAPTER_TWO, "Chpater", "Chapter"),
      edit("fix-recieve", P_COURTYARD, "recieve", "receive"),
      edit("fix-seperate", P_CARTOGRAPHER, "seperate", "separate"),
      edit("fix-definately", P_OBSERVATORY, "definately", "definitely"),
      edit("fix-occured", P_LOG, "occured", "occurred"),
      edit("fix-writting", P_PRESS, "writting", "writing"),
      edit("fix-thier", P_PASSAGE, "thier", "their"),
      // Style fixes (words the reader emphasized).
      style("style-one-bold", 0, "One", { bold: true }),
      style("style-cobblestones-bold", P_COBBLESTONES, "cobblestones", { bold: true }),
      style("style-quiet-italic", P_EVENING, "quiet", { italic: true }),
      style("style-memory-bold", P_EVENING, "memory", { bold: true }),
      style("style-creaked-italic", P_STAIRCASE, "creaked", { italic: true }),
      style("style-never-lies-bold", P_CARTOGRAPHER, "never lies", { bold: true }),
      style("style-three-italic", H_CHAPTER_THREE, "Three", { italic: true }),
      style("style-meridian-bold", P_MERIDIAN, "meridian", { bold: true }),
      style("style-mirrors-bold", P_WALK, "mirrors", { bold: true }),
      style("style-four-italic", H_CHAPTER_FOUR, "Four", { italic: true }),
      style("style-dictionary-bold", P_DICTIONARY, "dictionary", { bold: true }),
      style("style-keel-bold", P_KEEL, "keel", { bold: true }),
      // The reader also cut run-on paragraphs; the cuts come after the
      // anchors above so every quote keeps its full context.
      split("split-evening", P_EVENING, "By evening the"),
      split("split-staircase", P_STAIRCASE, "The staircase "),
      // The re-extraction already cuts this paragraph at the very same
      // sentence boundary, so the correction has nothing left to do (E7-T03).
      split("split-cartographer", P_CARTOGRAPHER, "A cartograph"),
      split("split-walk", P_WALK, "The walk back "),
      split("split-keel", P_KEEL, "At the keel of"),
      // Junk removal last (the furniture the reader deleted).
      drop("drop-advertisement", JUNK_ADVERTISEMENT, "Advertisement"),
      // The re-extraction's furniture pass already dropped this line, so
      // the correction has nothing left to delete (E7-T03).
      drop("drop-colophon", JUNK_COLOPHON, "Colophon set in"),
    ],
  });
}

function bookText(book: Book): string {
  return book.blocks.map((block) => blockText(block)).join("\n");
}

describe("E7-T03 — reader corrections survive reprocessing", () => {
  it("re-anchors ≥ 95% of the overlay after a slightly different extraction", async () => {
    const v1 = await extractBook();

    // The extraction is the production pipeline's: 4 chapters + 20 body
    // paragraphs + 2 junk lines the furniture pass kept (one page each).
    expect(v1.blocks).toHaveLength(TOTAL_BLOCKS);
    expect(v1.blocks.filter((block) => block.kind === "heading")).toHaveLength(4);
    expect(v1.metadata.language).toBe("en");

    const overlay = readerOverlay(v1);

    // First application: every correction lands on the extraction the
    // reader was looking at.
    const first = applyOverlay(v1, structuredClone(overlay));
    expect(first.unapplied).toEqual([]);
    const firstText = bookText(first.book);
    for (const typo of [
      "teh",
      "Chpater",
      "recieve",
      "seperate",
      "definately",
      "occured",
      "writting",
      "thier",
    ]) {
      expect(firstText).not.toContain(typo);
    }
    expect(firstText).not.toContain("Advertisement");
    expect(firstText).toContain(
      "It began with the discovery of a lantern stored in the old harbor house, where the salt had ruined every map and left only the brass instrument still readable by hand.The keeper said",
    );
    expect(
      first.book.blocks.some((block) =>
        blockText(block).startsWith("By evening the town was quiet again."),
      ),
    ).toBe(true);
    expect(first.book.blocks.some((block) => blockText(block).startsWith("The mind keeps"))).toBe(
      true,
    );
    const sophie = first.book.blocks.find((block) =>
      blockText(block).startsWith("Sophie's teacher"),
    );
    expect(sophie?.kind).toBe("heading");
    expect(sophie?.level).toBe(2);
    expect(
      first.book.blocks.some((block) =>
        block.runs.some((run) => run.bold === true && run.text.includes("cobblestones")),
      ),
    ).toBe(true);
    // 26 blocks − 5 merges + 5 splits − 2 deletions.
    expect(first.book.blocks).toHaveLength(24);

    // The re-extraction: same PDF, slightly different heuristics.
    const v2 = simulateReextraction(v1);
    expect(v2.id).toBe(v1.id);
    expect(v2.blocks).toHaveLength(25); // −1 join, +1 split, −1 stripped junk
    const v1Ids = new Set(v1.blocks.map((block) => block.id));
    for (const block of v2.blocks) expect(v1Ids.has(block.id)).toBe(false);

    // The designed failures are unambiguous in v1 and settled in v2.
    const colophonAnchor = overlay.ops.find((candidate) => candidate.id === "drop-colophon");
    if (colophonAnchor === undefined) throw new Error("missing drop-colophon op");
    expect(countAnchorMatches(v2.blocks, colophonAnchor.target)).toBe(0);
    const splitAnchor = overlay.ops.find((candidate) => candidate.id === "split-cartographer");
    if (splitAnchor === undefined) throw new Error("missing split-cartographer op");
    expect(splitAnchor.op === "split_at" ? splitAnchor.offset : 0).toBe(
      sentenceCut(blockText(v1.blocks[P_CARTOGRAPHER] as Block)),
    );

    // Second application: the corrections ride on the new ids by quote
    // alone, and the two the new extraction already settled show up in
    // `unapplied`, in overlay order.
    const second = applyOverlay(v2, structuredClone(overlay));
    expect(second.unapplied.map((candidate) => candidate.id)).toEqual(UNAPPLIED_AFTER_REPROCESS);
    const appliedShare = (overlay.ops.length - second.unapplied.length) / overlay.ops.length;
    expect(appliedShare).toBeGreaterThanOrEqual(MIN_REANCHOR_SHARE);
    expect(appliedShare).toBeCloseTo(40 / 42, 5);

    // The re-anchored corrections really landed on the new extraction.
    const secondText = bookText(second.book);
    for (const typo of [
      "teh",
      "Chpater",
      "recieve",
      "seperate",
      "definately",
      "occured",
      "writting",
      "thier",
    ]) {
      expect(secondText).not.toContain(typo);
    }
    expect(secondText).toContain("separate the rivers from the roads");
    expect(secondText).toContain("The curator of the museum refuses to have it restored.");
    expect(second.book.blocks).toHaveLength(23); // 25 − 5 merges + 4 splits − 1 deletion
    // The split at the reader's cut had no work left: paragraph 12 is still
    // exactly two blocks, cut after the grey pencil.
    const cartographerBlocks = second.book.blocks.filter(
      (block) =>
        blockText(block).includes("cartographer") || blockText(block).startsWith("Graphite"),
    );
    expect(cartographerBlocks).toHaveLength(2);
    expect(cartographerBlocks.some((block) => blockText(block).startsWith("Graphite"))).toBe(true);
  });

  it("is deterministic: the same re-extraction replays to the same book", async () => {
    const v1 = await extractBook();
    const overlay = readerOverlay(v1);
    const v2 = simulateReextraction(v1);
    const first = applyOverlay(v2, structuredClone(overlay));
    const second = applyOverlay(v2, structuredClone(overlay));
    expect(first).toEqual(second);
  });
});
