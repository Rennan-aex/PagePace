// `pnpm check:no-pdf` — the repository must never track a PDF (AGENTS.md,
// rule 1), with exactly one exception: the byte-exact copies of the two SciELO
// articles in `corpus/vendored/`, which used to live in the `corpus-public-v1`
// release (chore-corpus-vendor-pdfs). The exception is matched by repository
// path **and** verified against the SHA-256 recorded in `corpus/manifest.yaml`,
// so any other PDF — or a vendored PDF whose bytes drifted — fails the check.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type CorpusEntry, loadCorpus, REPO_ROOT } from "./corpus";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;

/** Every allowlisted file must live under this prefix; nothing else is exempt. */
export const VENDORED_PREFIX = "corpus/vendored/";

export interface AllowlistedPdf {
  /** Repository-relative path, exactly as it appears in `git ls-files`. */
  path: string;
  /** Digest the manifest promises for those bytes. */
  sha256: string;
}

export interface PdfAuditInput {
  /** Repository-relative paths of the tracked PDFs (case-insensitive `.pdf`). */
  trackedPdfs: readonly string[];
  /** The only PDFs the manifest allows inside git, with their digests. */
  allowlist: readonly AllowlistedPdf[];
  /** Directory the paths are read from; defaults to the repository root. */
  root?: string;
}

export interface PdfAuditResult {
  ok: boolean;
  /** One line per violation; empty when `ok`. */
  errors: string[];
}

function sha256File(absolutePath: string): string {
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

/**
 * Pure audit of `git ls-files` against the manifest allowlist: every tracked
 * PDF must be allowlisted (path inside `corpus/vendored/`) and must hash to
 * the recorded digest; every allowlisted PDF must be tracked.
 */
export function auditTrackedPdfs(input: PdfAuditInput): PdfAuditResult {
  const root = input.root ?? REPO_ROOT;
  const errors: string[] = [];
  const tracked = new Set(input.trackedPdfs);
  const allowlisted = new Set<string>();

  for (const file of input.allowlist) {
    if (allowlisted.has(file.path)) {
      errors.push(`duplicate allowlist path: ${file.path}`);
      continue;
    }
    allowlisted.add(file.path);
    const normalized = file.path.split("\\").join("/");
    if (
      normalized.startsWith("../") ||
      normalized.startsWith("/") ||
      !normalized.startsWith(VENDORED_PREFIX)
    ) {
      errors.push(`allowlist path outside ${VENDORED_PREFIX}: ${file.path}`);
      continue;
    }
    if (!tracked.has(file.path)) {
      errors.push(`allowlisted but not tracked by git: ${file.path}`);
      continue;
    }
    let actual: string;
    try {
      actual = sha256File(path.join(root, file.path));
    } catch {
      errors.push(`allowlisted file cannot be read: ${file.path}`);
      continue;
    }
    if (actual !== file.sha256) {
      errors.push(
        `bytes drifted from corpus/manifest.yaml: ${file.path}\n` +
          `  expected: ${file.sha256}\n` +
          `  actual:   ${actual}`,
      );
    }
  }

  for (const pdf of input.trackedPdfs) {
    if (!allowlisted.has(pdf)) errors.push(`tracked by git: ${pdf}`);
  }

  return { ok: errors.length === 0, errors };
}

/** Allowlist straight from the public manifest (`vendored:` entries). */
export function allowlistFrom(entries: readonly CorpusEntry[]): AllowlistedPdf[] {
  const allowlist: AllowlistedPdf[] = [];
  for (const entry of entries) {
    if (!entry.vendored) continue;
    allowlist.push({ path: entry.vendored, sha256: entry.sha256 ?? "" });
  }
  return allowlist;
}

function trackedPdfs(root: string): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output
    .split("\0")
    .filter((file) => file !== "" && /\.pdf$/i.test(file))
    .sort();
}

function runCheck(root: string): number {
  const result = auditTrackedPdfs({
    trackedPdfs: trackedPdfs(root),
    allowlist: allowlistFrom(loadCorpus({ repoRoot: root }).publicEntries),
    root,
  });
  if (!result.ok) {
    process.stderr.write(
      "ERROR: PDF files are tracked by git (only corpus/vendored/ copies are exempt):\n" +
        `${result.errors.map((error) => `  ${error}`).join("\n")}\n` +
        "Remove them (git rm --cached) or keep them in corpus/public (ignored).\n",
    );
    return EXIT_ERROR;
  }
  process.stdout.write("OK: no PDFs tracked outside corpus/vendored/.\n");
  return EXIT_OK;
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
  process.exitCode = runCheck(REPO_ROOT);
}
