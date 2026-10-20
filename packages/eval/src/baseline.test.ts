import { describe, expect, it } from "vitest";
import {
  BASELINE_FORMAT_VERSION,
  BASELINE_RELATIVE_PATH,
  BASELINE_TOLERANCE,
  type Baseline,
  BaselineError,
  compareBaseline,
  METRIC_DIRECTIONS,
  parseBaseline,
  serializeBaseline,
} from "./baseline";

function baselineOf(documents: Baseline["documents"]): Baseline {
  return {
    version: BASELINE_FORMAT_VERSION,
    tolerance: BASELINE_TOLERANCE,
    documents,
  };
}

function textOf(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

describe("parseBaseline", () => {
  it("reads the documented shape", () => {
    const parsed = parseBaseline(
      textOf({
        version: 1,
        tolerance: 0.002,
        documents: { "n1-en-sample": { text_cer: 0.004 } },
      }),
    );
    expect(parsed.version).toBe(1);
    expect(parsed.tolerance).toBe(0.002);
    expect(parsed.documents["n1-en-sample"]).toEqual({ text_cer: 0.004 });
  });

  it("rejects invalid JSON and a non-object top level", () => {
    expect(() => parseBaseline("{nope", BASELINE_RELATIVE_PATH)).toThrow(BaselineError);
    expect(() => parseBaseline("[]", BASELINE_RELATIVE_PATH)).toThrow(/must be an object/);
    expect(() => parseBaseline('"text"', BASELINE_RELATIVE_PATH)).toThrow(/must be an object/);
  });

  it("rejects unknown keys at the top level", () => {
    const error = textOf({ version: 1, tolerance: 0.002, documents: {}, notes: "hi" });
    expect(() => parseBaseline(error, "src")).toThrow(/unknown key "notes"/);
  });

  it("rejects a version from another format", () => {
    const error = textOf({ version: 2, tolerance: 0.002, documents: {} });
    expect(() => parseBaseline(error, "src")).toThrow(/version 2 is not supported/);
  });

  it("rejects a tolerance that does not match the code", () => {
    const error = textOf({ version: 1, tolerance: 0.5, documents: {} });
    expect(() => parseBaseline(error, "src")).toThrow(/does not match BASELINE_TOLERANCE/);
  });

  it("rejects an unknown metric or a non-finite value", () => {
    const unknown = textOf({ version: 1, tolerance: 0.002, documents: { a: { wble: 1 } } });
    expect(() => parseBaseline(unknown, "src")).toThrow(/unknown metric "wble"/);
    const notNumber = textOf({ version: 1, tolerance: 0.002, documents: { a: { text_cer: "1" } } });
    expect(() => parseBaseline(notNumber, "src")).toThrow(/finite number/);
    const infinite = '{"version":1,"tolerance":0.002,"documents":{"a":{"text_cer":1e999}}}';
    expect(() => parseBaseline(infinite, "src")).toThrow(/finite number/);
  });

  it("rejects malformed document entries", () => {
    const list = textOf({ version: 1, tolerance: 0.002, documents: { a: [] } });
    expect(() => parseBaseline(list, "src")).toThrow(/metrics must be an object/);
    const documents = textOf({ version: 1, tolerance: 0.002, documents: [] });
    expect(() => parseBaseline(documents, "src")).toThrow(/"documents" must be an object/);
  });

  it("names the file it was reading", () => {
    expect(() => parseBaseline("nope", "custom/baseline.json")).toThrow(
      /^custom\/baseline\.json: /,
    );
  });
});

describe("serializeBaseline", () => {
  it("sorts documents and metrics and ends with a newline", () => {
    const bytes = serializeBaseline(
      baselineOf({ "z-doc": { text_cer: 0.1 }, "a-doc": { text_cer: 0 } }),
    );
    expect(bytes.endsWith("\n")).toBe(true);
    expect(bytes.endsWith("}\n")).toBe(true);
    expect(bytes.indexOf('"a-doc"')).toBeLessThan(bytes.indexOf('"z-doc"'));
  });

  it("round-trips through parseBaseline", () => {
    const original = baselineOf({ "n1-en-sample": { text_cer: 0.001234567 } });
    expect(parseBaseline(serializeBaseline(original))).toEqual(original);
    expect(parseBaseline(serializeBaseline(original))).toEqual(
      parseBaseline(serializeBaseline(original)),
    );
  });

  it("declares the format version and the tolerance", () => {
    const parsed = JSON.parse(serializeBaseline(baselineOf({})));
    expect(parsed.version).toBe(BASELINE_FORMAT_VERSION);
    expect(parsed.tolerance).toBe(BASELINE_TOLERANCE);
    expect(parsed.documents).toEqual({});
  });
});

describe("compareBaseline", () => {
  it("flags a worsening beyond the tolerance and keeps one inside it", () => {
    const comparison = compareBaseline(baselineOf({ a: { text_cer: 0 }, b: { text_cer: 0.001 } }), {
      a: { text_cer: 0.005 },
      b: { text_cer: 0.0025 },
    });
    expect(comparison.regressions.map((change) => change.id)).toEqual(["a"]);
    expect(comparison.regressions[0]?.worsening).toBeCloseTo(0.005, 10);
    const inside = comparison.changes.find((change) => change.id === "b");
    expect(inside?.status).toBe("ok");
    expect(inside?.worsening).toBeCloseTo(0.0015, 10);
  });

  it("does not flag an improvement and reports it as better", () => {
    const comparison = compareBaseline(baselineOf({ a: { text_cer: 0.01 } }), {
      a: { text_cer: 0 },
    });
    expect(comparison.regressions).toHaveLength(0);
    expect(comparison.changes[0]?.status).toBe("better");
    expect(comparison.changes[0]?.delta).toBeCloseTo(-0.01, 10);
    expect(comparison.changes[0]?.worsening).toBeCloseTo(-0.01, 10);
  });

  it("flags a drop of a higher-is-better metric beyond the tolerance", () => {
    const comparison = compareBaseline(
      baselineOf({
        a: { para_boundary_f1: 1 },
        b: { para_boundary_f1: 0.99 },
        c: { para_boundary_f1: 0.9 },
      }),
      {
        a: { para_boundary_f1: 0.995 },
        b: { para_boundary_f1: 0.989 },
        c: { para_boundary_f1: 1 },
      },
    );
    expect(comparison.regressions.map((change) => change.id)).toEqual(["a"]);
    expect(comparison.regressions[0]?.worsening).toBeCloseTo(0.005, 10);
    expect(comparison.changes.find((change) => change.id === "b")?.status).toBe("ok");
    expect(comparison.changes.find((change) => change.id === "c")?.status).toBe("better");
  });

  it("reports documents missing from the run and documents missing from the baseline", () => {
    const comparison = compareBaseline(baselineOf({ gone: { text_cer: 0 } }), {
      fresh: { text_cer: 0 },
    });
    expect(comparison.missing).toEqual([{ id: "gone", metric: null }]);
    expect(comparison.added).toEqual([{ id: "fresh", metric: null }]);
    expect(comparison.changes).toHaveLength(0);
    expect(comparison.regressions).toHaveLength(0);
  });

  it("reports a single metric that stopped being measured", () => {
    const comparison = compareBaseline(baselineOf({ a: { text_cer: 0 } }), { a: {} });
    expect(comparison.missing).toEqual([{ id: "a", metric: "text_cer" }]);
  });

  it("keeps the tolerance from the code, not from the file", () => {
    const comparison = compareBaseline(baselineOf({ a: { text_cer: 0 } }), {
      a: { text_cer: 0.002 },
    });
    expect(comparison.tolerance).toBe(BASELINE_TOLERANCE);
    expect(comparison.regressions).toHaveLength(0);
  });
});

describe("METRIC_DIRECTIONS", () => {
  it("defines the direction of every metric", () => {
    expect(METRIC_DIRECTIONS.text_cer).toBe("lower");
    expect(METRIC_DIRECTIONS.para_boundary_f1).toBe("higher");
    expect(METRIC_DIRECTIONS.footnote_link_acc).toBe("higher");
    expect(METRIC_DIRECTIONS.confidence_calibration).toBe("higher");
  });
});
