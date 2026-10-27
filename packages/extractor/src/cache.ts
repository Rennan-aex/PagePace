import type { Book } from "@pagepace/schema";
import { parseBook, SCHEMA_VERSION } from "@pagepace/schema";
import { buildBook, EXTRACTOR_VERSION } from "./book";
import { ingestPdfjs, type PdfjsIngestOptions } from "./ingest/pdfjs";
import { sha256Hex } from "./ingest/sha256";

/**
 * Extraction cache (E8-T02, REQ-EXT-15).
 *
 * The cache key is `(sha256 of the PDF bytes, extractorVersion,
 * schemaVersion)`: the same file under the same code reuses the stored
 * `Book`, and bumping either version changes the key, which invalidates the
 * entry without any cleanup pass. The artifact is the final `Book` (the
 * consumer caches the `book`, ADR-088) — the expensive part of a second
 * opening is the ingestion plus the heuristic pipeline, and both are skipped
 * on a hit.
 *
 * Storage lives behind {@link ExtractionCacheStore}: the core only speaks
 * strings, so the CLI implements the store with files, the app with
 * IndexedDB/SQLite (decision 4 of the app architecture) and tests with
 * {@link MemoryExtractionCache}. Nothing here touches `fs`, clocks or
 * randomness — same bytes, same key, same result (rule 7).
 */

/** The three parts of the cache key (E8-T02). */
export interface ExtractionCacheKey {
  /** Lowercase hex SHA-256 of the PDF bytes (`sha256Hex`). */
  sha256: string;
  /** `EXTRACTOR_VERSION` at extraction time; a heuristic change bumps it. */
  extractorVersion: string;
  /** `SCHEMA_VERSION` at extraction time; a breaking schema bumps it. */
  schemaVersion: string;
}

/**
 * Storage behind an interface (E8-T02): a string per key. File, IndexedDB and
 * SQLite implementations all fit; the core never sees the medium.
 */
export interface ExtractionCacheStore {
  /** The stored JSON for `key`, or `null` when absent. */
  get(key: string): Promise<string | null>;
  /** Replaces the JSON stored under `key`. */
  set(key: string, value: string): Promise<void>;
}

/**
 * Deterministic key string, filename-safe (`-` joins the parts; versions are
 * dotted numbers and the sha is hex, so no escaping is needed on Windows).
 */
export function extractionCacheKey(key: ExtractionCacheKey): string {
  return `${key.sha256}-${key.extractorVersion}-${key.schemaVersion}`;
}

/** Key for `bytes` under the versions this build of the extractor carries. */
export function extractionCacheKeyFor(bytes: Uint8Array): string {
  return extractionCacheKey({
    sha256: sha256Hex(bytes),
    extractorVersion: EXTRACTOR_VERSION,
    schemaVersion: SCHEMA_VERSION,
  });
}

/** In-memory store: the reference implementation and the app's session cache. */
export class MemoryExtractionCache implements ExtractionCacheStore {
  readonly #data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.#data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.#data.set(key, value);
  }
}

/**
 * The `Book` stored under `key`, validated against the schema, or `null` on a
 * miss. A corrupt or schema-stale entry is a miss, never a crash: the caller
 * reprocesses and overwrites it.
 */
export async function readCachedBook(
  store: ExtractionCacheStore,
  key: string,
): Promise<Book | null> {
  const raw = await store.get(key);
  if (raw === null) return null;
  try {
    return parseBook(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Stores `book` as JSON under `key` (the exact shape a later read validates). */
export function writeCachedBook(
  store: ExtractionCacheStore,
  key: string,
  book: Book,
): Promise<void> {
  return store.set(key, JSON.stringify(book));
}

/** What {@link extractCached} returns: the book, the key and whether it was a hit. */
export interface CachedExtraction {
  book: Book;
  /** `true` when the book came from the store and nothing was reprocessed. */
  cacheHit: boolean;
  key: string;
}

/**
 * Batch extraction behind the cache: a hit returns the stored `Book` without
 * reading the PDF at all; a miss runs `buildBook(ingestPdfjs(bytes))` and
 * stores the result. The CLI composes `readCachedBook` + `extractStream` +
 * `writeCachedBook` instead, so a miss still reports per-page progress
 * (ADR-088); this entry point is the app-side convenience.
 */
export async function extractCached(
  bytes: Uint8Array,
  options: PdfjsIngestOptions,
  store: ExtractionCacheStore,
): Promise<CachedExtraction> {
  const key = extractionCacheKeyFor(bytes);
  const cached = await readCachedBook(store, key);
  if (cached !== null) return { book: cached, cacheHit: true, key };
  const book = buildBook(await ingestPdfjs(bytes, options));
  await writeCachedBook(store, key, book);
  return { book, cacheHit: false, key };
}
