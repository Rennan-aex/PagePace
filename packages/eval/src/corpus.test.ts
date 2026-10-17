import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CorpusError,
  loadCorpus,
  parseDotEnv,
  parseManifest,
  REPO_ROOT,
  resolveCorpusPrivateDir,
  resolveCorpusPrivateDirDetailed,
} from "./corpus";

/**
 * E1-T05: manifest and `.env` parsing (ADR-031).
 *
 * Everything here runs without network and without the real private corpus:
 * fixtures live in temporary folders.
 */

const sha = (seed: string): string => createHash("sha256").update(seed).digest("hex");

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "pagepace-corpus-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

interface ManifestDoc {
  id: string;
  sha256?: string;
  file?: string;
  sourceUrl?: string;
  visibility?: string;
}

function manifestOf(docs: readonly ManifestDoc[]): string {
  const lines = ["# fixture manifest", "version: 1", "documents:", ""];
  for (const doc of docs) {
    lines.push(`  - id: ${doc.id}`);
    if (doc.file !== undefined) lines.push(`    file: ${doc.file}`);
    lines.push("    level: N2");
    lines.push("    lang: en");
    lines.push(`    title: "${doc.id} title"`);
    lines.push(`    source_url: ${doc.sourceUrl ? `"${doc.sourceUrl}"` : "null"}`);
    if (doc.sha256 !== undefined) lines.push(`    sha256: "${doc.sha256}"`);
    lines.push("    features: [equations]");
    lines.push("    golden: none");
    lines.push(`    visibility: ${doc.visibility ?? "public"}`);
    lines.push("");
  }
  return lines.join("\n");
}

describe("parseDotEnv", () => {
  it("reads KEY=VALUE pairs, quotes, comments and export prefixes", () => {
    const values = parseDotEnv(
      [
        "# a comment",
        "",
        "CORPUS_PRIVATE_DIR=<CORPUS_PRIVATE_DIR>",
        'QUOTED="C:\\with space"',
        "export EXPORTED='single quoted'",
        "WITH_EQUALS=a=b=c",
        "this is not a pair",
        "=no-key",
      ].join("\n"),
    );

    expect(values).toEqual({
      CORPUS_PRIVATE_DIR: "<CORPUS_PRIVATE_DIR>",
      QUOTED: "C:\\with space",
      EXPORTED: "single quoted",
      WITH_EQUALS: "a=b=c",
    });
  });
});

describe("resolveCorpusPrivateDir", () => {
  it("prefers the environment variable over the .env file", async () => {
    const repoRoot = await tempDir();
    const fromDotEnv = await tempDir();
    const fromEnv = await tempDir();
    await writeFile(path.join(repoRoot, ".env"), `CORPUS_PRIVATE_DIR=${fromDotEnv}\n`);

    const resolution = resolveCorpusPrivateDirDetailed({
      env: { CORPUS_PRIVATE_DIR: fromEnv },
      repoRoot,
    });

    expect(resolution).toEqual({ dir: fromEnv, source: "environment" });
    expect(resolveCorpusPrivateDir({ env: { CORPUS_PRIVATE_DIR: fromEnv }, repoRoot })).toBe(
      fromEnv,
    );
  });

  it("falls back to the .env file at the repository root", async () => {
    const repoRoot = await tempDir();
    const fromDotEnv = await tempDir();
    await writeFile(path.join(repoRoot, ".env"), `CORPUS_PRIVATE_DIR="${fromDotEnv}"\n`);

    expect(resolveCorpusPrivateDirDetailed({ env: {}, repoRoot })).toEqual({
      dir: fromDotEnv,
      source: ".env",
    });
  });

  it("returns null when neither source exists", async () => {
    const repoRoot = await tempDir();

    expect(resolveCorpusPrivateDirDetailed({ env: {}, repoRoot })).toEqual({
      dir: null,
      source: null,
    });
    expect(resolveCorpusPrivateDir({ env: {}, repoRoot })).toBeNull();
  });

  it("ignores an empty environment variable", async () => {
    const repoRoot = await tempDir();

    expect(resolveCorpusPrivateDir({ env: { CORPUS_PRIVATE_DIR: "   " }, repoRoot })).toBeNull();
  });
});

describe("parseManifest", () => {
  it("reads the real public manifest (4 downloaded + 10 synthetic entries)", () => {
    const text = readFileSync(path.join(REPO_ROOT, "corpus", "manifest.yaml"), "utf8");
    const entries = parseManifest(text, "corpus/manifest.yaml");

    expect(entries.map((entry) => entry.id)).toEqual([
      "n2-en-arxiv-phobos",
      "n3-pt-scielo-wittgenstein",
      "n1-en-rebus-philosophy-mind",
      "n3-en-scielo-climatejustice",
      "syn-n1-en-paragraphs",
      "syn-n1-pt-acentos",
      "syn-n1-pt-cabecalhos",
      "syn-n1-pt-hifenizacao",
      "syn-n2-en-columns",
      "syn-n2-en-lists",
      "syn-n2-pt-estilos",
      "syn-n3-en-footnotes",
      "syn-n3-en-endnotes",
      "syn-n3-en-quotes",
    ]);
    expect(entries.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256 ?? ""))).toBe(true);
    const phobos = entries[0];
    expect(phobos?.pages).toBe(10);
    expect(phobos?.level).toBe("N2");
    expect(phobos?.features).toEqual(["two-column", "hyphenation", "equations"]);
    expect(phobos?.sourceUrl).toContain("arxiv.org");
    expect(phobos?.visibility).toBe("public");
    expect(phobos?.generated).toBe(false);
    expect(entries[2]?.features).toContain("tagged");
    // ADR-034: the two SciELO PDFs come from the release mirror first and
    // keep both SciELO URLs (CDN variant, canonical) as fallbacks.
    expect(entries[1]?.sourceUrl).toBe(
      "https://api.github.com/repos/Rennan-aex/PagePace/releases/assets/614311768",
    );
    expect(entries[1]?.fallbackUrls).toEqual([
      "https://www.scielo.br/j/fun/a/v7bJr6JzbzbZgXj89dvS7BJ/?format=pdf&lang=pt&ilang=en",
      "https://www.scielo.br/j/fun/a/v7bJr6JzbzbZgXj89dvS7BJ/?format=pdf&lang=pt",
    ]);
    expect(entries[3]?.sourceUrl).toBe(
      "https://api.github.com/repos/Rennan-aex/PagePace/releases/assets/614311837",
    );
    expect(entries[3]?.fallbackUrls).toHaveLength(2);
    expect(entries[0]?.fallbackUrls).toEqual([]);
    // ADR-037: the synthetic documents are generated, never downloaded.
    const synthetic = entries.slice(4);
    expect(synthetic).toHaveLength(10);
    expect(synthetic.every((entry) => entry.generated)).toBe(true);
    expect(synthetic.every((entry) => entry.sourceUrl === null)).toBe(true);
    expect(synthetic.every((entry) => entry.golden === `${entry.id}.golden.json`)).toBe(true);
    expect(synthetic[2]?.features).toEqual(["synthetic", "headers"]);
    expect(synthetic[2]?.golden).toBe("syn-n1-pt-cabecalhos.golden.json");
    expect(synthetic[3]?.features).toEqual(["synthetic", "hyphenation"]);
    expect(synthetic[3]?.golden).toBe("syn-n1-pt-hifenizacao.golden.json");
    expect(synthetic[7]?.features).toEqual(["synthetic", "footnotes"]);
    expect(synthetic[7]?.golden).toBe("syn-n3-en-footnotes.golden.json");
    expect(synthetic[8]?.features).toEqual(["synthetic", "endnotes"]);
    expect(synthetic[8]?.golden).toBe("syn-n3-en-endnotes.golden.json");
    expect(synthetic[9]?.features).toEqual(["synthetic", "quotes"]);
    expect(synthetic[9]?.golden).toBe("syn-n3-en-quotes.golden.json");
  });

  it("reads generated: true, generated: false and rejects anything else", () => {
    const text = [
      "documents:",
      "  - id: n1-en-a",
      "    generated: true",
      `    sha256: "${sha("a")}"`,
      "  - id: n1-en-b",
      "    generated: false",
      `    sha256: "${sha("b")}"`,
      "  - id: n1-en-c",
      `    sha256: "${sha("c")}"`,
      "",
    ].join("\n");

    const entries = parseManifest(text, "sample.yaml");

    expect(entries.map((entry) => entry.generated)).toEqual([true, false, false]);
    expect(() =>
      parseManifest(text.replace("generated: true", "generated: yes"), "bad.yaml"),
    ).toThrowError(/field "generated" must be true or false/);
  });

  it("ignores column-0 prose and parses every value shape", () => {
    const text = [
      "# header",
      "version: 1",
      "documents:",
      "",
      "> free prose that must never break the parser",
      "",
      "  - id: n1-en-sample",
      '    title: "A title: with a colon"',
      "    source_url: null",
      "    pages: 12",
      `    sha256: "${sha("sample")}"`,
      "    features: [tagged, footnotes]",
      "    golden: none",
      "    visibility: public",
      "",
    ].join("\n");

    const [entry] = parseManifest(text, "sample.yaml");

    expect(entry?.id).toBe("n1-en-sample");
    expect(entry?.title).toBe("A title: with a colon");
    expect(entry?.sourceUrl).toBeNull();
    expect(entry?.pages).toBe(12);
    expect(entry?.features).toEqual(["tagged", "footnotes"]);
    expect(entry?.file).toBeNull();
  });

  it("reads fallback_urls and rejects a fallback that is not an http(s) URL", () => {
    const text = [
      "documents:",
      "  - id: n1-en-sample",
      '    source_url: "https://example.org/primary.pdf"',
      '    fallback_urls: ["https://example.org/mirror.pdf", "http://mirror.example/x.pdf"]',
      `    sha256: "${sha("sample")}"`,
      "",
    ].join("\n");

    const [entry] = parseManifest(text, "sample.yaml");

    expect(entry?.fallbackUrls).toEqual([
      "https://example.org/mirror.pdf",
      "http://mirror.example/x.pdf",
    ]);

    const bad = text.replace("https://example.org/mirror.pdf", "ftp://example.org/x.pdf");
    expect(() => parseManifest(bad, "bad.yaml")).toThrowError(
      /bad\.yaml:4: fallback_urls must be http\(s\) URLs/,
    );
  });

  it("reports an unparseable indented line with its line number", () => {
    const text = [
      "version: 1",
      "documents:",
      "",
      "  - id: n1-en-sample",
      "    level: N1",
      "    broken line without a colon",
      "",
    ].join("\n");

    expect(() => parseManifest(text, "bad.yaml")).toThrowError(CorpusError);
    expect(() => parseManifest(text, "bad.yaml")).toThrowError(/bad\.yaml:6: cannot parse line/);
  });

  it("rejects an entry that does not start with '- id:'", () => {
    expect(() => parseManifest("  - level: N1\n", "bad.yaml")).toThrowError(
      /bad\.yaml:1: entries must start with/,
    );
    expect(() => parseManifest("- id: n1-en-sample\n", "bad.yaml")).toThrowError(
      /entries must start with/,
    );
  });

  it("rejects a field before any entry, an unknown field and a duplicate id", () => {
    expect(() => parseManifest("    level: N1\n", "bad.yaml")).toThrowError(
      /bad\.yaml:1: field "level" appears before/,
    );
    expect(() => parseManifest("  - id: n1-en-a\n    nope: 1\n", "bad.yaml")).toThrowError(
      /bad\.yaml:2: unknown field "nope"/,
    );
    expect(() =>
      parseManifest(
        `  - id: n1-en-a\n    sha256: "${sha("a")}"\n  - id: n1-en-a\n    sha256: "${sha("b")}"\n`,
        "bad.yaml",
      ),
    ).toThrowError(/bad\.yaml:3: duplicate id "n1-en-a"/);
  });

  it("rejects a malformed sha256 and an empty id", () => {
    expect(() => parseManifest('  - id: n1-en-a\n    sha256: "abc"\n', "bad.yaml")).toThrowError(
      /64 lowercase hex characters/,
    );
    expect(() => parseManifest("  - id:\n", "bad.yaml")).toThrowError(/empty id/);
  });

  it("keeps the entry line for later error messages", () => {
    const text = ["documents:", "", "  - id: n1-en-a", `    sha256: "${sha("a")}"`].join("\n");
    const [entry] = parseManifest(text, "sample.yaml");

    expect(entry?.line).toBe(3);
  });
});

describe("loadCorpus", () => {
  it("merges the public and private manifests into absolute paths", async () => {
    const repoRoot = await tempDir();
    const privateDir = await tempDir();
    const publicDir = path.join(repoRoot, "corpus", "public");
    await mkdir(publicDir, { recursive: true });
    await writeFile(
      path.join(repoRoot, "corpus", "manifest.yaml"),
      manifestOf([{ id: "n1-en-public", sha256: sha("public") }]),
    );
    await writeFile(
      path.join(privateDir, "manifest.yaml"),
      manifestOf([
        {
          id: "n1-pt-private",
          file: "n1-pt-private.pdf",
          sha256: sha("private"),
          visibility: "private",
        },
      ]),
    );

    const corpus = loadCorpus({ repoRoot, env: { CORPUS_PRIVATE_DIR: privateDir } });

    expect(corpus.publicDir).toBe(publicDir);
    expect(corpus.privateDir).toBe(privateDir);
    expect(corpus.privateDirSource).toBe("environment");
    expect(corpus.publicEntries.map((entry) => entry.path)).toEqual([
      path.join(publicDir, "n1-en-public.pdf"),
    ]);
    expect(corpus.privateEntries.map((entry) => entry.path)).toEqual([
      path.join(privateDir, "n1-pt-private.pdf"),
    ]);
    expect(corpus.entries.map((entry) => entry.id)).toEqual(["n1-en-public", "n1-pt-private"]);
  });

  it("reads the private corpus from the .env file when the variable is absent", async () => {
    const repoRoot = await tempDir();
    const privateDir = await tempDir();
    await mkdir(path.join(repoRoot, "corpus"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "corpus", "manifest.yaml"),
      manifestOf([{ id: "n1-en-public", sha256: sha("public") }]),
    );
    await writeFile(
      path.join(privateDir, "manifest.yaml"),
      manifestOf([
        {
          id: "n1-pt-private",
          file: "n1-pt-private.pdf",
          sha256: sha("private"),
          visibility: "private",
        },
      ]),
    );
    await writeFile(path.join(repoRoot, ".env"), `CORPUS_PRIVATE_DIR=${privateDir}\n`);

    const corpus = loadCorpus({ repoRoot, env: {} });

    expect(corpus.privateDirSource).toBe(".env");
    expect(corpus.privateEntries).toHaveLength(1);
  });

  it("uses only the public manifest when no private source exists", async () => {
    const repoRoot = await tempDir();
    await mkdir(path.join(repoRoot, "corpus"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "corpus", "manifest.yaml"),
      manifestOf([{ id: "n1-en-public", sha256: sha("public") }]),
    );

    const corpus = loadCorpus({ repoRoot, env: {} });

    expect(corpus.privateDir).toBeNull();
    expect(corpus.privateDirSource).toBeNull();
    expect(corpus.entries.map((entry) => entry.id)).toEqual(["n1-en-public"]);
  });

  it("rejects a private entry without file, a repeated id and a missing sha256", async () => {
    const repoRoot = await tempDir();
    const privateDir = await tempDir();
    const publicDir = path.join(repoRoot, "corpus", "public");
    await mkdir(publicDir, { recursive: true });

    await writeFile(
      path.join(repoRoot, "corpus", "manifest.yaml"),
      manifestOf([{ id: "n1-en-shared", sha256: sha("public") }]),
    );
    await writeFile(
      path.join(privateDir, "manifest.yaml"),
      manifestOf([
        {
          id: "n1-en-shared",
          file: "n1-en-shared.pdf",
          sha256: sha("other"),
          visibility: "private",
        },
      ]),
    );
    expect(() => loadCorpus({ repoRoot, env: { CORPUS_PRIVATE_DIR: privateDir } })).toThrowError(
      /duplicate corpus id "n1-en-shared"/,
    );

    await writeFile(
      path.join(privateDir, "manifest.yaml"),
      manifestOf([{ id: "n1-pt-no-file", sha256: sha("private"), visibility: "private" }]),
    );
    expect(() => loadCorpus({ repoRoot, env: { CORPUS_PRIVATE_DIR: privateDir } })).toThrowError(
      /private entry "n1-pt-no-file" has no file/,
    );

    await writeFile(
      path.join(repoRoot, "corpus", "manifest.yaml"),
      "version: 1\ndocuments:\n\n  - id: n1-en-public\n    visibility: public\n",
    );
    expect(() => loadCorpus({ repoRoot, env: {} })).toThrowError(/has no sha256/);
  });

  it("fails clearly when the public manifest is missing", async () => {
    const repoRoot = await tempDir();

    expect(() => loadCorpus({ repoRoot, env: {} })).toThrowError(
      /corpus\/manifest\.yaml: file not found/,
    );
  });

  it("loads the real repository manifest", () => {
    const corpus = loadCorpus({ repoRoot: REPO_ROOT, env: {} });

    expect(corpus.publicEntries).toHaveLength(14);
    expect(corpus.publicEntries.map((entry) => entry.id)).toContain("n1-en-rebus-philosophy-mind");
    for (const entry of corpus.publicEntries) {
      expect(entry.path.startsWith(corpus.publicDir)).toBe(true);
      expect(entry.path.endsWith(".pdf")).toBe(true);
      // ADR-037: generated documents live in corpus/public/synthetic/.
      expect(entry.path.includes(path.join("public", "synthetic"))).toBe(entry.generated);
    }
  });

  it("resolves a generated entry to corpus/public/synthetic/<id>.pdf", async () => {
    const repoRoot = await tempDir();
    await mkdir(path.join(repoRoot, "corpus"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "corpus", "manifest.yaml"),
      [
        "documents:",
        "",
        "  - id: syn-n1-en-fixture",
        "    generated: true",
        `    sha256: "${sha("synthetic")}"`,
        "    golden: syn-n1-en-fixture.golden.json",
        "",
      ].join("\n"),
    );

    const corpus = loadCorpus({ repoRoot, env: {} });

    expect(corpus.publicEntries[0]?.path).toBe(
      path.join(repoRoot, "corpus", "public", "synthetic", "syn-n1-en-fixture.pdf"),
    );
    expect(corpus.publicEntries[0]?.generated).toBe(true);
  });

  it("rejects a generated entry in the private manifest", async () => {
    const repoRoot = await tempDir();
    const privateDir = await tempDir();
    await mkdir(path.join(repoRoot, "corpus"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "corpus", "manifest.yaml"),
      manifestOf([{ id: "n1-en-public", sha256: sha("public") }]),
    );
    await writeFile(
      path.join(privateDir, "manifest.yaml"),
      [
        "documents:",
        "",
        "  - id: n1-pt-private",
        "    file: n1-pt-private.pdf",
        "    generated: true",
        `    sha256: "${sha("private")}"`,
        "",
      ].join("\n"),
    );

    expect(() => loadCorpus({ repoRoot, env: { CORPUS_PRIVATE_DIR: privateDir } })).toThrowError(
      /generated entries belong to corpus\/manifest\.yaml/,
    );
  });
});
