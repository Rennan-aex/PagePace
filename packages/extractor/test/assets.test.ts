import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const script = path.join(repoRoot, "scripts", "copy-pdfjs-assets.mjs");
const pdfjsRoot = path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

async function allFiles(dir: string, base = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await allFiles(path.join(dir, entry.name), relative)));
    else files.push(relative);
  }
  return files.sort();
}

describe("copy-pdfjs-assets (ADR-020)", () => {
  it("copies the Foxit fonts, CMaps and WASM, and never the Liberation TTFs", async () => {
    const destination = await mkdtemp(path.join(tmpdir(), "pagepace-assets-"));
    try {
      const { stdout } = await execFileAsync(process.execPath, [
        script,
        "--from",
        pdfjsRoot,
        "--to",
        destination,
      ]);
      const reported = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("copied "));

      const copied = await allFiles(destination);
      expect(reported.length).toBe(copied.length);
      expect(copied.filter((file) => file.endsWith(".pfb")).length).toBeGreaterThanOrEqual(10);
      expect(copied).toContain("standard_fonts/LICENSE_FOXIT");
      expect(copied.some((file) => file.endsWith(".bcmap"))).toBe(true);
      expect(copied.some((file) => file.endsWith(".wasm"))).toBe(true);

      expect(copied.filter((file) => file.endsWith(".ttf"))).toEqual([]);
      expect(copied.filter((file) => file.toLowerCase().includes("liberation"))).toEqual([]);
      expect(copied.filter((file) => file.endsWith(".afm"))).toEqual([]);
    } finally {
      await rm(destination, { recursive: true, force: true });
    }
  }, 60_000);

  it("reports the same rule the report tests assert (no GPL file can slip through)", () => {
    const source = readFileSync(script, "utf8");

    expect(source).toContain("LICENSE_LIBERATION");
    expect(source).toContain("LiberationSans*.ttf");
    expect(existsSync(path.join(pdfjsRoot, "standard_fonts", "LiberationSans-Regular.ttf"))).toBe(
      true,
    );
    expect(
      readdirSync(path.join(pdfjsRoot, "standard_fonts")).filter((name) => name.endsWith(".ttf")),
    ).toHaveLength(4);
  });
});
