import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { allowlistFrom, auditTrackedPdfs, VENDORED_PREFIX } from "./check-no-pdf";
import { loadCorpus, REPO_ROOT } from "./corpus";

/**
 * `pnpm check:no-pdf` (chore-corpus-vendor-pdfs): the repository tracks no PDF
 * except the two SciELO copies in `corpus/vendored/`, each one pinned by path
 * and SHA-256. Everything runs offline against the real manifest.
 */

const sha = (seed: string): string => createHash("sha256").update(seed).digest("hex");

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "pagepace-check-no-pdf-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const REAL_ALLOWLIST = allowlistFrom(loadCorpus({ repoRoot: REPO_ROOT }).publicEntries);

describe("auditTrackedPdfs", () => {
  it("accepts exactly the two SciELO copies named by the manifest", () => {
    expect(REAL_ALLOWLIST.map((file) => file.path)).toEqual([
      "corpus/vendored/n3-pt-scielo-wittgenstein.pdf",
      "corpus/vendored/n3-en-scielo-climatejustice.pdf",
    ]);
    for (const file of REAL_ALLOWLIST) {
      expect(file.path.startsWith(VENDORED_PREFIX)).toBe(true);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    }

    const result = auditTrackedPdfs({
      trackedPdfs: REAL_ALLOWLIST.map((file) => file.path),
      allowlist: REAL_ALLOWLIST,
    });

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("fails on a third PDF while the two vendored copies stay exempt", () => {
    const third = "docs/fixture-from-the-release.pdf";

    const result = auditTrackedPdfs({
      trackedPdfs: [...REAL_ALLOWLIST.map((file) => file.path), third],
      allowlist: REAL_ALLOWLIST,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([`tracked by git: ${third}`]);
    expect(result.errors.join("\n")).not.toContain(VENDORED_PREFIX);
  });

  it("fails when the bytes of a vendored copy no longer match the manifest", async () => {
    const root = await tempDir();
    const file = `${VENDORED_PREFIX}drifted.pdf`;
    await mkdir(path.join(root, "corpus", "vendored"), { recursive: true });
    await writeFile(path.join(root, file), "not the bytes the manifest promises");

    const result = auditTrackedPdfs({
      trackedPdfs: [file],
      allowlist: [{ path: file, sha256: sha("manifest promise") }],
      root,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("bytes drifted from corpus/manifest.yaml");
    expect(result.errors[0]).toContain(sha("manifest promise"));
  });

  it("rejects an allowlist path outside corpus/vendored/", () => {
    const file = "docs/hidden.pdf";

    const result = auditTrackedPdfs({
      trackedPdfs: [file],
      allowlist: [{ path: file, sha256: sha("hidden") }],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([`allowlist path outside ${VENDORED_PREFIX}: ${file}`]);
  });

  it("fails when an allowlisted copy is not tracked by git", () => {
    const file = `${VENDORED_PREFIX}n3-pt-scielo-wittgenstein.pdf`;

    const result = auditTrackedPdfs({
      trackedPdfs: [],
      allowlist: [{ path: file, sha256: sha("vendored") }],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([`allowlisted but not tracked by git: ${file}`]);
  });
});
