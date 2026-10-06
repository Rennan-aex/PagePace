import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SCANNED_PDF_MESSAGE, sha256Hex } from "@pagepace/extractor";
import { afterEach, describe, expect, it } from "vitest";
import { buildPdf, textStream } from "../../extractor/test/minipdf";
import { HELP, runEval, runEvalCli } from "./eval";

interface EntrySpec {
  id: string;
  level?: string;
  lang?: string;
  pages?: number;
  sha256: string;
  golden?: string;
  visibility?: string;
  file?: string;
}

function entryLines(spec: EntrySpec): string {
  const lines = [
    `  - id: ${spec.id}`,
    `    level: ${spec.level ?? "N1"}`,
    `    lang: ${spec.lang ?? "en"}`,
    `    title: "${spec.id}"`,
  ];
  if (spec.file) lines.push(`    file: ${spec.file}`);
  if (spec.pages !== undefined) lines.push(`    pages: ${spec.pages}`);
  lines.push(
    `    sha256: "${spec.sha256}"`,
    "    features: []",
    `    golden: ${spec.golden ?? "none"}`,
    `    visibility: ${spec.visibility ?? "public"}`,
  );
  return `${lines.join("\n")}\n`;
}

const DIGEST_OF_NOTHING = "0".repeat(64);

async function makeRepo(entries: EntrySpec[]): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "pagepace-eval-"));
  await mkdir(path.join(repoRoot, "corpus", "public"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "corpus", "manifest.yaml"),
    `version: 1\ndocuments:\n${entries.map(entryLines).join("")}`,
    "utf8",
  );
  return repoRoot;
}

async function writeGolden(repoRoot: string, id: string, value: unknown): Promise<string> {
  const dir = path.join(repoRoot, "corpus", "golden");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}.golden.json`);
  await writeFile(file, JSON.stringify(value, null, 2), "utf8");
  return file;
}

function goldenValue(id: string, blocks: unknown[], coverage?: number[]): unknown {
  return {
    id,
    schemaVersion: "1.1.0",
    source: "synthetic",
    ...(coverage ? { coverage: { pages: coverage } } : {}),
    blocks,
  };
}

const paragraph = (text: string, page = 1) => ({
  kind: "paragraph",
  runs: [{ text }],
  origin: { pageFrom: page, pageTo: page },
});

interface Capture {
  out: string[];
  err: string[];
  io: { out: (text: string) => void; err: (text: string) => void };
}

function capture(): Capture {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { out: (text) => void out.push(text), err: (text) => void err.push(text) },
  };
}

const created: string[] = [];
async function repo(entries: EntrySpec[]): Promise<string> {
  const repoRoot = await makeRepo(entries);
  created.push(repoRoot);
  return repoRoot;
}

afterEach(async () => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("runEval", () => {
  it("lists documents without a golden, warns once and exits 0", async () => {
    const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING, pages: 1 }]);
    const logs = capture();

    const result = await runEval({
      repoRoot,
      env: {},
      ...logs.io,
      writeReport: false,
    });

    expect(result.code).toBe(0);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]?.status).toBe("no-golden");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/no document declares a golden/);
    const text = logs.out.join("");
    expect(text).toContain("n1-en-sample");
    expect(text).toContain("no golden");
    expect(text).toContain("By level");
    expect(logs.err.join("")).toMatch(/eval: warning:/);
  });

  it("measures text_cer end to end on a synthetic PDF (golden match = 0)", async () => {
    const id = "n1-en-sample";
    const bytes = buildPdf([textStream("Hello world.", { x: 72, y: 400, size: 12 })]);
    const repoRoot = await repo([
      { id, sha256: sha256Hex(bytes), pages: 1, golden: `${id}.golden.json` },
    ]);
    await writeFile(path.join(repoRoot, "corpus", "public", `${id}.pdf`), bytes);
    await writeGolden(repoRoot, id, goldenValue(id, [paragraph("Hello world.")]));

    const logs = capture();
    const result = await runEval({ repoRoot, env: {}, ...logs.io, writeReport: false });

    expect(result.code).toBe(0);
    expect(result.measured).toBe(1);
    expect(result.documents[0]?.status).toBe("measured");
    expect(result.documents[0]?.cer).toBe(0);
    expect(result.documents[0]?.edits).toBe(0);
    expect(logs.out.join("")).toMatch(/text_cer/);
    expect(logs.out.join("")).toContain("0.0000");
  });

  it("reports the character errors of a golden that does not match", async () => {
    const id = "n1-en-sample";
    const bytes = buildPdf([textStream("Hello world.", { x: 72, y: 400, size: 12 })]);
    const repoRoot = await repo([
      { id, sha256: sha256Hex(bytes), pages: 1, golden: `${id}.golden.json` },
    ]);
    await writeFile(path.join(repoRoot, "corpus", "public", `${id}.pdf`), bytes);
    await writeGolden(repoRoot, id, goldenValue(id, [paragraph("Hello worl.")]));

    const result = await runEval({
      repoRoot,
      env: {},
      out: () => {},
      err: () => {},
      writeReport: false,
    });

    expect(result.code).toBe(0);
    expect(result.documents[0]?.edits).toBe(1);
    expect(result.documents[0]?.refChars).toBe(11);
    expect(result.documents[0]?.cer).toBeCloseTo(1 / 11, 10);
  });

  it("limits the extraction to coverage.pages", async () => {
    const id = "n1-en-sample";
    const bytes = buildPdf([
      textStream("Page one.", { x: 72, y: 400, size: 12 }),
      textStream("Page two.", { x: 72, y: 400, size: 12 }),
    ]);
    const repoRoot = await repo([
      { id, sha256: sha256Hex(bytes), pages: 2, golden: `${id}.golden.json` },
    ]);
    await writeFile(path.join(repoRoot, "corpus", "public", `${id}.pdf`), bytes);
    await writeGolden(repoRoot, id, goldenValue(id, [paragraph("Page one.", 1)], [1]));

    const result = await runEval({
      repoRoot,
      env: {},
      out: () => {},
      err: () => {},
      writeReport: false,
    });

    expect(result.code).toBe(0);
    expect(result.documents[0]?.cer).toBe(0);
    expect(result.documents[0]?.refChars).toBe("Page one.".length);
  });

  it("fails when the PDF of a documented golden is missing", async () => {
    const id = "n1-en-sample";
    const repoRoot = await repo([
      { id, sha256: DIGEST_OF_NOTHING, pages: 1, golden: `${id}.golden.json` },
    ]);
    await writeGolden(repoRoot, id, goldenValue(id, [paragraph("Hello world.")]));

    const logs = capture();
    const result = await runEval({ repoRoot, env: {}, ...logs.io, writeReport: false });

    expect(result.code).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.documents[0]?.status).toBe("error");
    expect(result.documents[0]?.error).toMatch(/pnpm corpus:fetch/);
    expect(logs.err.join("")).toMatch(/n1-en-sample/);
  });

  it("fails when the golden file declared in the manifest does not exist", async () => {
    const id = "n1-en-sample";
    const repoRoot = await repo([
      { id, sha256: DIGEST_OF_NOTHING, pages: 1, golden: `${id}.golden.json` },
    ]);

    const result = await runEval({
      repoRoot,
      env: {},
      out: () => {},
      err: () => {},
      writeReport: false,
    });

    expect(result.code).toBe(1);
    expect(result.documents[0]?.error).toMatch(/golden declared but not found/);
  });

  it("fails on a SHA-256 that does not match the manifest", async () => {
    const id = "n1-en-sample";
    const bytes = buildPdf([textStream("Hello world.", { x: 72, y: 400, size: 12 })]);
    const repoRoot = await repo([
      { id, sha256: DIGEST_OF_NOTHING, pages: 1, golden: `${id}.golden.json` },
    ]);
    await writeFile(path.join(repoRoot, "corpus", "public", `${id}.pdf`), bytes);
    await writeGolden(repoRoot, id, goldenValue(id, [paragraph("Hello world.")]));

    const result = await runEval({
      repoRoot,
      env: {},
      out: () => {},
      err: () => {},
      writeReport: false,
    });

    expect(result.code).toBe(1);
    expect(result.documents[0]?.error).toMatch(/SHA-256 mismatch/);
  });

  it("reports a scanned PDF with the exact ADR-018 message", async () => {
    const id = "n5-en-sample";
    const bytes = buildPdf([""]);
    const repoRoot = await repo([
      {
        id,
        level: "N5",
        sha256: sha256Hex(bytes),
        pages: 1,
        golden: `${id}.golden.json`,
      },
    ]);
    await writeFile(path.join(repoRoot, "corpus", "public", `${id}.pdf`), bytes);
    await writeGolden(repoRoot, id, goldenValue(id, [paragraph("Whatever.")]));

    const result = await runEval({
      repoRoot,
      env: {},
      out: () => {},
      err: () => {},
      writeReport: false,
    });

    expect(result.code).toBe(1);
    expect(result.documents[0]?.error).toBe(SCANNED_PDF_MESSAGE);
  });

  it("rejects a golden whose id does not match the manifest entry", async () => {
    const id = "n1-en-sample";
    const repoRoot = await repo([
      { id, sha256: DIGEST_OF_NOTHING, pages: 1, golden: `${id}.golden.json` },
    ]);
    await writeGolden(repoRoot, id, goldenValue("another-id", [paragraph("Hello world.")]));

    const result = await runEval({
      repoRoot,
      env: {},
      out: () => {},
      err: () => {},
      writeReport: false,
    });

    expect(result.code).toBe(1);
    expect(result.documents[0]?.error).toMatch(/does not match the manifest id/);
  });

  it("measures the private corpus when CORPUS_PRIVATE_DIR points at it", async () => {
    const id = "n1-pt-private";
    const bytes = buildPdf([textStream("Texto de exemplo.", { x: 72, y: 400, size: 12 })]);
    const privateDir = await mkdtemp(path.join(tmpdir(), "pagepace-private-"));
    created.push(privateDir);
    await writeFile(path.join(privateDir, `${id}.pdf`), bytes);
    await writeFile(
      path.join(privateDir, "manifest.yaml"),
      `version: 1\ndocuments:\n${entryLines({
        id,
        level: "N1",
        lang: "pt",
        sha256: sha256Hex(bytes),
        pages: 1,
        golden: `${id}.golden.json`,
        visibility: "private",
        file: `${id}.pdf`,
      })}`,
      "utf8",
    );
    const goldenDir = path.join(privateDir, "golden");
    await mkdir(goldenDir, { recursive: true });
    await writeFile(
      path.join(goldenDir, `${id}.golden.json`),
      JSON.stringify(goldenValue(id, [paragraph("Texto de exemplo.")])),
      "utf8",
    );

    const repoRoot = await repo([]);
    const result = await runEval({
      repoRoot,
      env: { CORPUS_PRIVATE_DIR: privateDir },
      out: () => {},
      err: () => {},
      writeReport: false,
    });

    expect(result.code).toBe(0);
    expect(result.measured).toBe(1);
    expect(result.documents[0]?.id).toBe(id);
    expect(result.documents[0]?.cer).toBe(0);
  });

  it("works with the public corpus only (no private source)", async () => {
    const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING }]);
    const result = await runEval({
      repoRoot,
      env: {},
      out: () => {},
      err: () => {},
      writeReport: false,
    });
    expect(result.code).toBe(0);
    expect(result.warnings.some((text) => text.includes("no document declares a golden"))).toBe(
      true,
    );
    expect(result.warnings.some((text) => text.includes("CORPUS_PRIVATE_DIR"))).toBe(false);
  });

  it("writes packages/eval/out/report.json without timestamps", async () => {
    const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING }]);
    await runEval({ repoRoot, env: {}, out: () => {}, err: () => {} });

    const report = JSON.parse(
      await readFile(path.join(repoRoot, "packages", "eval", "out", "report.json"), "utf8"),
    );
    expect(report.measured).toBe(0);
    expect(report.documents[0].id).toBe("n1-en-sample");
    expect(report.documents[0].status).toBe("no-golden");
    expect(report.levels[0].level).toBe("N1");
    expect(JSON.stringify(report)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("runEvalCli", () => {
  it("prints the help and exits 0", async () => {
    const logs = capture();
    const code = await runEvalCli(["--help"], logs.io);
    expect(code).toBe(0);
    expect(logs.out.join("")).toBe(HELP);
    expect(logs.out.join("")).toMatch(/Exit codes/);
  });

  it("rejects unknown options with exit code 2", async () => {
    const logs = capture();
    const code = await runEvalCli(["--ci"], logs.io);
    expect(code).toBe(2);
    expect(logs.err.join("")).toMatch(/unknown option: --ci/);
  });
});
