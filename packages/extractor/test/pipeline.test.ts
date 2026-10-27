import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type BlocksEvent,
  type BookEvent,
  buildBook,
  type ExtractStreamEvent,
  extractStream,
  ingestPdfjs,
  type PageEvent,
  ScannedPdfError,
} from "@pagepace/extractor";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it, vi } from "vitest";
import { buildPdf, textStream } from "./minipdf";

/**
 * E8-T01 fatia 2 (ADR-088): the streaming protocol.
 *
 * `extractStream` emits `page` while reading, `blocks` per page while
 * building, and closes with a `book` deep-equal to the batch pipeline —
 * and the ingestion errors keep propagating out of the iteration.
 */

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const corpusFile = path.join(repoRoot, "corpus", "public", "n2-en-arxiv-phobos.pdf");

/** Three pages of ordinary text, each closing its sentence (no page join). */
const threePagePdf = (): Uint8Array =>
  buildPdf([
    textStream("Alpha beta gamma.", { x: 72, y: 700 }),
    textStream("Delta epsilon zeta.", { x: 72, y: 700 }),
    textStream("Eta theta iota.", { x: 72, y: 700 }),
  ]);

async function collect(bytes: Uint8Array, fileName: string): Promise<ExtractStreamEvent[]> {
  const events: ExtractStreamEvent[] = [];
  for await (const event of extractStream(bytes, { fileName })) events.push(event);
  return events;
}

describe("extractStream (E8-T01 fatia 2, ADR-088)", () => {
  it("closes with one book event, deep-equal to buildBook(ingestPdfjs(bytes))", async () => {
    const bytes = threePagePdf();
    const events = await collect(bytes, "stream.pdf");

    expect(events.at(-1)?.type).toBe("book");
    const [bookEvent] = events.filter((event): event is BookEvent => event.type === "book");
    expect(bookEvent).toBeDefined();
    const batch = buildBook(await ingestPdfjs(bytes, { fileName: "stream.pdf" }));
    expect(bookEvent?.book).toEqual(batch);
  });

  it("emits every page first, in order, then one blocks event per page", async () => {
    const events = await collect(threePagePdf(), "shape.pdf");
    const pages = events.filter((event): event is PageEvent => event.type === "page");
    const blocks = events.filter((event): event is BlocksEvent => event.type === "blocks");

    expect(pages.map((event) => event.page.index)).toEqual([0, 1, 2]);
    expect(blocks.map((event) => event.pageIndex)).toEqual([0, 1, 2]);
    for (const event of blocks) {
      expect(event.blocks.length).toBeGreaterThan(0);
      expect(event.blocks.every((block) => block.origin.pageFrom === event.pageIndex)).toBe(true);
    }
    // Every page event precedes every block event (the whole document is
    // read and analyzed before the first block exists — ADR-088).
    const pagePositions = events.flatMap((event, index) => (event.type === "page" ? [index] : []));
    const blockPositions = events.flatMap((event, index) =>
      event.type === "blocks" ? [index] : [],
    );
    expect(Math.max(...pagePositions)).toBeLessThan(Math.min(...blockPositions));
    expect(events.at(-1)?.type).toBe("book");
  });

  it("reaches the first page event before the last page is read", async () => {
    const bytes = threePagePdf();
    // Spy on the pdf.js proxy prototype, the same way the cache-sweep test
    // watches `cleanup`: detector A reads page 1, then the loop reads 1..3.
    const probe = getDocument({ data: bytes.slice(), verbosity: 0 });
    const pdf = await probe.promise;
    const proto = Object.getPrototypeOf(pdf) as {
      getPage: (pageNumber: number) => Promise<unknown>;
    };
    await probe.destroy();
    const spy = vi.spyOn(proto, "getPage");

    try {
      let maxRequested = 0;
      for await (const event of extractStream(bytes, { fileName: "order.pdf" })) {
        if (event.type !== "page") continue;
        maxRequested = Math.max(...spy.mock.calls.map((call) => Number(call[0])));
        break; // abandon the stream at the first page event
      }
      // Pages 1 and 2 were requested (detector A + the first read); the last
      // page of the document had not been read when the event arrived.
      expect(spy.mock.calls.length).toBeGreaterThan(0);
      expect(maxRequested).toBeLessThan(3);
    } finally {
      spy.mockRestore();
    }
  });

  it("emits block snapshots the finalization never rewrites", async () => {
    const events = await collect(threePagePdf(), "snapshot.pdf");
    const blocksEvent = events.find(
      (event): event is BlocksEvent => event.type === "blocks",
    ) as BlocksEvent;
    const bookEvent = events.at(-1) as BookEvent;

    // The book holds the live blocks; the payload of the event is a copy
    // (ADR-088: nothing emitted is rewritten by the document-wide passes).
    expect(blocksEvent.blocks[0]).not.toBe(bookEvent.book.blocks[0]);
    expect(blocksEvent.blocks[0]?.id).toBe(bookEvent.book.blocks[0]?.id);
  });

  it("propagates ScannedPdfError out of the iteration", async () => {
    const bytes = buildPdf([""]); // a page with nothing but an empty content stream
    await expect(collect(bytes, "scan.pdf")).rejects.toThrow(ScannedPdfError);
  });

  it("propagates the RangeError of the ingestion out of the iteration", async () => {
    await expect(collect(new Uint8Array(0), "empty.pdf")).rejects.toThrow(RangeError);
  });

  it.skipIf(!existsSync(corpusFile))(
    "emits a book deep-equal to the batch pipeline on a public corpus PDF",
    async () => {
      const bytes = new Uint8Array(await readFile(corpusFile));
      const fileName = path.basename(corpusFile);
      const events = await collect(bytes, fileName);
      const bookEvent = events.find((event): event is BookEvent => event.type === "book");

      const batch = await ingestPdfjs(bytes, { fileName });
      expect(events.filter((event) => event.type === "page")).toHaveLength(batch.pages.length);
      expect(bookEvent).toBeDefined();
      expect(bookEvent?.book).toEqual(buildBook(batch));
    },
    300_000,
  );
});
