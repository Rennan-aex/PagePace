import { describe, expect, it } from "vitest";
import {
  BENCH_BASELINE_FORMAT_VERSION,
  BENCH_REGRESSION_PCT,
  type BenchBaseline,
  BenchBaselineError,
  compareBenchBaseline,
  parseBenchBaseline,
  serializeBenchBaseline,
} from "./bench-baseline";

function baseline(documents: BenchBaseline["documents"]): BenchBaseline {
  return { version: BENCH_BASELINE_FORMAT_VERSION, regressionPct: BENCH_REGRESSION_PCT, documents };
}

describe("parseBenchBaseline", () => {
  it("parses a serialized baseline (round trip)", () => {
    const original = baseline({
      "n1-en-sofia": { pages: 494, ms_per_page: 12.2, peak_mb: 533.6 },
      "n5-pt-astrofisica": { pages: 14, ms_per_page: 163.3, peak_mb: 570.2 },
    });
    expect(parseBenchBaseline(serializeBenchBaseline(original))).toEqual(original);
  });

  it("rejects a top-level key it does not know", () => {
    const text = JSON.stringify({ version: 1, regressionPct: 25, documents: {}, extra: 1 });
    expect(() => parseBenchBaseline(text)).toThrow(BenchBaselineError);
    expect(() => parseBenchBaseline(text)).toThrow(/unknown key "extra"/);
  });

  it("rejects an unsupported version", () => {
    const text = JSON.stringify({ version: 99, regressionPct: 25, documents: {} });
    expect(() => parseBenchBaseline(text)).toThrow(/version 99 is not supported/);
  });

  it("rejects a regressionPct that does not match the constant", () => {
    const text = JSON.stringify({ version: 1, regressionPct: 10, documents: {} });
    expect(() => parseBenchBaseline(text)).toThrow(/--update-baseline/);
  });

  it("rejects invalid JSON and non-object tops", () => {
    expect(() => parseBenchBaseline("{oops")).toThrow(/invalid JSON/);
    expect(() => parseBenchBaseline("[]")).toThrow(/top level must be an object/);
  });

  it("rejects a document with an unknown key or a bad value", () => {
    const withUnknown = JSON.stringify({
      version: 1,
      regressionPct: 25,
      documents: { d: { pages: 1, ms_per_page: 1, peak_mb: 1, extra: 2 } },
    });
    expect(() => parseBenchBaseline(withUnknown)).toThrow(/d: unknown key "extra"/);

    const badPages = JSON.stringify({
      version: 1,
      regressionPct: 25,
      documents: { d: { pages: 1.5, ms_per_page: 1, peak_mb: 1 } },
    });
    expect(() => parseBenchBaseline(badPages)).toThrow(/"pages" must be an integer/);

    const badMetric = JSON.stringify({
      version: 1,
      regressionPct: 25,
      documents: { d: { pages: 1, ms_per_page: 0, peak_mb: 1 } },
    });
    expect(() => parseBenchBaseline(badMetric)).toThrow(/"ms_per_page".*greater than 0/);
  });
});

describe("serializeBenchBaseline", () => {
  it("is deterministic: sorted ids, fixed keys, final newline", () => {
    const text = serializeBenchBaseline(
      baseline({
        z: { pages: 2, ms_per_page: 3, peak_mb: 4 },
        a: { pages: 5, ms_per_page: 6, peak_mb: 7 },
      }),
    );
    expect(text).toBe(
      `{
  "version": 1,
  "regressionPct": 25,
  "documents": {
    "a": {
      "pages": 5,
      "ms_per_page": 6,
      "peak_mb": 7
    },
    "z": {
      "pages": 2,
      "ms_per_page": 3,
      "peak_mb": 4
    }
  }
}
`,
    );
    expect(text.endsWith("\n")).toBe(true);
  });
});

describe("compareBenchBaseline", () => {
  it("reports ok/better at or under the threshold and exactly on it", () => {
    const comparison = compareBenchBaseline(
      baseline({ d: { pages: 1000, ms_per_page: 10, peak_mb: 10 } }),
      { d: { pages: 1000, ms_per_page: 12.5, peak_mb: 8 } },
    );
    const time = comparison.changes.find((change) => change.metric === "ms_per_page");
    const memory = comparison.changes.find((change) => change.metric === "peak_mb");
    expect(time?.status).toBe("ok");
    expect(time?.worseningPct).toBeCloseTo(25);
    expect(memory?.status).toBe("better");
    expect(comparison.regressions).toHaveLength(0);
    expect(comparison.missing).toHaveLength(0);
    expect(comparison.added).toHaveLength(0);
  });

  it("flags a metric worse than the threshold as a regression", () => {
    const comparison = compareBenchBaseline(
      baseline({ d: { pages: 1000, ms_per_page: 10, peak_mb: 10 } }),
      { d: { pages: 1000, ms_per_page: 13, peak_mb: 40 } },
    );
    expect(comparison.regressions.map((regression) => regression.metric).sort()).toEqual([
      "ms_per_page",
      "peak_mb",
    ]);
    expect(comparison.regressions.every((regression) => regression.status === "worse")).toBe(true);
  });

  it("keeps short documents below the timer noise out of ms regressions", () => {
    const comparison = compareBenchBaseline(
      baseline({ d: { pages: 2, ms_per_page: 5, peak_mb: 10 } }),
      { d: { pages: 2, ms_per_page: 100, peak_mb: 11 } },
    );
    const time = comparison.changes.find((change) => change.metric === "ms_per_page");
    expect(time?.status).toBe("below-floor");
    expect(comparison.regressions).toHaveLength(0);
  });

  it("still gates peak_mb on short documents", () => {
    const comparison = compareBenchBaseline(
      baseline({ d: { pages: 2, ms_per_page: 5, peak_mb: 10 } }),
      { d: { pages: 2, ms_per_page: 5, peak_mb: 30 } },
    );
    const memory = comparison.changes.find((change) => change.metric === "peak_mb");
    expect(memory?.status).toBe("worse");
    expect(comparison.regressions).toHaveLength(1);
  });

  it("reports documents only on one side as gaps", () => {
    const comparison = compareBenchBaseline(
      baseline({ gone: { pages: 3, ms_per_page: 1, peak_mb: 1 } }),
      { fresh: { pages: 3, ms_per_page: 1, peak_mb: 1 } },
    );
    expect(comparison.missing).toEqual([{ id: "gone", metric: null }]);
    expect(comparison.added).toEqual([{ id: "fresh", metric: null }]);
  });
});
