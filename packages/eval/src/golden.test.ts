import { describe, expect, it } from "vitest";
import {
  GOLDEN_SOURCES,
  GoldenError,
  goldenText,
  hasGolden,
  parseGolden,
  resolveGoldenPath,
} from "./golden";

const VALID = {
  id: "n1-en-sample",
  schemaVersion: "1.1.0",
  source: "synthetic",
  coverage: { pages: [1, 2] },
  blocks: [
    {
      kind: "paragraph",
      runs: [{ text: "First block." }],
      origin: { pageFrom: 1, pageTo: 1 },
    },
    { kind: "heading", runs: [{ text: "Second " }, { text: "block." }] },
  ],
};

const parse = (value: unknown, source = "golden.json"): ReturnType<typeof parseGolden> =>
  parseGolden(JSON.stringify(value), source);

describe("parseGolden", () => {
  it("accepts the documented shape", () => {
    const golden = parse(VALID);
    expect(golden.id).toBe("n1-en-sample");
    expect(golden.coverage).toEqual([1, 2]);
    expect(golden.blocks).toHaveLength(2);
    expect(golden.blocks[0]?.origin).toEqual({ pageFrom: 1, pageTo: 1 });
    expect(golden.blocks[1]?.origin).toBeNull();
  });

  it("accepts a golden without coverage (whole document)", () => {
    const { coverage: _coverage, ...withoutCoverage } = VALID;
    expect(parse(withoutCoverage).coverage).toBeNull();
  });

  it("rejects invalid JSON with the file name in the message", () => {
    expect(() => parseGolden("{ nope", "some.golden.json")).toThrow(GoldenError);
    expect(() => parseGolden("{ nope", "some.golden.json")).toThrow(/some\.golden\.json/);
  });

  it("rejects unknown top-level fields", () => {
    expect(() => parse({ ...VALID, note: "hi" })).toThrow(/unknown field.*note/);
  });

  it("rejects a mismatched or malformed id", () => {
    expect(() => parse({ ...VALID, id: "has space" })).toThrow(/invalid id/);
    expect(() => parse({ ...VALID, id: "" })).toThrow(/non-empty string/);
  });

  it("rejects a schemaVersion that is not x.y.z", () => {
    expect(() => parse({ ...VALID, schemaVersion: "1.x.x" })).toThrow(/schemaVersion/);
  });

  it("rejects a source outside the documented list", () => {
    expect(() => parse({ ...VALID, source: "guessed" })).toThrow(/source must be one of/);
    expect(GOLDEN_SOURCES).toEqual(["synthetic", "tagged", "epub-pair", "hand-annotated"]);
  });

  it("rejects broken coverage page lists", () => {
    expect(() => parse({ ...VALID, coverage: { pages: [2, 1] } })).toThrow(/sorted ascending/);
    expect(() => parse({ ...VALID, coverage: { pages: [1, 1] } })).toThrow(/repeats page 1/);
    expect(() => parse({ ...VALID, coverage: { pages: [0] } })).toThrow(/1-based positive/);
    expect(() => parse({ ...VALID, coverage: { sheets: [1] } })).toThrow(/unknown field.*sheets/);
  });

  it("rejects unknown block/run fields and bad origins", () => {
    expect(() => parse({ ...VALID, blocks: [{ kind: "paragraph", runs: [], text: "x" }] })).toThrow(
      /unknown field.*text/,
    );
    expect(() => parse({ ...VALID, blocks: [{ kind: "paragraph", runs: [{}] }] })).toThrow(
      /runs\[0\]\.text/,
    );
    expect(() =>
      parse({
        ...VALID,
        blocks: [{ kind: "p", runs: [{ text: "x" }], origin: { pageFrom: 3, pageTo: 1 } }],
      }),
    ).toThrow(/pageTo must be integer >= pageFrom|pageTo must be an integer/);
  });

  it("requires blocks to be an array", () => {
    expect(() => parse({ ...VALID, blocks: "no" })).toThrow(/blocks must be an array/);
  });
});

describe("goldenText", () => {
  it("joins runs inside a block and blocks with a line break", () => {
    expect(goldenText(parse(VALID))).toBe("First block.\nSecond block.");
  });
});

describe("hasGolden / resolveGoldenPath", () => {
  const repoRoot = "C:\\repo";

  it("treats none/null/empty as 'no golden'", () => {
    expect(hasGolden({ golden: "none" })).toBe(false);
    expect(hasGolden({ golden: null })).toBe(false);
    expect(hasGolden({ golden: "" })).toBe(false);
    expect(hasGolden({ golden: "sample.golden.json" })).toBe(true);
  });

  it("resolves public goldens inside <repo>/corpus/golden", () => {
    const resolved = resolveGoldenPath(
      { id: "n1-en-sample", golden: "n1-en-sample.golden.json" },
      { repoRoot, privateDir: null, private: false },
    );
    expect(resolved?.replaceAll("\\", "/")).toBe("C:/repo/corpus/golden/n1-en-sample.golden.json");
  });

  it("resolves private goldens inside $CORPUS_PRIVATE_DIR/golden", () => {
    const resolved = resolveGoldenPath(
      { id: "n1-pt-sample", golden: "n1-pt-sample.golden.json" },
      { repoRoot, privateDir: "C:\\private", private: true },
    );
    expect(resolved?.replaceAll("\\", "/")).toBe("C:/private/golden/n1-pt-sample.golden.json");
  });

  it("returns null when the manifest says none", () => {
    expect(
      resolveGoldenPath(
        { id: "n1-en-sample", golden: "none" },
        { repoRoot, privateDir: null, private: false },
      ),
    ).toBeNull();
  });

  it("rejects absolute paths and paths that escape the golden directory", () => {
    expect(() =>
      resolveGoldenPath(
        { id: "n1-en-sample", golden: "/tmp/x.json" },
        { repoRoot, privateDir: null, private: false },
      ),
    ).toThrow(/must be relative/);
    expect(() =>
      resolveGoldenPath(
        { id: "n1-en-sample", golden: "../../secret.json" },
        { repoRoot, privateDir: null, private: false },
      ),
    ).toThrow(/escapes/);
  });
});
