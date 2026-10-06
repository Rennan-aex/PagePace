// `pnpm corpus:synthetic` — regenerates the synthetic corpus (E1-T07, ADR-013).
//
// One specification (packages/eval/src/specs.ts) produces both artefacts:
//
//   corpus/public/synthetic/<id>.pdf    built here, ignored by git (ADR-037)
//   corpus/golden/<id>.golden.json      built here, committed
//
// The script also cross-checks the specification against the manifest entry
// (`generated: true`, sha256, pages, level, lang, features, golden file), so
// a spec that changes without the manifest is an error and never a silent
// re-hash (golden rule: the committed golden is the truth the eval compares).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type ManifestEntry, parseManifest, REPO_ROOT, SYNTHETIC_DIR } from "./corpus";
import { SYNTHETIC_SPECS, syntheticSpecOf } from "./specs";
import { buildSynthetic, type SyntheticArtifact, type SyntheticSpec } from "./synthetic";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

export const HELP = `Usage:
  pnpm corpus:synthetic
  pnpm corpus:synthetic --check
  pnpm corpus:synthetic --help

Writes the two artefacts of every specification in
packages/eval/src/specs.ts (E1-T07, ADR-013):

  corpus/public/synthetic/<id>.pdf    generated, never committed
  corpus/golden/<id>.golden.json      committed

and verifies each specification against its corpus/manifest.yaml entry
(generated, sha256, pages, level, lang, features and golden file).

  --check   verify only: write nothing, fail when a file or the manifest
            disagrees with the specification (useful in CI)

Exit codes:
  0  success (everything written or verified)
  1  a specification, a file or the manifest disagree
  2  usage error
`;

export interface SyntheticIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

export interface SyntheticOptions {
  repoRoot?: string;
  /** Verify only: never write (CLI flag `--check`). */
  check?: boolean;
  out?: (text: string) => void;
  err?: (text: string) => void;
}

export interface SyntheticResult {
  code: number;
  /** Ids whose artefacts were written (empty in `--check` mode). */
  written: string[];
  /** Ids whose artefacts and manifest entry were verified. */
  checked: string[];
  warnings: string[];
}

/** Manifest problems of one specification; empty means the entry agrees. */
export function manifestMismatches(
  entry: ManifestEntry,
  spec: SyntheticSpec,
  artifact: SyntheticArtifact,
): string[] {
  const problems: string[] = [];
  if (!entry.generated) problems.push("generated: true is missing");
  if (entry.sha256 !== artifact.sha256) {
    problems.push(
      `sha256 is ${entry.sha256 ?? "null"}, the specification builds ${artifact.sha256}`,
    );
  }
  if (entry.pages !== spec.pages) {
    problems.push(`pages is ${String(entry.pages)}, the specification has ${spec.pages}`);
  }
  if (entry.level !== spec.level) {
    problems.push(`level is ${String(entry.level)}, the specification has ${spec.level}`);
  }
  if (entry.lang !== spec.lang) {
    problems.push(`lang is ${String(entry.lang)}, the specification has ${spec.lang}`);
  }
  const expectedGolden = `${spec.id}.golden.json`;
  if (entry.golden !== expectedGolden) {
    problems.push(`golden is ${String(entry.golden)}, expected ${expectedGolden}`);
  }
  const expectedFeatures = [...spec.features].sort();
  const actualFeatures = [...entry.features].sort();
  if (expectedFeatures.join(",") !== actualFeatures.join(",")) {
    problems.push(
      `features are [${entry.features.join(", ")}], the specification has ` +
        `[${spec.features.join(", ")}]`,
    );
  }
  return problems;
}

export async function runSynthetic(options: SyntheticOptions = {}): Promise<SyntheticResult> {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const check = options.check === true;
  const out = options.out ?? ((text: string) => void process.stdout.write(text));
  const err = options.err ?? ((text: string) => void process.stderr.write(text));
  const warnings: string[] = [];
  const written: string[] = [];
  const checked: string[] = [];
  const problems: string[] = [];

  let entries: ManifestEntry[];
  try {
    entries = parseManifest(
      await readFile(path.join(repoRoot, "corpus", "manifest.yaml"), "utf8"),
      "corpus/manifest.yaml",
    );
  } catch (error) {
    err(`synthetic: ${error instanceof Error ? error.message : String(error)}\n`);
    return { code: EXIT_ERROR, written, checked, warnings };
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

  for (const spec of SYNTHETIC_SPECS) {
    let artifact: SyntheticArtifact;
    try {
      artifact = buildSynthetic(spec);
    } catch (error) {
      problems.push(`${spec.id}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const entry = byId.get(spec.id);
    if (!entry) {
      problems.push(
        `${spec.id}: corpus/manifest.yaml has no entry for it — add:\n` +
          `    - id: ${spec.id}\n` +
          `      level: ${spec.level}\n` +
          `      lang: ${spec.lang}\n` +
          `      title: "${spec.title}"\n` +
          `      generated: true\n` +
          `      pages: ${spec.pages}\n` +
          `      sha256: "${artifact.sha256}"\n` +
          `      features: [${spec.features.join(", ")}]\n` +
          `      golden: ${spec.id}.golden.json\n` +
          "      visibility: public",
      );
    } else {
      for (const problem of manifestMismatches(entry, spec, artifact)) {
        problems.push(`${spec.id}: corpus/manifest.yaml: ${problem}`);
      }
    }

    const goldenFile = path.join(repoRoot, "corpus", "golden", `${spec.id}.golden.json`);
    const pdfFile = path.join(repoRoot, "corpus", "public", SYNTHETIC_DIR, `${spec.id}.pdf`);
    const targets: { file: string; content: string | Uint8Array; kind: "golden" | "pdf" }[] = [
      { file: goldenFile, content: artifact.goldenJson, kind: "golden" },
      { file: pdfFile, content: artifact.pdf, kind: "pdf" },
    ];
    for (const target of targets) {
      const status = await writeIfChanged(target.file, target.content, check);
      if (status === "missing") {
        problems.push(`${spec.id}: ${path.relative(repoRoot, target.file)} is out of date`);
      } else if (status === "written") {
        out(`synthetic: wrote ${path.relative(repoRoot, target.file)}\n`);
      }
    }
    if (!check) written.push(spec.id);
    checked.push(spec.id);
  }

  // A `generated: true` entry whose specification disappeared is dead weight.
  for (const entry of entries) {
    if (!entry.generated) continue;
    if (!syntheticSpecOf(entry.id)) {
      problems.push(
        `${entry.id}: corpus/manifest.yaml says generated: true but packages/eval/src/` +
          "specs.ts has no such specification",
      );
    }
  }

  for (const warning of warnings) err(`synthetic: warning: ${warning}\n`);
  if (problems.length > 0) {
    for (const problem of problems) err(`synthetic: ${problem}\n`);
    return { code: EXIT_ERROR, written, checked, warnings };
  }

  const mode = check ? "verified" : "generated";
  out(`synthetic: ${checked.length} specifications ${mode}\n`);
  return { code: EXIT_OK, written, checked, warnings };
}

type WriteStatus = "written" | "unchanged" | "missing";

/**
 * Writes `content` only when it differs (or would differ). Returns
 * `missing` in `--check` mode when the file on disk is not the current build.
 */
async function writeIfChanged(
  file: string,
  content: string | Uint8Array,
  check: boolean,
): Promise<WriteStatus> {
  const current = await readFile(file).catch(() => null);
  const matches =
    current !== null &&
    (typeof content === "string"
      ? current.toString("utf8") === content
      : current.equals(Buffer.from(content)));
  if (matches) return "unchanged";
  if (check) return "missing";
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  return "written";
}

export async function runSyntheticCli(argv: readonly string[], io: SyntheticIo): Promise<number> {
  let check = false;
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help" || arg === "help") {
      io.out(HELP);
      return EXIT_OK;
    }
    if (arg === "--check") {
      check = true;
      continue;
    }
    io.err(`synthetic: unknown option: ${arg}\n\n${HELP}`);
    return EXIT_USAGE;
  }
  const result = await runSynthetic({ check, out: io.out, err: io.err });
  return result.code;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const entryPath = path.resolve(entry);
  const modulePath = fileURLToPath(import.meta.url);
  return process.platform === "win32"
    ? entryPath.toLowerCase() === modulePath.toLowerCase()
    : entryPath === modulePath;
}

if (isDirectExecution()) {
  process.exitCode = await runSyntheticCli(process.argv.slice(2), {
    out: (text) => void process.stdout.write(text),
    err: (text) => void process.stderr.write(text),
  });
}
