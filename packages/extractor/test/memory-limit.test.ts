import type { MemorySample } from "@pagepace/extractor";
import {
  extractStream,
  ingestPdfjs,
  MB,
  MemoryGovernor,
  MemoryLimitError,
} from "@pagepace/extractor";
import { describe, expect, it } from "vitest";
import { buildPdf, textStream } from "./minipdf";

/** Five text pages — enough for two boundaries and a completed read. */
const fivePagePdf = (): Uint8Array =>
  buildPdf(Array.from({ length: 5 }, (_, i) => textStream(`memory page ${i + 1}`)));

const sample = (rss: number): MemorySample => ({ rss, heapUsed: rss / 2, external: 0 });

describe("MemoryGovernor (E8-T03, ADR-090)", () => {
  it("returns 'ok' under the budget and keeps observing", () => {
    const governor = new MemoryGovernor(100 * MB, () => sample(90 * MB));

    expect(governor.samplePageBoundary(1)).toBe("ok");
    expect(governor.samplePageBoundary(2)).toBe("ok");
    expect(governor.overBudgetStreak).toBe(0);
    expect(governor.observedBytes).toBe(90 * MB);
  });

  it("returns 'over' on the first overage and throws on the second consecutive one", () => {
    const governor = new MemoryGovernor(100 * MB, () => sample(110 * MB));

    expect(governor.samplePageBoundary(1)).toBe("over");
    expect(governor.overBudgetStreak).toBe(1);

    let thrown: unknown;
    try {
      governor.samplePageBoundary(2);
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MemoryLimitError);
    const limit = thrown as MemoryLimitError;
    expect(limit.limitBytes).toBe(100 * MB);
    expect(limit.observedBytes).toBe(110 * MB);
    expect(limit.pagesProcessed).toBe(2);
    expect(limit.message).toContain("110 MB");
    expect(limit.message).toContain("100 MB");
  });

  it("resets the streak when a boundary comes back under the budget", () => {
    let rss = 110 * MB;
    const governor = new MemoryGovernor(100 * MB, () => sample(rss));

    expect(governor.samplePageBoundary(1)).toBe("over");
    rss = 90 * MB;
    expect(governor.samplePageBoundary(2)).toBe("ok");
    expect(governor.overBudgetStreak).toBe(0);
    // The second overage after the reset must not throw either.
    rss = 110 * MB;
    expect(governor.samplePageBoundary(3)).toBe("over");
  });
});

describe("ingestPdfjs - memory budget (E8-T03, fatia 3)", () => {
  it("rejects a limit without a probe or an invalid limit", async () => {
    const bytes = fivePagePdf();
    await expect(
      ingestPdfjs(bytes, { fileName: "x.pdf", memoryLimitBytes: 100 * MB }),
    ).rejects.toThrow(RangeError);
    for (const memoryLimitBytes of [0, -1, 1.5, Number.NaN]) {
      await expect(
        ingestPdfjs(bytes, {
          fileName: "x.pdf",
          memoryLimitBytes,
          memoryUsage: () => sample(0),
        }),
      ).rejects.toThrow(RangeError);
    }
  });

  it("fails with MemoryLimitError when two boundaries are over the budget", async () => {
    const bytes = fivePagePdf();
    let thrown: unknown;
    try {
      await ingestPdfjs(bytes, {
        fileName: "limit.pdf",
        memoryLimitBytes: 1,
        memoryUsage: () => sample(900 * MB),
      });
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MemoryLimitError);
    const limit = thrown as MemoryLimitError;
    expect(limit.limitBytes).toBe(1);
    expect(limit.observedBytes).toBe(900 * MB);
    // First boundary passes, second throws: the read stops at page 2.
    expect(limit.pagesProcessed).toBe(2);
  });

  it("completes with an under-budget probe, byte-identical to an ungoverned read", async () => {
    const bytes = fivePagePdf();
    const plain = await ingestPdfjs(bytes, { fileName: "budget.pdf" });
    const governed = await ingestPdfjs(bytes, {
      fileName: "budget.pdf",
      memoryLimitBytes: 10 * 1024 * MB,
      memoryUsage: () => sample(1 * MB),
    });

    expect(governed).toEqual(plain);
    expect(governed.source.sha256).toBe(plain.source.sha256);
  });

  it("allows a single overage to pass (it may be delayed garbage collection)", async () => {
    const bytes = fivePagePdf();
    let rss = 900 * MB;
    let boundaries = 0;
    const document = await ingestPdfjs(bytes, {
      fileName: "spike.pdf",
      memoryLimitBytes: 100 * MB,
      memoryUsage: () => {
        boundaries += 1;
        // Over on the first boundary, back under afterwards.
        if (boundaries > 1) rss = 10 * MB;
        return sample(rss);
      },
    });

    expect(document.pages).toHaveLength(5);
  });
});

describe("extractStream - memory budget (E8-T03, fatia 3)", () => {
  it("propagates MemoryLimitError out of the iteration", async () => {
    const bytes = fivePagePdf();
    let thrown: unknown;
    try {
      // eslint-disable-next-line no-empty
      for await (const _event of extractStream(bytes, {
        fileName: "limit-stream.pdf",
        memoryLimitBytes: 1,
        memoryUsage: () => sample(900 * MB),
      })) {
        // drain until the read stops
      }
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MemoryLimitError);
    expect((thrown as MemoryLimitError).pagesProcessed).toBe(2);
  });

  it("yields the same pages as the ungoverned stream under budget", async () => {
    const bytes = fivePagePdf();
    const plainPages = [];
    for await (const event of extractStream(bytes, { fileName: "same.pdf" })) {
      if (event.type === "page") plainPages.push(event.page);
    }
    const governedPages = [];
    for await (const event of extractStream(bytes, {
      fileName: "same.pdf",
      memoryLimitBytes: 10 * 1024 * MB,
      memoryUsage: () => sample(1 * MB),
    })) {
      if (event.type === "page") governedPages.push(event.page);
    }

    expect(governedPages).toEqual(plainPages);
  });
});
