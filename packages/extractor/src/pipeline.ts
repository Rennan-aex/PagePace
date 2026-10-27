import type { Block, Book, RawPage } from "@pagepace/schema";
import { analyzeDocument, type BlockChunk, buildBlockChunks, finalizeBook } from "./book";
import { ingestPages, type PdfjsIngestOptions } from "./ingest/pdfjs";

/**
 * Streaming pipeline (E8-T01, fatia 2 — protocol in ADR-088).
 *
 * `extractStream` runs the exact pipeline of `buildBook(ingestPdfjs(bytes))`
 * but emits an event per stage instead of only returning at the end:
 *
 * - `page` — while the PDF is being read, one event per page as soon as it
 *   is ready (decision 5 of the architecture: "o app começa a ler enquanto o
 *   resto processa"). The page is deep-equal to the page of the ingested
 *   document.
 * - `blocks` — while the book is being built, one event per page that
 *   produced blocks, **before** the document-wide finalization. The payload
 *   is a snapshot (`structuredClone`): the finalization that follows
 *   annotates the live blocks (`noteRef`, `level`, orphan flags) and no
 *   emitted payload ever changes afterwards.
 * - `book` — the last event, deep-equal to `buildBook(ingestPdfjs(bytes))`.
 *   The `book` is the authoritative result; `blocks` serves progressive
 *   display (ADR-088).
 *
 * Errors of the ingestion (`ScannedPdfError`, `RangeError`) propagate out of
 * the iteration, exactly like `ingestPdfjs`. Stopping the iteration early
 * tears the pdf.js task down. The read of the whole document precedes the
 * first `blocks` event — the document-wide passes of `analyzeDocument` need
 * every page (ADR-088: `documentStats` is a whole-book median,
 * `stripRepeatedRegions` sees every page).
 */

/** Emitted once per page while the PDF is being read (ADR-088). */
export interface PageEvent {
  type: "page";
  /** The page as read, deep-equal to the page of the ingested document. */
  page: RawPage;
}

/** Emitted once per page that produced blocks, while the book is built. */
export interface BlocksEvent {
  type: "blocks";
  /** `origin.pageFrom` of the blocks in the event (0-based page index). */
  pageIndex: number;
  /** Snapshot of the page's blocks, before the document-wide finalization. */
  blocks: Block[];
}

/** The last event: the book the batch pipeline produces (ADR-088). */
export interface BookEvent {
  type: "book";
  book: Book;
}

/** What {@link extractStream} emits, in the order `page` → `blocks` → `book`. */
export type ExtractStreamEvent = PageEvent | BlocksEvent | BookEvent;

/**
 * The extraction pipeline as an async generator (E8-T01, fatia 2). Same
 * bytes, same options and the same final `Book` as `ingestPdfjs` +
 * `buildBook`, with the pages and the per-page blocks arriving while the
 * work happens (ADR-088).
 */
export async function* extractStream(
  bytes: Uint8Array,
  options: PdfjsIngestOptions,
): AsyncGenerator<ExtractStreamEvent> {
  const ingested = ingestPages(bytes, options);
  try {
    let step = await ingested.next();
    while (step.done !== true) {
      yield { type: "page", page: step.value };
      step = await ingested.next();
    }
    const analysis = analyzeDocument(step.value);
    const chunks: BlockChunk[] = [];
    for (const chunk of buildBlockChunks(analysis)) {
      chunks.push(chunk);
      yield { type: "blocks", pageIndex: chunk.pageIndex, blocks: structuredClone(chunk.blocks) };
    }
    yield { type: "book", book: finalizeBook(analysis, chunks) };
  } finally {
    // An abandoned stream must still tear the pdf.js worker down: `.return()`
    // unwinds the generator at its yield, which runs the `finally` of
    // `ingestPages`. On a generator that ran to the end this is a no-op, and
    // the value is never read — the document only exists when the loop
    // drained completely.
    await ingested.return(undefined as never).catch(() => undefined);
  }
}
