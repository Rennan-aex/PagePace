// Corpus manifests and `CORPUS_PRIVATE_DIR` resolution shared by
// `pnpm corpus:fetch` (E1-T05) and the evaluation runner (E1-T06).
// Single source of truth decided in ADR-031.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root derived from this file (`<root>/packages/eval/src`). */
export const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

/** Where the private corpus directory came from (ADR-031). */
export type PrivateDirSource = "environment" | ".env";

export class CorpusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorpusError";
  }
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

/** Minimal `KEY=VALUE` reader for the repository `.env` (no dependency, ADR-031). */
export function parseDotEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separator = withoutExport.indexOf("=");
    if (separator < 1) continue;
    const key = withoutExport.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    values[key] = stripQuotes(withoutExport.slice(separator + 1).trim());
  }
  return values;
}

export interface ResolveOptions {
  /** Pass `{}` in tests to ignore the ambient process environment. */
  env?: Record<string, string | undefined>;
  repoRoot?: string;
}

export interface PrivateDirResolution {
  dir: string | null;
  source: PrivateDirSource | null;
}

/** Environment variable > repository `.env` > none (ADR-031). */
export function resolveCorpusPrivateDirDetailed(
  options: ResolveOptions = {},
): PrivateDirResolution {
  const env = options.env ?? process.env;
  const fromEnv = env.CORPUS_PRIVATE_DIR?.trim();
  if (fromEnv) return { dir: stripQuotes(fromEnv), source: "environment" };

  const dotEnvPath = path.join(options.repoRoot ?? REPO_ROOT, ".env");
  if (!existsSync(dotEnvPath)) return { dir: null, source: null };
  const fromDotEnv = parseDotEnv(readFileSync(dotEnvPath, "utf8")).CORPUS_PRIVATE_DIR?.trim();
  if (fromDotEnv) return { dir: fromDotEnv, source: ".env" };
  return { dir: null, source: null };
}

/** Convenience wrapper: only the resolved directory (ADR-031). */
export function resolveCorpusPrivateDir(options: ResolveOptions = {}): string | null {
  return resolveCorpusPrivateDirDetailed(options).dir;
}

export interface ManifestEntry {
  id: string;
  /** 1-based line where the entry starts, for error messages. */
  line: number;
  level: string | null;
  lang: string | null;
  title: string | null;
  sourceUrl: string | null;
  /** Extra download URLs tried in order when `sourceUrl` failed (ADR-031). */
  fallbackUrls: string[];
  pageUrl: string | null;
  license: string | null;
  licenseUrl: string | null;
  verifiedOn: string | null;
  pages: number | null;
  sha256: string | null;
  features: string[];
  golden: string | null;
  visibility: string | null;
  /** File name relative to `$CORPUS_PRIVATE_DIR` (ADR-014); private manifests only. */
  file: string | null;
}

export interface CorpusEntry extends ManifestEntry {
  /** Absolute path of the PDF on this machine. */
  path: string;
}

export interface LoadedCorpus {
  publicDir: string;
  privateDir: string | null;
  privateDirSource: PrivateDirSource | null;
  publicEntries: CorpusEntry[];
  privateEntries: CorpusEntry[];
  /** Public entries first, then private. */
  entries: CorpusEntry[];
}

const ENTRY_PATTERN = /^ {2}- id:\s*(.*)$/;
const ENTRY_START_PATTERN = /^ {2}-/;
const FIELD_PATTERN = /^ {4}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const STRING_FIELDS = [
  "level",
  "lang",
  "title",
  "source_url",
  "page_url",
  "license",
  "license_url",
  "verified_on",
  "golden",
  "visibility",
  "file",
  "sha256",
];
const KNOWN_FIELDS = new Set(["id", "pages", "features", "fallback_urls", ...STRING_FIELDS]);
const HTTP_URL_PATTERN = /^https?:\/\/\S+$/;

interface RawField {
  key: string;
  value: unknown;
  line: number;
}

function unescapeQuoted(text: string): string {
  return text.replace(/\\(.)/g, "$1");
}

function parseScalar(raw: string): string | number | null | string[] {
  const value = raw.trim();
  if (value === "null") return null;
  if (value === "") return "";
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((item) => stripQuotes(item.trim()));
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return unescapeQuoted(value.slice(1, -1));
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function readField(fields: ReadonlyMap<string, RawField>, key: string): unknown {
  return fields.get(key)?.value ?? null;
}

function asString(value: unknown, key: string, source: string, line: number): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  throw new CorpusError(`${source}:${line}: field "${key}" must be a string`);
}

function asNumber(value: unknown, key: string, source: string, line: number): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  throw new CorpusError(`${source}:${line}: field "${key}" must be an integer`);
}

function asStringList(value: unknown, key: string, source: string, line: number): string[] {
  if (value === null) return [];
  if (Array.isArray(value)) return value.map((item) => String(item));
  throw new CorpusError(`${source}:${line}: field "${key}" must be a list like [a, b]`);
}

function toEntry(rawFields: readonly RawField[], source: string, entryLine: number): ManifestEntry {
  const fields = new Map<string, RawField>();
  for (const field of rawFields) {
    if (!KNOWN_FIELDS.has(field.key)) {
      throw new CorpusError(`${source}:${field.line}: unknown field "${field.key}"`);
    }
    if (fields.has(field.key)) {
      throw new CorpusError(`${source}:${field.line}: duplicate field "${field.key}"`);
    }
    fields.set(field.key, field);
  }

  const idField = fields.get("id");
  const id = asString(idField?.value ?? null, "id", source, idField?.line ?? entryLine);
  if (!id || id.trim() === "") {
    throw new CorpusError(`${source}:${entryLine}: entry has an empty id`);
  }
  if (!ID_PATTERN.test(id)) {
    throw new CorpusError(`${source}:${entryLine}: invalid id "${id}"`);
  }

  const fallbackLine = fields.get("fallback_urls")?.line ?? entryLine;
  const fallbackUrls = asStringList(
    readField(fields, "fallback_urls"),
    "fallback_urls",
    source,
    fallbackLine,
  );
  for (const url of fallbackUrls) {
    if (!HTTP_URL_PATTERN.test(url)) {
      throw new CorpusError(`${source}:${fallbackLine}: fallback_urls must be http(s) URLs`);
    }
  }

  const shaLine = fields.get("sha256")?.line ?? entryLine;
  const sha256 = asString(readField(fields, "sha256"), "sha256", source, shaLine);
  if (sha256 !== null && !SHA256_PATTERN.test(sha256)) {
    throw new CorpusError(
      `${source}:${shaLine}: field "sha256" must be 64 lowercase hex characters`,
    );
  }

  return {
    id,
    line: entryLine,
    level: asString(readField(fields, "level"), "level", source, entryLine),
    lang: asString(readField(fields, "lang"), "lang", source, entryLine),
    title: asString(readField(fields, "title"), "title", source, entryLine),
    sourceUrl: asString(readField(fields, "source_url"), "source_url", source, entryLine),
    fallbackUrls,
    pageUrl: asString(readField(fields, "page_url"), "page_url", source, entryLine),
    license: asString(readField(fields, "license"), "license", source, entryLine),
    licenseUrl: asString(readField(fields, "license_url"), "license_url", source, entryLine),
    verifiedOn: asString(readField(fields, "verified_on"), "verified_on", source, entryLine),
    pages: asNumber(readField(fields, "pages"), "pages", source, entryLine),
    sha256,
    features: asStringList(readField(fields, "features"), "features", source, entryLine),
    golden: asString(readField(fields, "golden"), "golden", source, entryLine),
    visibility: asString(readField(fields, "visibility"), "visibility", source, entryLine),
    file: asString(readField(fields, "file"), "file", source, entryLine),
  };
}

/**
 * Reads one corpus manifest.
 *
 * Documented shape (`corpus/manifest.yaml`):
 *   - an entry starts at column 0+2 with `  - id: <id>`;
 *   - fields are indented by 4 spaces: `    key: value`;
 *   - anything else at column 0 (`version:`, `documents:`, headers, prose) is
 *     ignored; an indented line that is neither comment nor field is an error
 *     carrying its line number.
 */
export function parseManifest(text: string, source: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  const seenIds = new Set<string>();
  let entryLine = 0;
  let rawFields: RawField[] | null = null;

  const flush = (): void => {
    if (!rawFields) return;
    const entry = toEntry(rawFields, source, entryLine);
    if (seenIds.has(entry.id)) {
      throw new CorpusError(`${source}:${entryLine}: duplicate id "${entry.id}"`);
    }
    seenIds.add(entry.id);
    entries.push(entry);
    rawFields = null;
  };

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index] ?? "";
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    if (!/^\s/.test(rawLine)) {
      flush();
      if (rawLine.startsWith("-")) {
        throw new CorpusError(
          `${source}:${lineNumber}: entries must start with "  - id: " (indent with 2 spaces)`,
        );
      }
      continue;
    }

    const entryMatch = ENTRY_PATTERN.exec(rawLine);
    if (entryMatch) {
      flush();
      entryLine = lineNumber;
      rawFields = [{ key: "id", value: parseScalar(entryMatch[1] ?? ""), line: lineNumber }];
      continue;
    }
    if (ENTRY_START_PATTERN.test(rawLine)) {
      throw new CorpusError(`${source}:${lineNumber}: entries must start with "  - id: "`);
    }

    const fieldMatch = FIELD_PATTERN.exec(rawLine);
    if (fieldMatch) {
      const key = fieldMatch[1];
      if (!rawFields) {
        throw new CorpusError(
          `${source}:${lineNumber}: field "${key}" appears before any "  - id: " entry`,
        );
      }
      rawFields.push({ key: key ?? "", value: parseScalar(fieldMatch[2] ?? ""), line: lineNumber });
      continue;
    }

    throw new CorpusError(`${source}:${lineNumber}: cannot parse line: ${trimmed}`);
  }
  flush();

  return entries;
}

function readManifest(file: string, source: string): ManifestEntry[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new CorpusError(`${source}: file not found`);
    throw error;
  }

  const entries = parseManifest(text, source);
  for (const entry of entries) {
    if (entry.sha256 === null) {
      throw new CorpusError(`${source}:${entry.line}: entry "${entry.id}" has no sha256`);
    }
  }
  return entries;
}

function isInside(dir: string, file: string): boolean {
  const resolvedDir = path.resolve(dir);
  const resolvedFile = path.resolve(resolvedDir, file);
  return resolvedFile === resolvedDir || resolvedFile.startsWith(`${resolvedDir}${path.sep}`);
}

export interface LoadCorpusOptions extends ResolveOptions {
  publicDir?: string;
}

/**
 * Merges the public manifest with the private one (ADR-031).
 *
 * Public entries resolve to `<repo>/corpus/public/<id>.pdf`; private entries
 * must declare `file` and resolve to `$CORPUS_PRIVATE_DIR/<file>`. A repeated
 * id â€” inside one manifest or across the two â€” is an error.
 */
export function loadCorpus(options: LoadCorpusOptions = {}): LoadedCorpus {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const publicDir = options.publicDir ?? path.join(repoRoot, "corpus", "public");
  const publicSource = "corpus/manifest.yaml";
  const publicEntries = readManifest(
    path.join(repoRoot, "corpus", "manifest.yaml"),
    publicSource,
  ).map((entry) => ({ ...entry, path: path.join(publicDir, `${entry.id}.pdf`) }));

  const { dir: privateDir, source: privateDirSource } = resolveCorpusPrivateDirDetailed(options);
  const privateEntries: CorpusEntry[] = [];
  if (privateDir) {
    const privateSource = path.join(privateDir, "manifest.yaml");
    for (const entry of readManifest(privateSource, privateSource)) {
      if (!entry.file) {
        throw new CorpusError(
          `${privateSource}:${entry.line}: private entry "${entry.id}" has no file`,
        );
      }
      if (!isInside(privateDir, entry.file)) {
        throw new CorpusError(
          `${privateSource}:${entry.line}: file "${entry.file}" must stay inside CORPUS_PRIVATE_DIR`,
        );
      }
      privateEntries.push({ ...entry, path: path.join(privateDir, entry.file) });
    }
  }

  const ids = new Set<string>();
  for (const entry of [...publicEntries, ...privateEntries]) {
    if (ids.has(entry.id)) throw new CorpusError(`duplicate corpus id "${entry.id}"`);
    ids.add(entry.id);
  }

  return {
    publicDir,
    privateDir,
    privateDirSource,
    publicEntries,
    privateEntries,
    entries: [...publicEntries, ...privateEntries],
  };
}
