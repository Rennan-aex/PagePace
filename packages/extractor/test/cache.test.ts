import {
  buildBook,
  extractCached,
  extractionCacheKey,
  ingestPdfjs,
  MemoryExtractionCache,
  sha256Hex,
} from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

/**
 * E8-T02: the cached batch extraction.
 *
 * Acceptance: a second opening of the same file does not reprocess (the book
 * comes from the store — proven by a hit that would throw if the PDF were
 * read), and a change of extractor or schema version invalidates the entry
 * (the key changes, so an entry under the old versions is never found).
 */

const onePagePdf = (): Uint8Array =>
  buildPdf([
    [
      textStream("Cache hit line one", { x: 72, y: 400, size: 12 }),
      textStream("Cache hit line two", { x: 72, y: 370, size: 12 }),
    ].join("\n"),
  ]);

describe("extractCached (E8-T02)", () => {
  it("misses once, hits on the second opening and stores the exact batch book", async () => {
    const bytes = onePagePdf();
    const store = new MemoryExtractionCache();

    const first = await extractCached(bytes, { fileName: "cached.pdf" }, store);
    expect(first.cacheHit).toBe(false);
    const batch = buildBook(await ingestPdfjs(bytes, { fileName: "cached.pdf" }));
    expect(first.book).toEqual(batch);

    const second = await extractCached(bytes, { fileName: "cached.pdf" }, store);
    expect(second.cacheHit).toBe(true);
    expect(second.key).toBe(first.key);
    expect(second.book).toEqual(first.book);
  });

  it("does not read the PDF on a hit: poisoned bytes reuse the stored book", async () => {
    const valid = await extractCached(
      onePagePdf(),
      { fileName: "hit.pdf" },
      new MemoryExtractionCache(),
    );
    // A store that answers every key with the valid book. If `extractCached`
    // reprocessed, the garbage bytes below would throw in the ingestion; a
    // hit returns the stored book without ever opening the PDF.
    const store = {
      get: async () => JSON.stringify(valid.book),
      set: async () => {},
    };
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const hit = await extractCached(garbage, { fileName: "hit.pdf" }, store);
    expect(hit.cacheHit).toBe(true);
    expect(hit.book).toEqual(valid.book);
  });

  it("invalidates when the extractor or the schema version changes", async () => {
    const bytes = onePagePdf();
    const sha256 = sha256Hex(bytes);
    const batch = buildBook(await ingestPdfjs(bytes, { fileName: "versions.pdf" }));

    for (const stale of [
      { extractorVersion: "9.9.9", schemaVersion: "9.9.9" }, // both bumped
      { extractorVersion: "9.9.9", schemaVersion: batch.schemaVersion }, // extractor only
      { extractorVersion: batch.extraction.version, schemaVersion: "9.9.9" }, // schema only
    ]) {
      // The entry exists — written by a build with other versions — but its
      // key differs from the key this build derives, so the lookup misses.
      const store = new MemoryExtractionCache();
      const staleKey = extractionCacheKey({ sha256, ...stale });
      await store.set(staleKey, JSON.stringify(batch));

      const result = await extractCached(bytes, { fileName: "versions.pdf" }, store);
      expect(result.cacheHit).toBe(false);
      expect(staleKey).not.toBe(result.key);
    }
  });
});
