// E1-T07: the synthetic corpus — one specification builds the PDF and its
// golden, both are cross-checked against `corpus/manifest.yaml`, and the
// whole pipeline (build → ingest → compare) must reach `text_cer = 0`.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ingestPdfjs } from "@pagepace/extractor";
import { afterEach, describe, expect, it } from "vitest";
import { parseManifest, REPO_ROOT, SYNTHETIC_DIR } from "./corpus";
import { GOLDEN_FORMAT_VERSION, goldenText, parseGolden, serializeGolden } from "./golden";
import { textCer } from "./metrics";
import { SYNTHETIC_SPECS, syntheticSpecOf } from "./specs";
import {
  buildSynthetic,
  goldenOf,
  layoutSynthetic,
  type SyntheticSpec,
  SyntheticSpecError,
} from "./synthetic";
import { runSynthetic } from "./synthetic-cli";
import { documentText } from "./text";

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const specFixture = (overrides: Partial<SyntheticSpec> = {}): SyntheticSpec => ({
  id: "syn-test-fixture",
  level: "N1",
  lang: "en",
  title: "Fixture (synthetic)",
  features: ["synthetic"],
  pages: 1,
  blocks: [{ kind: "paragraph", page: 1, runs: [{ text: "One line of text." }] }],
  ...overrides,
});

const capture = (): {
  out: (text: string) => void;
  err: (text: string) => void;
  text: () => string;
  errors: () => string;
} => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
    text: () => stdout.join(""),
    errors: () => stderr.join(""),
  };
};

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A copy of `corpus/manifest.yaml` (or a given manifest) in a temp folder. */
async function tempRepo(manifestText?: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "pagepace-synthetic-"));
  tempDirs.push(dir);
  await mkdir(path.join(dir, "corpus"), { recursive: true });
  const text =
    manifestText ?? readFileSync(path.join(REPO_ROOT, "corpus", "manifest.yaml"), "utf8");
  await writeFile(path.join(dir, "corpus", "manifest.yaml"), text);
  return dir;
}

describe("buildSynthetic", () => {
  it("builds the same bytes, golden and digest twice (determinism)", () => {
    for (const spec of SYNTHETIC_SPECS) {
      const first = buildSynthetic(spec);
      const second = buildSynthetic(spec);

      expect(second.pdf).toEqual(first.pdf);
      expect(second.goldenJson).toBe(first.goldenJson);
      expect(second.sha256).toBe(first.sha256);
      expect(first.sha256).toBe(sha256(first.pdf));
      expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(new TextDecoder().decode(first.pdf.subarray(0, 8))).toBe("%PDF-1.4");
    }
  });

  it("builds a golden that parses, round-trips and carries one origin per block", () => {
    for (const spec of SYNTHETIC_SPECS) {
      const artifact = buildSynthetic(spec);
      const golden = parseGolden(artifact.goldenJson, `${spec.id}.golden.json`);

      expect(golden.id).toBe(spec.id);
      expect(golden.schemaVersion).toBe(GOLDEN_FORMAT_VERSION);
      expect(golden.source).toBe("synthetic");
      expect(golden.blocks.length).toBeGreaterThan(0);
      expect(serializeGolden(golden)).toBe(artifact.goldenJson);
      expect(golden.blocks.every((block) => block.origin !== null)).toBe(true);
      expect(golden.coverage).toEqual(spec.coverage ?? null);
    }
  });

  it("annotates only the pages inside coverage.pages", () => {
    const golden = goldenOf(
      specFixture({
        coverage: [1],
        pages: 2,
        blocks: [
          { kind: "paragraph", page: 1, runs: [{ text: "Covered." }] },
          { kind: "paragraph", page: 2, runs: [{ text: "Not covered." }] },
        ],
      }),
    );

    expect(golden.blocks).toHaveLength(1);
    expect(goldenText(golden)).toBe("Covered.");
    expect(golden.coverage).toEqual([1]);

    const partial = goldenOf(syntheticSpecOf("syn-n3-en-footnotes") as SyntheticSpec);
    expect(partial.coverage).toEqual([2]);
    expect(partial.blocks.every((block) => block.origin?.pageFrom === 2)).toBe(true);
  });

  it("refuses a specification that does not fit the page", () => {
    const tooManyLines = Array.from({ length: 60 }, (_, index) => `line ${index}`).join("\n");
    const overflow = specFixture({
      blocks: [{ kind: "paragraph", page: 1, runs: [{ text: tooManyLines }] }],
    });

    expect(() => layoutSynthetic(overflow)).toThrowError(SyntheticSpecError);
    expect(() => layoutSynthetic(overflow)).toThrowError(/does not fit on page 1/);
  });

  it("refuses blocks out of reading order, empty pages and headings without a level", () => {
    expect(() =>
      layoutSynthetic(
        specFixture({
          pages: 2,
          blocks: [
            { kind: "paragraph", page: 2, runs: [{ text: "Second page first." }] },
            { kind: "paragraph", page: 1, runs: [{ text: "First page second." }] },
          ],
        }),
      ),
    ).toThrowError(/must be listed in reading order/);

    expect(() =>
      layoutSynthetic(
        specFixture({
          pages: 2,
          blocks: [{ kind: "paragraph", page: 1, runs: [{ text: "Only page one." }] }],
        }),
      ),
    ).toThrowError(/page 2 has no blocks/);

    expect(() =>
      layoutSynthetic(
        specFixture({ blocks: [{ kind: "heading", page: 1, runs: [{ text: "Nope" }] }] }),
      ),
    ).toThrowError(/heading blocks need a level 1\.\.6/);

    expect(() =>
      layoutSynthetic(
        specFixture({
          blocks: [{ kind: "paragraph", page: 1, column: 2, runs: [{ text: "Second column." }] }],
        }),
      ),
    ).toThrowError(/column must be 1\.\.1/);

    expect(() =>
      layoutSynthetic(
        specFixture({
          twoColumn: false,
          blocks: [
            { kind: "footnote", page: 1, position: "bottom", runs: [{ text: "One footnote." }] },
            { kind: "paragraph", page: 1, runs: [{ text: "Flows after the footnote." }] },
          ],
        }),
      ),
    ).toThrowError(/flows after the bottom block/);
  });

  it("refuses a coverage outside the document and a golden with no covered block", () => {
    expect(() => goldenOf(specFixture({ coverage: [7] }))).toThrowError(
      /coverage page 7 is outside 1\.\.1/,
    );
    expect(() => goldenOf(specFixture({ coverage: [] }))).toThrowError(
      /coverage must hold at least one page/,
    );
    expect(() =>
      goldenOf(
        specFixture({
          coverage: [2],
          pages: 2,
          blocks: [{ kind: "paragraph", page: 1, runs: [{ text: "Only the first page." }] }],
        }),
      ),
    ).toThrowError(/no block falls inside coverage\.pages/);
  });
});

describe("specifications, manifest and committed goldens agree", () => {
  it("gives every specification a generated entry with the matching digest", () => {
    const entries = parseManifest(
      readFileSync(path.join(REPO_ROOT, "corpus", "manifest.yaml"), "utf8"),
      "corpus/manifest.yaml",
    );
    const generated = entries.filter((entry) => entry.generated);

    expect(generated.map((entry) => entry.id).sort()).toEqual(
      SYNTHETIC_SPECS.map((spec) => spec.id).sort(),
    );
    for (const spec of SYNTHETIC_SPECS) {
      const entry = generated.find((candidate) => candidate.id === spec.id);
      const artifact = buildSynthetic(spec);
      expect(entry).toBeDefined();
      expect(entry?.sha256).toBe(artifact.sha256);
      expect(entry?.pages).toBe(spec.pages);
      expect(entry?.level).toBe(spec.level);
      expect(entry?.lang).toBe(spec.lang);
      expect(entry?.sourceUrl).toBeNull();
      expect(entry?.golden).toBe(`${spec.id}.golden.json`);
      expect(entry?.features.sort()).toEqual([...spec.features].sort());
    }
  });

  it("keeps the committed golden byte-identical to the specification", () => {
    for (const spec of SYNTHETIC_SPECS) {
      const file = path.join(REPO_ROOT, "corpus", "golden", `${spec.id}.golden.json`);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, "utf8")).toBe(buildSynthetic(spec).goldenJson);
    }
  });
});

describe("the synthetic pipeline end to end", () => {
  it("extracts every specification back with text_cer = 0", async () => {
    for (const spec of SYNTHETIC_SPECS) {
      const artifact = buildSynthetic(spec);
      const document = await ingestPdfjs(artifact.pdf, { fileName: `${spec.id}.pdf` });
      const extracted = documentText(document, spec.coverage ?? null);
      const result = textCer(goldenText(artifact.golden), extracted);

      expect(document.pages).toHaveLength(spec.pages);
      expect(result.cer).toBe(0);
      expect(result.edits).toBe(0);
    }
  }, 30_000);
});

describe("runSynthetic", () => {
  it("verifies the repository in --check mode without writing", async () => {
    const io = capture();

    const result = await runSynthetic({ check: true, out: io.out, err: io.err });

    expect(result.code).toBe(0);
    expect(result.written).toEqual([]);
    expect(result.checked).toHaveLength(SYNTHETIC_SPECS.length);
    expect(io.errors()).toBe("");
    expect(io.text()).toContain("verified");
  });

  it("writes both artefacts into a repository without them", async () => {
    const repoRoot = await tempRepo();
    const io = capture();

    const result = await runSynthetic({ repoRoot, out: io.out, err: io.err });

    expect(result.code).toBe(0);
    expect(result.written).toHaveLength(SYNTHETIC_SPECS.length);
    for (const spec of SYNTHETIC_SPECS) {
      const golden = path.join(repoRoot, "corpus", "golden", `${spec.id}.golden.json`);
      const pdf = path.join(repoRoot, "corpus", "public", SYNTHETIC_DIR, `${spec.id}.pdf`);
      expect(readFileSync(golden, "utf8")).toBe(buildSynthetic(spec).goldenJson);
      expect(existsSync(pdf)).toBe(true);
    }
    expect(io.text()).toContain("wrote corpus");
  });

  it("fails when the manifest digest does not match the specification", async () => {
    const manifest = readFileSync(path.join(REPO_ROOT, "corpus", "manifest.yaml"), "utf8").replace(
      /sha256: "[0-9a-f]{64}"/g,
      'sha256: "0000000000000000000000000000000000000000000000000000000000000000"',
    );
    const repoRoot = await tempRepo(manifest);
    const io = capture();

    const result = await runSynthetic({ repoRoot, check: true, out: io.out, err: io.err });

    expect(result.code).toBe(1);
    expect(io.errors()).toContain("sha256 is 00000000");
    expect(io.errors()).toContain("the specification builds");
  });

  it("fails when a committed golden is stale", async () => {
    const repoRoot = await tempRepo();
    const goldenDir = path.join(repoRoot, "corpus", "golden");
    await mkdir(goldenDir, { recursive: true });
    await writeFile(path.join(goldenDir, "syn-n1-en-paragraphs.golden.json"), "{}\n");
    const io = capture();

    const result = await runSynthetic({ repoRoot, check: true, out: io.out, err: io.err });

    expect(result.code).toBe(1);
    expect(io.errors()).toContain(
      `syn-n1-en-paragraphs: ${path.join("corpus", "golden", "syn-n1-en-paragraphs.golden.json")}`,
    );
    expect(io.errors()).toContain("is out of date");
  });

  it("fails when a generated entry has no specification", async () => {
    const manifest = [
      "documents:",
      "",
      "  - id: syn-ghost",
      "    generated: true",
      `    sha256: "${"0".repeat(64)}"`,
      "",
    ].join("\n");
    const repoRoot = await tempRepo(manifest);
    const io = capture();

    const result = await runSynthetic({ repoRoot, check: true, out: io.out, err: io.err });

    expect(result.code).toBe(1);
    expect(io.errors()).toContain("syn-ghost: corpus/manifest.yaml says generated: true");
  });
});
