/**
 * Memory budget for the ingest window (E8-T03, fatia 3).
 *
 * The budget is a contract with the caller: when `memoryLimitBytes` and a
 * `memoryUsage` probe reach {@link ingestPages}, extraction either finishes
 * with the resident set around the budget, or fails with
 * {@link MemoryLimitError} — never a silent overage, never an OOM kill.
 *
 * The enforcement is sampling at page boundaries only: a single boundary over
 * the budget may be delayed garbage collection, so the read continues; two
 * consecutive overages mean the trend is over budget and the read throws the
 * typed error so the CLI can report limit, observation and pages read.
 *
 * There is deliberately no mid-flight *degradation* (E8-T03, ADR-090): the
 * only candidate lever — sweeping the pdf.js caches after every page
 * (`cleanupEveryPages = 1`) — was measured on the stress corpus and made
 * every document *worse*: `n1-en-lostworld` peaked at 647 MB / 20 s against
 * 313 MB / 5.1 s without it, `n1-pt-sofia` ~370 MB against ~262 MB. The
 * per-page `page.cleanup()` inside `readPage` already releases the page; the
 * document-level sweep only forces re-decoding of fonts and images. A budget
 * the document cannot hold must fail loudly, not thrash.
 *
 * The probe is injected (rule 6): this module never imports Node APIs — the
 * CLI passes `process.memoryUsage`, the browser would pass an adapter over
 * `performance.memory`. Without a probe nothing is sampled and nothing is
 * enforced.
 */

/** Resident memory of the process, in bytes. */
export interface MemorySample {
  /** Resident set size (RSS) — the number the budget is compared against. */
  rss: number;
  /** V8 heap in use, carried for diagnostics. */
  heapUsed: number;
  /** Off-heap memory (pdf.js images, typed arrays), carried for diagnostics. */
  external: number;
}

/** Platform probe. Node: `() => process.memoryUsage()`. Deterministic callers pass a fake. */
export type MemoryUsageProbe = () => MemorySample;

/** Megabytes in bytes (the CLI flag and the error message speak MB). */
export const MB = 1024 * 1024;

/**
 * Raised when two consecutive page boundaries were over `memoryLimitBytes`.
 * Carries everything the caller needs to explain the failure: the budget,
 * what was observed and how far the read got.
 */
export class MemoryLimitError extends Error {
  /** The budget the caller set, in bytes. */
  readonly limitBytes: number;
  /** Resident set observed at the boundary that failed, in bytes. */
  readonly observedBytes: number;
  /** Pages read (and yielded) before the read stopped. */
  readonly pagesProcessed: number;

  constructor(limitBytes: number, observedBytes: number, pagesProcessed: number) {
    super(
      `limite de memória: ${formatMb(observedBytes)} MB observados > ${formatMb(limitBytes)} MB ` +
        `em duas fronteiras de página seguidas (páginas lidas: ${pagesProcessed})`,
    );
    this.name = "MemoryLimitError";
    this.limitBytes = limitBytes;
    this.observedBytes = observedBytes;
    this.pagesProcessed = pagesProcessed;
  }
}

/** Integer MB for messages ("312 MB"). */
function formatMb(bytes: number): number {
  return Math.round(bytes / MB);
}

/** What a page-boundary sample decided. */
export type BoundaryVerdict =
  /** Under the budget: the read continues as configured. */
  | "ok"
  /** First overage: recorded, the read continues (a GC may still collect). */
  | "over";

/**
 * Sampling state of one ingest run: consecutive overages at page boundaries
 * and what the next boundary sample means. The class holds no clock, no
 * randomness and no platform API — the probe is the caller's.
 */
export class MemoryGovernor {
  /** Consecutive boundary samples over the budget; the limit needs two. */
  private consecutiveOverages = 0;
  /** Resident set of the last boundary sample, in bytes. */
  private lastBoundaryRss = 0;

  constructor(
    readonly limitBytes: number,
    private readonly probe: MemoryUsageProbe,
  ) {}

  /** Resident set observed by the last {@link samplePageBoundary}, in bytes. */
  get observedBytes(): number {
    return this.lastBoundaryRss;
  }

  /** Consecutive overages so far (tests and diagnostics). */
  get overBudgetStreak(): number {
    return this.consecutiveOverages;
  }

  /**
   * Sample taken at a page boundary, after the page was yielded and its
   * `page.cleanup()` ran. First overage: `"over"`, the read continues — one
   * boundary may be delayed garbage collection. Second consecutive overage:
   * throws {@link MemoryLimitError}; a boundary back under the budget resets
   * the streak.
   */
  samplePageBoundary(pagesProcessed: number): BoundaryVerdict {
    this.lastBoundaryRss = this.probe().rss;
    const over = this.lastBoundaryRss > this.limitBytes;
    this.consecutiveOverages = over ? this.consecutiveOverages + 1 : 0;
    if (this.consecutiveOverages >= 2) {
      throw new MemoryLimitError(this.limitBytes, this.lastBoundaryRss, pagesProcessed);
    }
    return over ? "over" : "ok";
  }
}
