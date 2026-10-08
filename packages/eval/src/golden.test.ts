import { BLOCK_KINDS } from "@pagepace/schema";
import { describe, expect, it } from "vitest";
import {
  GOLDEN_FORMAT_VERSION,
  GOLDEN_KINDS,
  GOLDEN_SOURCES,
  GoldenError,
  goldenLinesPerPage,
  goldenText,
  hasGolden,
  parseGolden,
  resolveGoldenPath,
} from "./golden";

const PARAGRAPH = {
  kind: "paragraph",
  runs: [{ text: "First block." }],
  origin: { pageFrom: 1, pageTo: 1 },
};
const HEADING = {
  kind: "heading",
  level: 2,
  runs: [{ text: "Second " }, { text: "block." }],
  origin: { pageFrom: 2, pageTo: 2 },
};

const VALID = {
  id: "n1-en-sample",
  schemaVersion: "1.0.0",
  source: "synthetic",
  coverage: { pages: [1, 2] },
  blocks: [PARAGRAPH, HEADING],
};

const parse = (value: unknown, source = "golden.json"): ReturnType<typeof parseGolden> =>
  parseGolden(JSON.stringify(value), source);

describe("parseGolden", () => {
  it("accepts the documented shape", () => {
    const golden = parse(VALID);
    expect(golden.id).toBe("n1-en-sample");
    expect(golden.schemaVersion).toBe("1.0.0");
    expect(golden.coverage).toEqual([1, 2]);
    expect(golden.blocks).toHaveLength(2);
    expect(golden.blocks[0]?.origin).toEqual({ pageFrom: 1, pageTo: 1 });
    expect(golden.blocks[1]?.level).toBe(2);
  });

  it("accepts a golden without coverage (whole document) and without origins", () => {
    const { coverage: _coverage, ...withoutCoverage } = VALID;
    const golden = parse({
      ...withoutCoverage,
      blocks: [{ kind: "paragraph", runs: [{ text: "First block." }] }],
    });
    expect(golden.coverage).toBeNull();
    expect(golden.blocks[0]?.origin).toBeNull();
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

  it("pins schemaVersion to the golden format major", () => {
    expect(GOLDEN_FORMAT_VERSION).toBe("1.0.0");
    expect(() => parse({ ...VALID, schemaVersion: "1.x.x" })).toThrow(/schemaVersion/);
    expect(() => parse({ ...VALID, schemaVersion: "2.0.0" })).toThrow(
      /schemaVersion must be 1\.x\.x/,
    );
    expect(parse({ ...VALID, schemaVersion: "1.4.2" }).schemaVersion).toBe("1.4.2");
  });

  it("rejects a source outside the documented list", () => {
    expect(() => parse({ ...VALID, source: "guessed" })).toThrow(/source must be one of/);
    expect(GOLDEN_SOURCES).toEqual(["synthetic", "tagged", "epub-pair", "hand-annotated"]);
  });

  it("uses the block kinds of @pagepace/schema", () => {
    expect(GOLDEN_KINDS).toEqual([...BLOCK_KINDS]);
    expect(() => parse({ ...VALID, blocks: [{ kind: "chapter", runs: [{ text: "x" }] }] })).toThrow(
      /kind must be one of/,
    );
  });

  it("requires level 1..6 on heading blocks and rejects other levels", () => {
    const { level: _level, ...headingWithoutLevel } = HEADING;
    expect(() => parse({ ...VALID, blocks: [headingWithoutLevel] })).toThrow(
      /heading blocks need "level"/,
    );
    expect(() => parse({ ...VALID, blocks: [{ ...HEADING, level: 7 }] })).toThrow(
      /level must be an integer 1\.\.6/,
    );
    expect(() => parse({ ...VALID, blocks: [{ ...HEADING, level: "2" }] })).toThrow(
      /level must be an integer 1\.\.6/,
    );
  });

  it("accepts optional boolean style flags on runs and rejects other values", () => {
    const golden = parse({
      ...VALID,
      blocks: [
        {
          kind: "paragraph",
          runs: [{ text: "bold", bold: true }, { text: " normal" }],
          origin: { pageFrom: 1, pageTo: 1 },
        },
      ],
    });
    expect(golden.blocks[0]?.runs[0]).toEqual({ text: "bold", bold: true });
    expect(golden.blocks[0]?.runs[1]).toEqual({ text: " normal" });
    expect(() =>
      parse({ ...VALID, blocks: [{ kind: "paragraph", runs: [{ text: "x", bold: "yes" }] }] }),
    ).toThrow(/bold must be a boolean/);
  });

  it("rejects broken coverage page lists", () => {
    expect(() => parse({ ...VALID, coverage: { pages: [2, 1] } })).toThrow(/sorted ascending/);
    expect(() => parse({ ...VALID, coverage: { pages: [1, 1] } })).toThrow(/repeats page 1/);
    expect(() => parse({ ...VALID, coverage: { pages: [0] } })).toThrow(/1-based positive/);
    expect(() => parse({ ...VALID, coverage: { pages: [] } })).toThrow(/at least one page/);
    expect(() => parse({ ...VALID, coverage: { sheets: [1] } })).toThrow(/unknown field.*sheets/);
  });

  it("ties every covered block to a page inside coverage.pages", () => {
    expect(() =>
      parse({
        ...VALID,
        blocks: [{ kind: "paragraph", runs: [{ text: "x" }] }],
      }),
    ).toThrow(/origin is required when the golden declares coverage\.pages/);
    expect(() =>
      parse({
        ...VALID,
        coverage: { pages: [1] },
        blocks: [HEADING],
      }),
    ).toThrow(/covers page 2, which is outside coverage\.pages/);
  });

  it("rejects an empty block list", () => {
    expect(() => parse({ ...VALID, blocks: [] })).toThrow(/at least one block/);
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
        blocks: [{ kind: "paragraph", runs: [{ text: "x" }], origin: { pageFrom: 3, pageTo: 1 } }],
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

describe("goldenLinesPerPage", () => {
  const withLayout = (blocks: unknown[]) => parse({ ...VALID, blocks });

  it("adds the line breaks of every block on its page", () => {
    const perPage = goldenLinesPerPage(
      withLayout([
        {
          kind: "paragraph",
          runs: [{ text: "one\ntwo\nthree" }],
          origin: { pageFrom: 1, pageTo: 1 },
        },
        { kind: "paragraph", runs: [{ text: "four\nfive" }], origin: { pageFrom: 1, pageTo: 1 } },
        { kind: "heading", level: 2, runs: [{ text: "six" }], origin: { pageFrom: 2, pageTo: 2 } },
      ]),
    );
    expect(perPage).toEqual(
      new Map([
        [1, 5],
        [2, 1],
      ]),
    );
  });

  it("counts a break that sits in any run of the block", () => {
    const perPage = goldenLinesPerPage(
      withLayout([
        {
          kind: "paragraph",
          runs: [{ text: "plain " }, { text: "bold\ncut", bold: true }],
          origin: { pageFrom: 1, pageTo: 1 },
        },
        { kind: "heading", level: 1, runs: [{ text: "Head" }], origin: { pageFrom: 2, pageTo: 2 } },
      ]),
    );
    expect(perPage?.get(1)).toBe(2);
    expect(perPage?.get(2)).toBe(1);
  });

  it("returns null when no run records a line break", () => {
    expect(goldenLinesPerPage(parse(VALID))).toBeNull();
  });

  it("returns null for a block without origin", () => {
    const { coverage: _coverage, ...withoutCoverage } = VALID;
    const golden = parse({
      ...withoutCoverage,
      blocks: [
        { kind: "paragraph", runs: [{ text: "one\ntwo" }], origin: { pageFrom: 1, pageTo: 1 } },
        { kind: "paragraph", runs: [{ text: "no origin\nhere" }] },
      ],
    });
    expect(goldenLinesPerPage(golden)).toBeNull();
  });

  it("returns null for a block spanning more than one page", () => {
    const golden = withLayout([
      { kind: "paragraph", runs: [{ text: "one\ntwo" }], origin: { pageFrom: 1, pageTo: 1 } },
      { kind: "paragraph", runs: [{ text: "spans\npages" }], origin: { pageFrom: 1, pageTo: 2 } },
    ]);
    expect(goldenLinesPerPage(golden)).toBeNull();
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
