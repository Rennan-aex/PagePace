import { SCHEMA_VERSION } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import {
  EXTRACTOR_VERSION,
  extractionCacheKey,
  extractionCacheKeyFor,
  MemoryExtractionCache,
  readCachedBook,
  writeCachedBook,
} from "./index";

/**
 * E8-T02: the cache key and the store contract.
 *
 * The key is `(sha256, extractorVersion, schemaVersion)`: identical for the
 * same file under the same code, different when either version bumps — which
 * is what invalidates an entry without a cleanup pass.
 */

const bookFixture = {
  schemaVersion: SCHEMA_VERSION,
  id: "ab".repeat(32),
  source: { fileName: "cache.pdf", pageCount: 1 },
  metadata: { language: "pt" },
  toc: [],
  blocks: [
    {
      id: "blk-1",
      kind: "paragraph",
      confidence: 0.9,
      flags: [],
      origin: {
        pageFrom: 0,
        pageTo: 0,
        bbox: [{ x: 0, y: 0, width: 10, height: 1 }],
      },
      runs: [{ text: "linha de teste" }],
    },
  ],
  extraction: {
    tool: "@pagepace/extractor",
    version: EXTRACTOR_VERSION,
    avgConfidence: 0.9,
    warnings: [],
  },
} as const;

describe("extractionCacheKey (E8-T02)", () => {
  it("joins the three parts deterministically", () => {
    const key = extractionCacheKey({
      sha256: "a".repeat(64),
      extractorVersion: "0.0.0",
      schemaVersion: "1.2.0",
    });
    expect(key).toBe(`${"a".repeat(64)}-0.0.0-1.2.0`);
    expect(
      extractionCacheKey({
        sha256: "a".repeat(64),
        extractorVersion: "0.0.0",
        schemaVersion: "1.2.0",
      }),
    ).toBe(key);
  });

  it("changes when the file, the extractor version or the schema version changes", () => {
    const base = { sha256: "a".repeat(64), extractorVersion: "0.0.0", schemaVersion: "1.2.0" };
    const key = extractionCacheKey(base);
    expect(extractionCacheKey({ ...base, sha256: "b".repeat(64) })).not.toBe(key);
    expect(extractionCacheKey({ ...base, extractorVersion: "0.1.0" })).not.toBe(key);
    expect(extractionCacheKey({ ...base, schemaVersion: "1.3.0" })).not.toBe(key);
  });

  it("derives the key of some bytes from the versions this build carries", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const key = extractionCacheKeyFor(bytes);
    expect(key).toContain(EXTRACTOR_VERSION);
    expect(key).toContain(SCHEMA_VERSION);
    expect(key.startsWith(extractionCacheKeyFor(bytes))).toBe(true);
    expect(extractionCacheKeyFor(new Uint8Array([1, 2, 4]))).not.toBe(key);
  });
});

describe("MemoryExtractionCache + read/writeCachedBook (E8-T02)", () => {
  it("round-trips a book through the store", async () => {
    const store = new MemoryExtractionCache();
    const key = extractionCacheKeyFor(new Uint8Array([9]));
    expect(await readCachedBook(store, key)).toBeNull();

    const book = JSON.parse(JSON.stringify(bookFixture));
    await writeCachedBook(store, key, book);
    expect(await readCachedBook(store, key)).toEqual(book);
  });

  it("treats a corrupt or schema-stale entry as a miss, never a crash", async () => {
    const store = new MemoryExtractionCache();
    const key = extractionCacheKeyFor(new Uint8Array([7]));
    await store.set(key, "not json {");
    expect(await readCachedBook(store, key)).toBeNull();

    const staleKey = extractionCacheKeyFor(new Uint8Array([8]));
    await store.set(staleKey, JSON.stringify({ schemaVersion: "0.0.1", nope: true }));
    expect(await readCachedBook(store, staleKey)).toBeNull();
  });
});
