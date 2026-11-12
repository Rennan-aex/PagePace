import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "./corpus";
import { runEval } from "./eval";
import {
  evaluateSentenceCorpus,
  loadSentenceCorpus,
  meanSentenceF1,
  parseSentenceCorpus,
  SENTENCE_F1_TARGET,
  SentenceCorpusError,
} from "./sentences";

const SOURCE = "Autor, Obra (1899) - domínio público";

function document(sentences: string[], overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: 1,
    id: "seg-pt-exemplo",
    lang: "pt",
    source: SOURCE,
    sentences,
    ...overrides,
  });
}

const created: string[] = [];

async function makeRepo(sentenceFiles: Record<string, string> = {}): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "pagepace-sentences-"));
  created.push(repoRoot);
  await mkdir(path.join(repoRoot, "corpus", "sentences"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "corpus", "manifest.yaml"),
    "version: 1\ndocuments:\n",
    "utf8",
  );
  for (const [name, content] of Object.entries(sentenceFiles)) {
    await writeFile(path.join(repoRoot, "corpus", "sentences", name), content, "utf8");
  }
  return repoRoot;
}

function capture(): {
  out: string[];
  err: string[];
  io: { out: (t: string) => void; err: (t: string) => void };
} {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (t) => void out.push(t), err: (t) => void err.push(t) } };
}

afterEach(async () => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("parseSentenceCorpus", () => {
  it("joins the sentences with one space and derives the break offsets", () => {
    const entry = parseSentenceCorpus(
      document(["Uma frase.", "Outra frase!", "Fim?"]),
      "corpus/sentences/seg-pt-exemplo.json",
    );
    expect(entry.text).toBe("Uma frase. Outra frase! Fim?");
    expect(entry.boundaries).toEqual([10, 23]);
    expect(entry.lang).toBe("pt");
    expect(entry.source).toBe(SOURCE);
  });

  it("rejects a sentence without a terminator", () => {
    expect(() => parseSentenceCorpus(document(["Uma frase.", "sem fim"]), "x")).toThrow(
      /does not end with a sentence terminator/,
    );
  });

  it("accepts a terminator followed by closing quotes or brackets", () => {
    const entry = parseSentenceCorpus(document(['Ele disse "vai."', "Fim."]), "x");
    expect(entry.sentences).toHaveLength(2);
  });

  it("rejects unknown keys, a wrong format, an unsupported language and empty sentences", () => {
    expect(() => parseSentenceCorpus(document(["A."], { extra: 1 }), "x")).toThrow(
      /unknown key "extra"/,
    );
    expect(() => parseSentenceCorpus(document(["A."], { format: 2 }), "x")).toThrow(
      /format 2 is not supported/,
    );
    expect(() => parseSentenceCorpus(document(["A."], { lang: "fr" }), "x")).toThrow(
      /"lang" must be "pt" or "en"/,
    );
    expect(() => parseSentenceCorpus(document([""]), "x")).toThrow(/non-empty string/);
    expect(() => parseSentenceCorpus(document([]), "x")).toThrow(/non-empty array/);
    expect(() => parseSentenceCorpus("{", "x")).toThrow(SentenceCorpusError);
  });

  it("rejects a sentence with leading or trailing whitespace", () => {
    expect(() => parseSentenceCorpus(document([" A."]), "x")).toThrow(
      /must not start or end with whitespace/,
    );
  });

  it("requires the id to match the file name and the ids to be unique", async () => {
    const repoRoot = await makeRepo({
      "seg-pt-outro.json": document(["A."]),
    });
    await expect(loadSentenceCorpus(repoRoot)).rejects.toThrow(/"id" must match the file name/);
  });
});

describe("loadSentenceCorpus", () => {
  it("returns nothing when the directory does not exist", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "pagepace-sentences-empty-"));
    created.push(repoRoot);
    await expect(loadSentenceCorpus(repoRoot)).resolves.toEqual([]);
  });

  it("reads every JSON file in file-name order, ignoring other files", async () => {
    const repoRoot = await makeRepo({
      "b.json": document(["B."], { id: "b", lang: "en" }),
      "a.json": document(["A."], { id: "a" }),
      "README.md": "# not a corpus file\n",
    });
    const entries = await loadSentenceCorpus(repoRoot);
    expect(entries.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

describe("evaluateSentenceDocument", () => {
  it("scores 1 when the segmenter reproduces every annotated break", () => {
    const entry = parseSentenceCorpus(document(["Uma frase.", "Outra frase!", "A última?"]), "x");
    const result = evaluateSentenceCorpus([entry])[0];
    if (!result) throw new Error("expected one sentence result");
    expect(result.result.f1).toBe(1);
    expect(result.result.invented).toEqual([]);
    expect(result.result.missed).toEqual([]);
  });

  it("counts a break the segmenter skipped as missed", () => {
    // "etc." is an abbreviation: the segmenter keeps the sentence going, so the
    // annotated break after it disappears and the metric sees one miss.
    const entry = parseSentenceCorpus(
      document(["Compramos pão, leite, etc.", "Depois fomos embora."]),
      "x",
    );
    const result = evaluateSentenceCorpus([entry])[0];
    if (!result) throw new Error("expected one sentence result");
    expect(result.result.falseNegatives).toBe(1);
    expect(result.result.missed).toEqual([26]);
    expect(result.result.f1).toBe(0);
  });
});

describe("annotated corpus acceptance (SEG-T05)", () => {
  it("reaches the sentence_f1 target in common prose, in pt and en", async () => {
    const entries = await loadSentenceCorpus(REPO_ROOT);
    expect(entries.length).toBeGreaterThanOrEqual(4);
    const results = evaluateSentenceCorpus(entries);
    const report = results.map((result) => ({
      id: result.id,
      lang: result.lang,
      f1: Number(result.result.f1.toFixed(4)),
      invented: result.result.falsePositives,
      missed: result.result.falseNegatives,
    }));
    for (const result of results) {
      expect(report.find((line) => line.id === result.id)).toBeDefined();
      expect(result.result.f1).toBeGreaterThanOrEqual(SENTENCE_F1_TARGET);
    }
    expect(meanSentenceF1(results)).toBeGreaterThanOrEqual(SENTENCE_F1_TARGET);
    expect(new Set(results.map((result) => result.lang))).toEqual(new Set(["pt", "en"]));
    expect(results.reduce((total, result) => total + result.sentences, 0)).toBeGreaterThanOrEqual(
      50,
    );
  });
});

describe("runEval sentence corpus integration", () => {
  it("reports the corpus, records sentence_f1 in the baseline and gates --ci", async () => {
    const repoRoot = await makeRepo({
      "seg-pt-exemplo.json": document(["Uma frase.", "Outra frase!", "A última?"]),
    });
    const logs = capture();
    const measured = await runEval({ repoRoot, env: {}, ...logs.io, writeReport: false });

    expect(measured.code).toBe(0);
    expect(measured.sentences).toHaveLength(1);
    const text = logs.out.join("");
    expect(text).toContain("Sentence segmentation");
    expect(text).toMatch(/seg-pt-exemplo\s+pt\s+3\s+1\.0000/);
    expect(text).toContain("reached");

    await runEval({
      repoRoot,
      env: {},
      out: () => {},
      err: () => {},
      writeReport: false,
      updateBaseline: true,
    });
    const baseline = JSON.parse(
      await readFile(path.join(repoRoot, "packages", "eval", "baseline.json"), "utf8"),
    );
    expect(baseline.documents["seg-pt-exemplo"]).toEqual({ sentence_f1: 1 });

    // A corpus the segmenter cannot split (it keeps "etc." going) drops the
    // metric to 0: --ci must fail against the recorded baseline.
    await writeFile(
      path.join(repoRoot, "corpus", "sentences", "seg-pt-exemplo.json"),
      document(["Compramos pão, leite, etc.", "Depois fomos embora."]),
      "utf8",
    );
    const gate = capture();
    const failed = await runEval({
      repoRoot,
      env: {},
      ...gate.io,
      writeReport: false,
      ci: true,
    });
    expect(failed.code).toBe(1);
    expect(gate.err.join("")).toMatch(/regression: seg-pt-exemplo sentence_f1 1\.0000 -> 0\.0000/);
  });

  it("fails the run when an annotated file is invalid", async () => {
    const repoRoot = await makeRepo({ "seg-pt-quebrado.json": "{" });
    const logs = capture();
    const result = await runEval({ repoRoot, env: {}, ...logs.io, writeReport: false });
    expect(result.code).toBe(1);
    expect(logs.err.join("")).toMatch(/seg-pt-quebrado\.json/);
  });
});
