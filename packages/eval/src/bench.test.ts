import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MB, ScannedPdfError, sha256Hex } from "@pagepace/extractor";
import { afterEach, describe, expect, it } from "vitest";
import { buildPdf, textStream } from "../../extractor/test/minipdf";
import {
  type BenchExtractFn,
  HELP,
  median,
  runBench,
  runBenchCli,
  runWorkerProcess,
  WORKER_PREFIX,
} from "./bench";
import {
  BENCH_BASELINE_FORMAT_VERSION,
  BENCH_REGRESSION_PCT,
  benchBaselinePath,
  parseBenchBaseline,
  writeBenchBaseline,
} from "./bench-baseline";

const DIGEST_OF_NOTHING = "0".repeat(64);

interface EntrySpec {
  id: string;
  level?: string;
  sha256: string;
  pages?: number;
}

function entryLines(spec: EntrySpec): string {
  const lines = [
    `  - id: ${spec.id}`,
    `    level: ${spec.level ?? "N1"}`,
    `    lang: "en"`,
    `    title: "${spec.id}"`,
  ];
  if (spec.pages !== undefined) lines.push(`    pages: ${spec.pages}`);
  lines.push(
    `    sha256: "${spec.sha256}"`,
    "    features: []",
    "    golden: none",
    "    visibility: public",
  );
  return `${lines.join("\n")}\n`;
}

async function makeRepo(entries: EntrySpec[]): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "pagepace-bench-"));
  await mkdir(path.join(repoRoot, "corpus", "public"), { recursive: true });
  await writeFile(
    path.join(repoRoot, "corpus", "manifest.yaml"),
    `version: 1\ndocuments:\n${entries.map(entryLines).join("")}`,
    "utf8",
  );
  return repoRoot;
}

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

/** The runner reads the PDF before the adapter runs; fake adapters ignore it. */
async function writePlaceholder(repoRoot: string, id: string): Promise<void> {
  await writeFile(path.join(repoRoot, "corpus", "public", `${id}.pdf`), new Uint8Array([1, 2, 3]));
}

afterEach(async () => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

/** Deterministic extract: ignores the PDF, returns fixed numbers through `sample`. */
function fakeExtract(output: {
  pages?: number;
  sha256?: string;
  ms?: number;
  peakMb?: number;
  onSample?: () => void;
}): BenchExtractFn {
  return async (input) => {
    output.onSample?.();
    input.sample();
    return {
      pages: output.pages ?? 2,
      sha256: output.sha256 ?? DIGEST_OF_NOTHING,
      ...(output.ms === undefined ? {} : { ms: output.ms }),
      ...(output.peakMb === undefined ? {} : { peakMb: output.peakMb }),
    };
  };
}

describe("median", () => {
  it("returns the middle value of sorted samples", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([7])).toBe(7);
  });

  it("rejects an empty list", () => {
    expect(() => median([])).toThrow(RangeError);
  });
});

describe("runBench", () => {
  it("measures a document with the injected clock and memory probes", async () => {
    const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING, pages: 2 }]);
    await writePlaceholder(repoRoot, "n1-en-sample");
    const logs = capture();
    let clock = 0;
    const result = await runBench({
      repoRoot,
      env: {},
      ...logs.io,
      writeReport: false,
      extract: fakeExtract({ pages: 2, sha256: DIGEST_OF_NOTHING }),
      now: () => {
        clock += 1000;
        return clock;
      },
      rss: () => 250 * MB,
      intervalMs: 0,
    });

    expect(result.code).toBe(0);
    expect(result.measured).toBe(1);
    const document = result.documents[0];
    expect(document?.status).toBe("measured");
    expect(document?.pages).toBe(2);
    expect(document?.ms).toBe(1000);
    expect(document?.msPerPage).toBe(500);
    expect(document?.peakMb).toBe(250);
    expect(logs.out.join("")).toContain("n1-en-sample");
    expect(logs.out.join("")).toContain("measured");
  });

  it("uses the worker-provided medians when the adapter reports them", async () => {
    const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING, pages: 2 }]);
    await writePlaceholder(repoRoot, "n1-en-sample");
    const logs = capture();
    const result = await runBench({
      repoRoot,
      env: {},
      ...logs.io,
      writeReport: false,
      extract: fakeExtract({ pages: 2, sha256: DIGEST_OF_NOTHING, ms: 400, peakMb: 123.45 }),
      now: () => 999999,
      rss: () => 1,
      intervalMs: 0,
    });
    expect(result.documents[0]?.ms).toBe(400);
    expect(result.documents[0]?.peakMb).toBe(123.5);
  });

  it("reads the PDF before measuring and reports a missing file as an error", async () => {
    const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING, pages: 1 }]);
    const logs = capture();
    const result = await runBench({
      repoRoot,
      env: {},
      ...logs.io,
      writeReport: false,
      extract: fakeExtract({}),
      intervalMs: 0,
    });
    expect(result.code).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.documents[0]?.status).toBe("error");
    expect(result.documents[0]?.error).toMatch(/PDF not found .*pnpm corpus:fetch/);
    expect(logs.err.join("")).toMatch(/n1-en-sample: PDF not found/);
  });

  it("fails on a SHA-256 that does not match the manifest", async () => {
    const bytes = buildPdf([textStream("Hello world.")]);
    const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING, pages: 1 }]);
    await writeFile(path.join(repoRoot, "corpus", "public", "n1-en-sample.pdf"), bytes);
    const logs = capture();
    const result = await runBench({
      repoRoot,
      env: {},
      ...logs.io,
      writeReport: false,
      extract: fakeExtract({ sha256: sha256Hex(bytes), pages: 1 }),
      intervalMs: 0,
    });
    expect(result.code).toBe(1);
    expect(result.documents[0]?.error).toMatch(/SHA-256 mismatch/);
  });

  it("lists a scanned PDF (ADR-018) as skipped without failing", async () => {
    const bytes = buildPdf([""]);
    const repoRoot = await repo([{ id: "n5-en-scan", level: "N5", sha256: sha256Hex(bytes) }]);
    await writeFile(path.join(repoRoot, "corpus", "public", "n5-en-scan.pdf"), bytes);
    const logs = capture();
    const result = await runBench({
      repoRoot,
      env: {},
      ...logs.io,
      writeReport: false,
      extract: async () => {
        throw new ScannedPdfError();
      },
      intervalMs: 0,
    });
    expect(result.code).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.documents[0]?.status).toBe("skipped");
    expect(result.warnings.join(" ")).toMatch(/n5-en-scan: skipped/);
    expect(logs.err.join("")).toMatch(/bench: warning:/);
  });

  it("maps a worker result onto the document numbers", async () => {
    const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING, pages: 3 }]);
    await writePlaceholder(repoRoot, "n1-en-sample");
    const logs = capture();
    const result = await runBench({
      repoRoot,
      env: {},
      ...logs.io,
      writeReport: false,
      workerRun: async (request) => {
        expect(request.fileName).toBe("n1-en-sample.pdf");
        expect(request.runs).toBe(1);
        return { ok: true, pages: 3, sha256: DIGEST_OF_NOTHING, ms: 30, peakMb: 80 };
      },
      intervalMs: 0,
    });
    expect(result.code).toBe(0);
    expect(result.documents[0]?.ms).toBe(30);
    expect(result.documents[0]?.msPerPage).toBe(10);
    expect(result.documents[0]?.peakMb).toBe(80);
  });

  it("maps a skipped worker result onto a skipped document", async () => {
    const repoRoot = await repo([{ id: "n5-en-scan", level: "N5", sha256: DIGEST_OF_NOTHING }]);
    await writePlaceholder(repoRoot, "n5-en-scan");
    const logs = capture();
    const result = await runBench({
      repoRoot,
      env: {},
      ...logs.io,
      writeReport: false,
      workerRun: async () => ({ ok: false, skipped: true, error: "scanned" }),
      intervalMs: 0,
    });
    expect(result.code).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("maps a failed worker result onto an error document and exit 1", async () => {
    const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING }]);
    await writePlaceholder(repoRoot, "n1-en-sample");
    const logs = capture();
    const result = await runBench({
      repoRoot,
      env: {},
      ...logs.io,
      writeReport: false,
      workerRun: async () => ({ ok: false, skipped: false, error: "boom" }),
      intervalMs: 0,
    });
    expect(result.code).toBe(1);
    expect(result.documents[0]?.error).toBe("boom");
  });

  it("treats a worker that could not run as an error document", async () => {
    const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING }]);
    await writePlaceholder(repoRoot, "n1-en-sample");
    const logs = capture();
    const result = await runBench({
      repoRoot,
      env: {},
      ...logs.io,
      writeReport: false,
      workerRun: async () => {
        throw new Error("worker exited with code 1 without a result");
      },
      intervalMs: 0,
    });
    expect(result.code).toBe(1);
    expect(result.documents[0]?.error).toMatch(/without a result/);
  });

  it("writes the machine-readable report to packages/eval/out/bench.json", async () => {
    const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING, pages: 2 }]);
    await writePlaceholder(repoRoot, "n1-en-sample");
    const logs = capture();
    await runBench({
      repoRoot,
      env: {},
      ...logs.io,
      extract: fakeExtract({ pages: 2 }),
      intervalMs: 0,
    });
    const report = JSON.parse(
      await readFile(path.join(repoRoot, "packages", "eval", "out", "bench.json"), "utf8"),
    ) as { documents: { id: string }[]; measured: number };
    expect(report.measured).toBe(1);
    expect(report.documents[0]?.id).toBe("n1-en-sample");
  });

  it("rejects a runs value outside 1..10", async () => {
    const logs = capture();
    const result = await runBench({ env: {}, ...logs.io, runs: 0, writeReport: false });
    expect(result.code).toBe(2);
    expect(logs.err.join("")).toMatch(/--runs must be an integer between 1 and 10/);
  });

  describe("baseline flags", () => {
    it("updates the baseline from a clean run", async () => {
      const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING, pages: 2 }]);
      await writePlaceholder(repoRoot, "n1-en-sample");
      const logs = capture();
      const result = await runBench({
        repoRoot,
        env: {},
        ...logs.io,
        writeReport: false,
        updateBaseline: true,
        extract: fakeExtract({ pages: 2, ms: 400, peakMb: 123.45 }),
        intervalMs: 0,
      });
      expect(result.code).toBe(0);
      const text = await readFile(benchBaselinePath(repoRoot), "utf8");
      expect(parseBenchBaseline(text)).toEqual({
        version: BENCH_BASELINE_FORMAT_VERSION,
        regressionPct: BENCH_REGRESSION_PCT,
        documents: { "n1-en-sample": { pages: 2, ms_per_page: 200, peak_mb: 123.5 } },
      });
      expect(logs.out.join("")).toMatch(/bench baseline updated/);
    });

    it("refuses to update the baseline when a document failed", async () => {
      const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING }]);
      const logs = capture();
      const result = await runBench({
        repoRoot,
        env: {},
        ...logs.io,
        writeReport: false,
        updateBaseline: true,
        extract: fakeExtract({}),
        intervalMs: 0,
      });
      expect(result.code).toBe(1);
      expect(logs.err.join("")).toMatch(/refusing to update the baseline/);
      await expect(readFile(benchBaselinePath(repoRoot), "utf8")).rejects.toThrow();
    });

    it("--ci without a baseline warns and exits 0 (bootstrap)", async () => {
      const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING, pages: 2 }]);
      await writePlaceholder(repoRoot, "n1-en-sample");
      const logs = capture();
      const result = await runBench({
        repoRoot,
        env: {},
        ...logs.io,
        writeReport: false,
        ci: true,
        extract: fakeExtract({ pages: 2, ms: 400, peakMb: 200 }),
        intervalMs: 0,
      });
      expect(result.code).toBe(0);
      expect(logs.err.join("")).toMatch(/baseline not found/);
      expect(logs.out.join("")).not.toContain("::warning");
    });

    it("--ci warns about regressions but never fails (E8-T04 acceptance)", async () => {
      const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING, pages: 1000 }]);
      await writePlaceholder(repoRoot, "n1-en-sample");
      await writeBenchBaseline(repoRoot, {
        version: BENCH_BASELINE_FORMAT_VERSION,
        regressionPct: BENCH_REGRESSION_PCT,
        documents: { "n1-en-sample": { pages: 1000, ms_per_page: 6, peak_mb: 10 } },
      });
      const logs = capture();
      const result = await runBench({
        repoRoot,
        env: {},
        ...logs.io,
        writeReport: false,
        ci: true,
        extract: fakeExtract({ pages: 1000, ms: 13_000, peakMb: 40 }),
        intervalMs: 0,
      });
      expect(result.code).toBe(0);
      expect(logs.err.join("")).toMatch(/regression: n1-en-sample ms_per_page 6\.0 -> 13\.0/);
      expect(logs.err.join("")).toMatch(/regression: n1-en-sample peak_mb 10\.0 -> 40\.0/);
      expect(logs.out.join("")).toContain("::warning title=pnpm bench::");
      expect(logs.out.join("")).toContain("baseline");
    });

    it("--ci warns about documents missing from the run and new documents", async () => {
      const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING, pages: 2 }]);
      await writePlaceholder(repoRoot, "n1-en-sample");
      await writeBenchBaseline(repoRoot, {
        version: BENCH_BASELINE_FORMAT_VERSION,
        regressionPct: BENCH_REGRESSION_PCT,
        documents: {
          "n1-en-sample": { pages: 2, ms_per_page: 5, peak_mb: 10 },
          "n1-en-gone": { pages: 3, ms_per_page: 5, peak_mb: 10 },
        },
      });
      const logs = capture();
      const result = await runBench({
        repoRoot,
        env: {},
        ...logs.io,
        writeReport: false,
        ci: true,
        extract: fakeExtract({ pages: 2, ms: 10, peakMb: 10 }),
        intervalMs: 0,
      });
      expect(result.code).toBe(0);
      expect(logs.err.join("")).toMatch(/n1-en-gone is in the baseline but was not measured/);
      expect(logs.out.join("")).not.toContain("::warning title=pnpm bench::");
    });

    it("--diff prints this run side by side with the baseline", async () => {
      const repoRoot = await repo([{ id: "n1-en-sample", sha256: DIGEST_OF_NOTHING, pages: 1000 }]);
      await writePlaceholder(repoRoot, "n1-en-sample");
      await writeBenchBaseline(repoRoot, {
        version: BENCH_BASELINE_FORMAT_VERSION,
        regressionPct: BENCH_REGRESSION_PCT,
        documents: { "n1-en-sample": { pages: 1000, ms_per_page: 1, peak_mb: 10 } },
      });
      const logs = capture();
      const result = await runBench({
        repoRoot,
        env: {},
        ...logs.io,
        writeReport: false,
        diff: true,
        extract: fakeExtract({ pages: 1000, ms: 1000, peakMb: 10 }),
        intervalMs: 0,
      });
      expect(result.code).toBe(0);
      const text = logs.out.join("");
      expect(text).toContain("Bench diff against packages/eval/bench-baseline.json");
      expect(text).toContain("ms_per_page");
      expect(text).toContain("peak_mb");
    });
  });
});

describe("runBenchCli", () => {
  it("prints the help and exits 0", async () => {
    const logs = capture();
    const code = await runBenchCli(["--help"], logs.io);
    expect(code).toBe(0);
    expect(logs.out.join("")).toBe(HELP);
    expect(logs.out.join("")).toMatch(/Exit codes/);
    expect(logs.out.join("")).toMatch(/--update-baseline/);
  });

  it("rejects an unknown option", async () => {
    const logs = capture();
    const code = await runBenchCli(["--nope"], logs.io);
    expect(code).toBe(2);
    expect(logs.err.join("")).toMatch(/unknown option: --nope/);
  });

  it("rejects --update-baseline combined with --ci or --diff", async () => {
    const logs = capture();
    expect(await runBenchCli(["--update-baseline", "--ci"], logs.io)).toBe(2);
    expect(await runBenchCli(["--update-baseline", "--diff"], logs.io)).toBe(2);
    expect(logs.err.join("")).toMatch(/--update-baseline cannot be combined/);
  });

  it("rejects --runs outside 1..10", async () => {
    const logs = capture();
    expect(await runBenchCli(["--runs", "0"], logs.io)).toBe(2);
    expect(await runBenchCli(["--runs", "99"], logs.io)).toBe(2);
    expect(logs.err.join("")).toMatch(/--runs must be an integer between 1 and 10/);
  });
});

describe("runWorkerProcess", () => {
  it("measures a real PDF and reports pages, digest, time and peak", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pagepace-bench-worker-"));
    created.push(dir);
    const bytes = buildPdf([textStream("Hello world.")]);
    const file = path.join(dir, "sample.pdf");
    await writeFile(file, bytes);
    let clock = 0;
    const result = await runWorkerProcess(
      { pdfPath: file, fileName: "sample.pdf", runs: 2 },
      {
        now: () => {
          clock += 10;
          return clock;
        },
        rss: () => 100 * MB,
        intervalMs: 0,
      },
    );
    expect(result).toEqual({
      ok: true,
      pages: 1,
      sha256: sha256Hex(bytes),
      ms: 10,
      peakMb: 100,
    });
  });

  it("reports a scanned PDF as skipped (ADR-018)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pagepace-bench-worker-"));
    created.push(dir);
    const bytes = buildPdf([""]);
    const file = path.join(dir, "scan.pdf");
    await writeFile(file, bytes);
    const result = await runWorkerProcess({ pdfPath: file, fileName: "scan.pdf", runs: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.skipped).toBe(true);
    }
  });
});

describe("runBench through a real spawned worker process", () => {
  it("measures a synthetic PDF end to end (spawn + marker line)", async () => {
    const bytes = buildPdf([textStream("Hello world.")]);
    const repoRoot = await repo([{ id: "n1-en-sample", sha256: sha256Hex(bytes), pages: 1 }]);
    await writeFile(path.join(repoRoot, "corpus", "public", "n1-en-sample.pdf"), bytes);
    const logs = capture();
    const result = await runBench({
      repoRoot,
      env: {},
      ...logs.io,
      writeReport: false,
    });
    expect(result.code).toBe(0);
    expect(result.measured).toBe(1);
    const document = result.documents[0];
    expect(document?.status).toBe("measured");
    expect(document?.pages).toBe(1);
    expect(document?.ms).toBeGreaterThan(0);
    expect(document?.peakMb).toBeGreaterThan(0);
    expect(WORKER_PREFIX).toBe("##PAGEPACE-BENCH## ");
  }, 60_000);
});
