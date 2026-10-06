// `pnpm corpus:fetch` — downloads the public corpus, verifies every SHA-256
// digest and merges the private manifest (ADR-031, ADR-032, ADR-034).
// Entries marked `generated: true` are built from their specification instead
// of downloaded (ADR-037, E1-T07).
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CorpusError,
  type LoadedCorpus,
  loadCorpus,
  type ManifestEntry,
  REPO_ROOT,
  SYNTHETIC_DIR,
} from "./corpus";
import { syntheticSpecOf } from "./specs";
import { buildSynthetic } from "./synthetic";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

// CDN bot shields (BunnyCDN in front of SciELO) reject clients that do not
// look like a browser, so the request carries browser-shaped headers while
// still identifying the tool at the end of the user agent (ADR-031).
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36 PagePace-CorpusFetch/1.0 " +
  "(+https://github.com/Rennan-aex/PagePace)";
export const ACCEPT_HEADER =
  "application/pdf,application/octet-stream;q=0.9,text/html;q=0.8,*/*;q=0.5";
export const ACCEPT_LANGUAGE_HEADER = "en-US,en;q=0.9,pt;q=0.8";

/**
 * ADR-034: sources blocked to the runner (SciELO answers 403 to data-centre
 * IPs) are mirrored in a release of this repository, and CI hands the
 * automatic `GITHUB_TOKEN` to this script. The token is attached **only** to
 * GitHub hosts, so it can never reach arxiv.org, scielo.br or any other site.
 *
 * Measured on 2026-10-06: `github.com/.../releases/download/...` answers 404
 * even with a valid token, while `api.github.com/.../releases/assets/<id>`
 * answers 302 with the bytes - and only when `Accept` is exactly
 * `application/octet-stream` (any other value returns the asset metadata).
 */
export function githubRequestHeaders(
  url: string,
  token: string | undefined,
): Record<string, string> {
  if (!token) return {};
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return {};
  }
  const isGithub =
    host === "github.com" ||
    host.endsWith(".github.com") ||
    host.endsWith(".githubusercontent.com");
  if (!isGithub) return {};
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (host === "api.github.com") headers.accept = "application/octet-stream";
  return headers;
}
/** ADR-032 rule 2: three attempts with a growing wait (1 s, then 2 s). */
export const DEFAULT_RETRY_WAITS_MS: readonly number[] = [1000, 2000];
export const DEFAULT_TIMEOUT_MS = 30_000;

export const HELP = `Usage:
  pnpm corpus:fetch
  pnpm corpus:fetch --help

Downloads the public PDFs listed in corpus/manifest.yaml into corpus/public/,
verifies each SHA-256 digest and merges the private manifest located through
CORPUS_PRIVATE_DIR (environment variable, then the .env file at the repo root).

Behaviour:
  - a file that already matches its digest is reused without any request;
  - an entry with "generated: true" is built from its specification in
    packages/eval/src/specs.ts into corpus/public/synthetic/ (never fetched),
    and its digest must match the manifest (ADR-037);
  - network errors, HTTP 5xx, HTTP 429 and HTTP 403 are retried 3 times (1 s, 2 s);
  - when the manifest lists fallback_urls they are tried in order, after the
    retries of the previous URL are exhausted;
  - when GITHUB_TOKEN is set (CI) a GitHub release URL is downloaded with it;
    the token is only ever sent to github.com hosts, never to other sites;
  - any other HTTP error, and a digest that no URL reproduces, end with exit 1;
  - without a private corpus source the script warns once and still exits 0.

Exit codes:
  0  success (public corpus verified; the private corpus is optional)
  1  download failed, or a digest did not match the manifest
  2  usage error
`;

export interface FetchIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

export interface FetchOptions {
  repoRoot?: string;
  /** Pass `{}` in tests to ignore the ambient process environment. */
  env?: Record<string, string | undefined>;
  out?: (text: string) => void;
  err?: (text: string) => void;
  /** Waits applied before the 2nd and 3rd attempt (ADR-032). Tests pass zeros. */
  retryWaitsMs?: readonly number[];
  timeoutMs?: number;
}

export interface FetchResult {
  code: number;
  corpus: LoadedCorpus | null;
  downloaded: string[];
  /** `generated: true` entries built from their specification (ADR-037). */
  generated: string[];
  reused: string[];
  warnings: string[];
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(file: string): Promise<string> {
  return sha256Hex(await readFile(file));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface UrlParams {
  id: string;
  url: string;
  referer: string | null;
  target: string;
  expected: string;
  out: (text: string) => void;
  retryWaitsMs: readonly number[];
  timeoutMs: number;
  /** Cookies seen so far, echoed back on the next attempt (CDN shields). */
  jar: Map<string, string>;
  /** ADR-034: sent only when the URL host belongs to GitHub. */
  githubToken: string | undefined;
}

interface DownloadParams extends Omit<UrlParams, "url" | "jar"> {
  /** `source_url` first, then `fallback_urls`, in manifest order. */
  urls: readonly string[];
}

type DownloadOutcome = { ok: true; bytes: number } | { ok: false; message: string };

/**
 * Only these statuses are worth another attempt (ADR-032 rule 2, amended in
 * ADR-031: a bot shield answers 403 until the client retries with its cookie).
 */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 403;
}

function absorbCookies(headers: Headers, jar: Map<string, string>): void {
  const lines =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie") as string]
        : [];
  for (const line of lines) {
    const pair = line.split(";")[0]?.trim();
    const name = pair?.split("=")[0]?.trim();
    if (name && pair) jar.set(name, pair);
  }
}

/** Tries one URL, applying the retry policy of ADR-032 rule 2. */
async function tryUrl(params: UrlParams): Promise<DownloadOutcome> {
  const { id, url, referer, target, expected, out, retryWaitsMs, timeoutMs, jar, githubToken } =
    params;
  const attempts = retryWaitsMs.length + 1;
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: ACCEPT_HEADER,
    "accept-language": ACCEPT_LANGUAGE_HEADER,
    ...githubRequestHeaders(url, githubToken),
  };
  if (referer) headers.referer = referer;
  let attemptsMade = 0;
  let lastFailure = "unknown error";

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const wait = retryWaitsMs[attempt - 1] ?? 0;
      if (wait > 0) await sleep(wait);
      out(`corpus: retrying ${id} (attempt ${attempt + 1} of ${attempts})\n`);
    }
    attemptsMade++;
    try {
      if (jar.size > 0) headers.cookie = [...jar.values()].join("; ");
      const response = await fetch(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      absorbCookies(response.headers, jar);

      if (!response.ok) {
        lastFailure = `HTTP ${response.status}`;
        if (isRetryableStatus(response.status)) continue;
        break;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      const tempPath = `${target}.tmp`;
      await writeFile(tempPath, bytes);
      const digest = await sha256File(tempPath);
      if (digest !== expected) {
        await rm(tempPath, { force: true });
        return {
          ok: false,
          message: `digest mismatch for ${id}\n  expected: ${expected}\n  actual:   ${digest}`,
        };
      }
      await rename(tempPath, target);
      return { ok: true, bytes: bytes.byteLength };
    } catch (error) {
      lastFailure = messageOf(error);
    }
  }

  return { ok: false, message: `after ${attemptsMade} attempt(s): ${lastFailure}` };
}

/**
 * Walks `urls` in order and stops at the first one that returns bytes matching
 * the manifest digest. Every URL gets its own three attempts (ADR-032 rule 2).
 */
async function download(params: DownloadParams): Promise<DownloadOutcome> {
  const { id, urls, referer, target, expected, out, retryWaitsMs, timeoutMs, githubToken } = params;
  const jar = new Map<string, string>();
  const failures: string[] = [];

  for (let index = 0; index < urls.length; index++) {
    const url = urls[index] ?? "";
    if (index > 0) out(`corpus: ${id}: trying fallback URL ${url}\n`);
    const outcome = await tryUrl({
      id,
      url,
      referer,
      target,
      expected,
      out,
      retryWaitsMs,
      timeoutMs,
      jar,
      githubToken,
    });
    if (outcome.ok) return outcome;
    failures.push(`${url}: ${outcome.message}`);
  }

  if (urls.length === 1 && failures[0]) {
    return { ok: false, message: `failed to download ${id} from ${urls[0]} ${failures[0]}` };
  }
  return {
    ok: false,
    message: `failed to download ${id}:\n  ${failures.join("\n  ")}`,
  };
}

type GenerateOutcome = { ok: true; bytes: number } | { ok: false; message: string };

/**
 * Builds a `generated: true` entry from its specification (ADR-037).
 *
 * The digest of the freshly built bytes must equal the manifest digest: a
 * mismatch means `packages/eval/src/specs.ts` and `corpus/manifest.yaml`
 * drifted apart, which is an error and never a silent re-hash.
 */
async function generate(entry: ManifestEntry, target: string): Promise<GenerateOutcome> {
  const spec = syntheticSpecOf(entry.id);
  if (!spec) {
    return {
      ok: false,
      message:
        `${entry.id} is marked generated but has no specification in ` +
        "packages/eval/src/specs.ts",
    };
  }
  const artifact = buildSynthetic(spec);
  if (entry.sha256 !== null && artifact.sha256 !== entry.sha256) {
    return {
      ok: false,
      message:
        `digest mismatch for ${entry.id}\n` +
        `  manifest: ${entry.sha256}\n` +
        `  spec:     ${artifact.sha256}\n` +
        "  the specification and corpus/manifest.yaml disagree: run `pnpm corpus:synthetic` " +
        "and update the manifest entry",
    };
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, artifact.pdf);
  return { ok: true, bytes: artifact.pdf.length };
}

function warnOrphans(
  dir: string,
  knownNames: ReadonlySet<string>,
  warn: (message: string) => void,
): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (!name.toLowerCase().endsWith(".pdf")) continue;
    if (!knownNames.has(name)) warn(`PDF without a manifest entry: ${path.join(dir, name)}`);
  }
}

/**
 * Runs the fetch and returns the exit code plus what happened.
 *
 * Nothing here touches the network when every public file is already present
 * and verified (ADR-032 rule 1), and a missing private corpus source is a
 * single warning, never a failure (ADR-031).
 */
export async function runFetch(options: FetchOptions = {}): Promise<FetchResult> {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const out = options.out ?? ((text: string) => void process.stdout.write(text));
  const err = options.err ?? ((text: string) => void process.stderr.write(text));
  const retryWaitsMs = options.retryWaitsMs ?? DEFAULT_RETRY_WAITS_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // ADR-034: the CI token, if any. Tests pass `env: {}` and never see it.
  const githubToken = (options.env ?? process.env).GITHUB_TOKEN;
  const warnings: string[] = [];
  const warn = (message: string): void => {
    warnings.push(message);
    err(`corpus: warning: ${message}\n`);
  };

  let corpus: LoadedCorpus;
  try {
    corpus = loadCorpus({ repoRoot, env: options.env });
  } catch (error) {
    const message = error instanceof CorpusError ? error.message : messageOf(error);
    err(`corpus: ${message}\n`);
    return { code: EXIT_ERROR, corpus: null, downloaded: [], generated: [], reused: [], warnings };
  }

  if (!corpus.privateDir) {
    warn("CORPUS_PRIVATE_DIR is not set (environment or .env): using the public corpus only");
  }

  const downloaded: string[] = [];
  const generated: string[] = [];
  const reused: string[] = [];
  await mkdir(corpus.publicDir, { recursive: true });

  for (const entry of corpus.publicEntries) {
    if (existsSync(entry.path)) {
      const digest = await sha256File(entry.path);
      if (digest === entry.sha256) {
        reused.push(entry.id);
        out(`corpus: ${entry.id} already present and verified (no request)\n`);
        continue;
      }
      warn(
        `${entry.id}: present file does not match the manifest digest, ` +
          `${entry.generated ? "regenerating" : "downloading again"}`,
      );
    }

    if (entry.generated) {
      const outcome = await generate(entry, entry.path);
      if (!outcome.ok) {
        err(`corpus: ${outcome.message}\n`);
        return { code: EXIT_ERROR, corpus, downloaded, generated, reused, warnings };
      }
      generated.push(entry.id);
      out(`corpus: generated ${entry.id} (${outcome.bytes} bytes, synthetic)\n`);
      continue;
    }

    if (!entry.sourceUrl) {
      err(`corpus: ${entry.id} has no source_url in corpus/manifest.yaml\n`);
      return { code: EXIT_ERROR, corpus, downloaded, generated, reused, warnings };
    }

    const outcome = await download({
      id: entry.id,
      urls: [entry.sourceUrl, ...entry.fallbackUrls],
      referer: entry.pageUrl,
      target: entry.path,
      expected: entry.sha256 ?? "",
      out,
      retryWaitsMs,
      timeoutMs,
      githubToken,
    });
    if (!outcome.ok) {
      err(`corpus: ${outcome.message}\n`);
      return { code: EXIT_ERROR, corpus, downloaded, generated, reused, warnings };
    }

    downloaded.push(entry.id);
    out(`corpus: downloaded ${entry.id} (${outcome.bytes} bytes)\n`);
  }

  warnOrphans(
    corpus.publicDir,
    new Set(
      corpus.publicEntries.filter((entry) => !entry.generated).map((entry) => `${entry.id}.pdf`),
    ),
    warn,
  );
  warnOrphans(
    path.join(corpus.publicDir, SYNTHETIC_DIR),
    new Set(
      corpus.publicEntries.filter((entry) => entry.generated).map((entry) => `${entry.id}.pdf`),
    ),
    warn,
  );
  if (corpus.privateDir) {
    warnOrphans(
      corpus.privateDir,
      new Set(corpus.privateEntries.map((entry) => entry.file ?? `${entry.id}.pdf`)),
      warn,
    );
  }

  out(
    `corpus: ${corpus.publicEntries.length} public ` +
      `(${downloaded.length} downloaded, ${generated.length} generated, ${reused.length} reused), ` +
      `${corpus.privateEntries.length} private entries merged\n`,
  );
  return { code: EXIT_OK, corpus, downloaded, generated, reused, warnings };
}

/** CLI entry: `--help` and usage errors live here, downloads in `runFetch`. */
export async function runFetchCli(argv: readonly string[], io: FetchIo): Promise<number> {
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help" || arg === "help") {
      io.out(HELP);
      return EXIT_OK;
    }
    io.err(`corpus: unknown option: ${arg}\n\n${HELP}`);
    return EXIT_USAGE;
  }
  const result = await runFetch({ out: io.out, err: io.err });
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
  process.exitCode = await runFetchCli(process.argv.slice(2), {
    out: (text) => void process.stdout.write(text),
    err: (text) => void process.stderr.write(text),
  });
}
