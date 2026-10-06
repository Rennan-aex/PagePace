import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { githubRequestHeaders, runFetch, runFetchCli } from "./fetch";
import { syntheticSpecOf } from "./specs";
import { buildSynthetic, type SyntheticSpec } from "./synthetic";

/**
 * E1-T05: `pnpm corpus:fetch` against a local HTTP server (`node:http`).
 *
 * No test here touches the real network or the real private corpus. The
 * retry waits are zeroed so the three attempts (ADR-032) stay fast.
 */

type Route = (request: IncomingMessage, response: ServerResponse, index: number) => void;

interface TestServer {
  origin: string;
  requests: string[];
  headers: IncomingHttpHeaders[];
  reset: () => void;
  close: () => Promise<void>;
}

const servers: TestServer[] = [];
const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "pagepace-fetch-"));
  tempDirs.push(dir);
  return dir;
}

async function startServer(route: Route): Promise<TestServer> {
  const requests: string[] = [];
  const headers: IncomingHttpHeaders[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    headers.push({ ...request.headers });
    route(request, response, requests.length);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const handle: TestServer = {
    origin: `http://127.0.0.1:${port}`,
    requests,
    headers,
    reset: () => {
      requests.length = 0;
      headers.length = 0;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
  servers.push(handle);
  return handle;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const sha = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

const BODY = Buffer.from("%PDF-1.4 pagepace fetch fixture");

interface PublicDoc {
  id: string;
  url: string;
  sha256: string;
  fallbacks?: readonly string[];
  pageUrl?: string;
}

async function makeRepo(docs: readonly PublicDoc[]): Promise<{ root: string; publicDir: string }> {
  const root = await tempDir();
  const publicDir = path.join(root, "corpus", "public");
  await mkdir(publicDir, { recursive: true });
  const lines = ["# fixture", "version: 1", "documents:", ""];
  for (const doc of docs) {
    lines.push(
      `  - id: ${doc.id}`,
      "    level: N2",
      "    lang: en",
      '    title: "Fixture"',
      `    source_url: "${doc.url}"`,
    );
    if (doc.pageUrl) lines.push(`    page_url: "${doc.pageUrl}"`);
    if (doc.fallbacks?.length) {
      const list = doc.fallbacks.map((url) => `"${url}"`).join(", ");
      lines.push(`    fallback_urls: [${list}]`);
    }
    lines.push(
      `    sha256: "${doc.sha256}"`,
      "    features: [equations]",
      "    golden: none",
      "    visibility: public",
      "",
    );
  }
  await writeFile(path.join(root, "corpus", "manifest.yaml"), lines.join("\n"));
  return { root, publicDir };
}

function makePrivateDir(id: string): Promise<string> {
  return tempDir().then(async (dir) => {
    await writeFile(
      path.join(dir, "manifest.yaml"),
      [
        "# private fixture",
        "version: 1",
        "documents:",
        "",
        `  - id: ${id}`,
        `    file: ${id}.pdf`,
        "    level: N1",
        "    lang: pt",
        `    title: "${id}"`,
        "    source_url: null",
        `    sha256: "${sha(id)}"`,
        "    features: []",
        "    golden: none",
        "    visibility: private",
        "",
      ].join("\n"),
    );
    await writeFile(path.join(dir, `${id}.pdf`), `private bytes of ${id}`);
    return dir;
  });
}

function capture(): {
  out: (text: string) => void;
  err: (text: string) => void;
  text: () => string;
  errors: () => string;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
    text: () => stdout.join(""),
    errors: () => stderr.join(""),
  };
}

const serve =
  (status: number, body: Buffer): Route =>
  (_request, response) => {
    response.writeHead(status, { "content-type": "application/pdf" });
    response.end(body);
  };

describe("runFetch", () => {
  it("downloads, verifies the digest and issues zero requests on the second run", async () => {
    const server = await startServer(serve(200, BODY));
    const repo = await makeRepo([
      { id: "n1-en-fixture", url: `${server.origin}/n1-en-fixture.pdf`, sha256: sha(BODY) },
    ]);
    const io = capture();

    const first = await runFetch({ repoRoot: repo.root, env: {}, out: io.out, err: io.err });

    expect(first.code).toBe(0);
    expect(first.downloaded).toEqual(["n1-en-fixture"]);
    expect(first.reused).toEqual([]);
    expect(server.requests).toHaveLength(1);
    expect(await readFile(path.join(repo.publicDir, "n1-en-fixture.pdf"))).toEqual(BODY);

    server.reset();
    const second = await runFetch({ repoRoot: repo.root, env: {}, out: io.out, err: io.err });

    expect(second.code).toBe(0);
    expect(second.downloaded).toEqual([]);
    expect(second.reused).toEqual(["n1-en-fixture"]);
    expect(server.requests).toHaveLength(0);
    expect(io.text()).toContain("no request");
  });

  it("re-downloads a present file whose digest does not match the manifest", async () => {
    const server = await startServer(serve(200, BODY));
    const repo = await makeRepo([
      { id: "n1-en-fixture", url: `${server.origin}/n1-en-fixture.pdf`, sha256: sha(BODY) },
    ]);
    const target = path.join(repo.publicDir, "n1-en-fixture.pdf");
    await writeFile(target, "corrupted bytes");
    const io = capture();

    const result = await runFetch({ repoRoot: repo.root, env: {}, out: io.out, err: io.err });

    expect(result.code).toBe(0);
    expect(result.downloaded).toEqual(["n1-en-fixture"]);
    expect(server.requests).toHaveLength(1);
    expect(await readFile(target)).toEqual(BODY);
    expect(io.errors()).toContain("downloading again");
  });

  it("fails with the expected and actual digest when the download is wrong", async () => {
    const server = await startServer(serve(200, Buffer.from("not the manifest content")));
    const expected = sha(BODY);
    const repo = await makeRepo([
      { id: "n1-en-fixture", url: `${server.origin}/n1-en-fixture.pdf`, sha256: expected },
    ]);
    const io = capture();

    const result = await runFetch({ repoRoot: repo.root, env: {}, out: io.out, err: io.err });

    expect(result.code).toBe(1);
    expect(io.errors()).toContain("digest mismatch for n1-en-fixture");
    expect(io.errors()).toContain(expected);
    expect(io.errors()).toContain(sha("not the manifest content"));
    expect(existsSync(path.join(repo.publicDir, "n1-en-fixture.pdf"))).toBe(false);
    expect(existsSync(path.join(repo.publicDir, "n1-en-fixture.pdf.tmp"))).toBe(false);
    expect(await readdir(repo.publicDir)).toEqual([]);
  });

  it("fails on HTTP 404 without retrying", async () => {
    const server = await startServer(serve(404, Buffer.from("missing")));
    const repo = await makeRepo([
      { id: "n1-en-fixture", url: `${server.origin}/n1-en-fixture.pdf`, sha256: sha(BODY) },
    ]);
    const io = capture();

    const result = await runFetch({ repoRoot: repo.root, env: {}, out: io.out, err: io.err });

    expect(result.code).toBe(1);
    expect(server.requests).toHaveLength(1);
    expect(io.errors()).toContain("HTTP 404");
    // The message must report the attempts that really happened (1, not 3).
    expect(io.errors()).toContain("after 1 attempt(s): HTTP 404");
  });

  it("tries three times on HTTP 500 and then fails", async () => {
    const server = await startServer(serve(500, Buffer.from("boom")));
    const repo = await makeRepo([
      { id: "n1-en-fixture", url: `${server.origin}/n1-en-fixture.pdf`, sha256: sha(BODY) },
    ]);
    const io = capture();

    const result = await runFetch({
      repoRoot: repo.root,
      env: {},
      out: io.out,
      err: io.err,
      retryWaitsMs: [0, 0],
    });

    expect(result.code).toBe(1);
    expect(server.requests).toHaveLength(3);
    expect(io.errors()).toContain("after 3 attempt(s): HTTP 500");
    expect(existsSync(path.join(repo.publicDir, "n1-en-fixture.pdf"))).toBe(false);
  });

  it("recovers when the second attempt returns HTTP 200", async () => {
    const server = await startServer((_request, response, index) => {
      if (index === 1) {
        response.writeHead(503, { "content-type": "text/plain" });
        response.end("try again");
        return;
      }
      response.writeHead(200, { "content-type": "application/pdf" });
      response.end(BODY);
    });
    const repo = await makeRepo([
      { id: "n1-en-fixture", url: `${server.origin}/n1-en-fixture.pdf`, sha256: sha(BODY) },
    ]);
    const io = capture();

    const result = await runFetch({
      repoRoot: repo.root,
      env: {},
      out: io.out,
      err: io.err,
      retryWaitsMs: [0, 0],
    });

    expect(result.code).toBe(0);
    expect(server.requests).toHaveLength(2);
    expect(io.text()).toContain("attempt 2 of 3");
    expect(await readFile(path.join(repo.publicDir, "n1-en-fixture.pdf"))).toEqual(BODY);
  });

  it("retries HTTP 403 and echoes the cookie the shield just set", async () => {
    const server = await startServer((_request, response, index) => {
      if (index === 1) {
        response.writeHead(403, {
          "content-type": "text/plain",
          "set-cookie": "bunny_shield_id=abc123; Path=/; Secure",
        });
        response.end("blocked");
        return;
      }
      response.writeHead(200, { "content-type": "application/pdf" });
      response.end(BODY);
    });
    const repo = await makeRepo([
      { id: "n1-en-fixture", url: `${server.origin}/n1-en-fixture.pdf`, sha256: sha(BODY) },
    ]);
    const io = capture();

    const result = await runFetch({
      repoRoot: repo.root,
      env: {},
      out: io.out,
      err: io.err,
      retryWaitsMs: [0, 0],
    });

    expect(result.code).toBe(0);
    expect(server.requests).toHaveLength(2);
    expect(String(server.headers[1]?.cookie)).toContain("bunny_shield_id=abc123");
    expect(io.text()).toContain("attempt 2 of 3");
    expect(await readFile(path.join(repo.publicDir, "n1-en-fixture.pdf"))).toEqual(BODY);
  });

  it("sends browser-shaped headers and uses page_url as the referer", async () => {
    const server = await startServer(serve(200, BODY));
    const repo = await makeRepo([
      {
        id: "n1-en-fixture",
        url: `${server.origin}/n1-en-fixture.pdf`,
        sha256: sha(BODY),
        pageUrl: "https://example.org/article",
      },
    ]);
    const io = capture();

    const result = await runFetch({ repoRoot: repo.root, env: {}, out: io.out, err: io.err });

    expect(result.code).toBe(0);
    const headers = server.headers[0] ?? {};
    expect(String(headers["user-agent"])).toContain("Mozilla/5.0");
    expect(String(headers["user-agent"])).toContain("PagePace-CorpusFetch/1.0");
    expect(headers["accept-language"]).toBe("en-US,en;q=0.9,pt;q=0.8");
    expect(String(headers.accept)).toContain("application/pdf");
    expect(headers.referer).toBe("https://example.org/article");
  });

  it("uses fallback_urls after the primary URL fails", async () => {
    const server = await startServer((request, response) => {
      if (request.url === "/primary.pdf") {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("gone");
        return;
      }
      response.writeHead(200, { "content-type": "application/pdf" });
      response.end(BODY);
    });
    const repo = await makeRepo([
      {
        id: "n1-en-fixture",
        url: `${server.origin}/primary.pdf`,
        sha256: sha(BODY),
        fallbacks: [`${server.origin}/mirror.pdf`],
      },
    ]);
    const io = capture();

    const result = await runFetch({ repoRoot: repo.root, env: {}, out: io.out, err: io.err });

    expect(result.code).toBe(0);
    expect(server.requests).toEqual(["/primary.pdf", "/mirror.pdf"]);
    expect(io.text()).toContain("trying fallback URL");
    expect(await readFile(path.join(repo.publicDir, "n1-en-fixture.pdf"))).toEqual(BODY);
  });

  it("lists every URL with its own attempt count when all of them fail", async () => {
    const server = await startServer(serve(404, Buffer.from("missing")));
    const repo = await makeRepo([
      {
        id: "n1-en-fixture",
        url: `${server.origin}/primary.pdf`,
        sha256: sha(BODY),
        fallbacks: [`${server.origin}/mirror.pdf`],
      },
    ]);
    const io = capture();

    const result = await runFetch({ repoRoot: repo.root, env: {}, out: io.out, err: io.err });

    expect(result.code).toBe(1);
    expect(server.requests).toEqual(["/primary.pdf", "/mirror.pdf"]);
    expect(io.errors()).toContain("failed to download n1-en-fixture:");
    expect(io.errors()).toContain("/primary.pdf: after 1 attempt(s): HTTP 404");
    expect(io.errors()).toContain("/mirror.pdf: after 1 attempt(s): HTTP 404");
    expect(await readdir(repo.publicDir)).toEqual([]);
  });

  it("follows redirects", async () => {
    const server = await startServer((request, response, index) => {
      if (index === 1) {
        response.writeHead(302, { location: `http://${request.headers.host}/real.pdf` });
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "application/pdf" });
      response.end(BODY);
    });
    const repo = await makeRepo([
      { id: "n1-en-fixture", url: `${server.origin}/download`, sha256: sha(BODY) },
    ]);
    const io = capture();

    const result = await runFetch({ repoRoot: repo.root, env: {}, out: io.out, err: io.err });

    expect(result.code).toBe(0);
    expect(server.requests).toEqual(["/download", "/real.pdf"]);
    expect(await readFile(path.join(repo.publicDir, "n1-en-fixture.pdf"))).toEqual(BODY);
  });

  it("merges the private manifest without any download", async () => {
    const privateDir = await makePrivateDir("n1-pt-private");
    const repo = await makeRepo([
      // A dead port: reaching the network here would fail the run.
      { id: "n1-en-fixture", url: "http://127.0.0.1:9/never.pdf", sha256: sha(BODY) },
    ]);
    await writeFile(path.join(repo.publicDir, "n1-en-fixture.pdf"), BODY);
    const io = capture();

    const result = await runFetch({
      repoRoot: repo.root,
      env: { CORPUS_PRIVATE_DIR: privateDir },
      out: io.out,
      err: io.err,
    });

    expect(result.code).toBe(0);
    expect(result.reused).toEqual(["n1-en-fixture"]);
    expect(result.corpus?.privateEntries.map((entry) => entry.id)).toEqual(["n1-pt-private"]);
    expect(result.corpus?.privateEntries[0]?.path).toBe(path.join(privateDir, "n1-pt-private.pdf"));
    expect(
      result.warnings.some((warning) => warning.includes("CORPUS_PRIVATE_DIR is not set")),
    ).toBe(false);
  });

  it("warns exactly once and exits 0 without any private corpus source", async () => {
    const repo = await makeRepo([]);
    const io = capture();

    const result = await runFetch({ repoRoot: repo.root, env: {}, out: io.out, err: io.err });

    expect(result.code).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("CORPUS_PRIVATE_DIR is not set");
    expect(io.errors()).toContain("corpus: warning:");
  });

  it("reads CORPUS_PRIVATE_DIR from .env and lets the environment win", async () => {
    const fromDotEnv = await makePrivateDir("n1-pt-from-dotenv");
    const fromEnv = await makePrivateDir("n1-pt-from-env");
    const repo = await makeRepo([]);
    await writeFile(path.join(repo.root, ".env"), `CORPUS_PRIVATE_DIR=${fromDotEnv}\n`);
    const io = capture();

    const viaDotEnv = await runFetch({ repoRoot: repo.root, env: {}, out: io.out, err: io.err });
    expect(viaDotEnv.code).toBe(0);
    expect(viaDotEnv.corpus?.privateDirSource).toBe(".env");
    expect(viaDotEnv.corpus?.privateEntries.map((entry) => entry.id)).toEqual([
      "n1-pt-from-dotenv",
    ]);

    const viaEnv = await runFetch({
      repoRoot: repo.root,
      env: { CORPUS_PRIVATE_DIR: fromEnv },
      out: io.out,
      err: io.err,
    });
    expect(viaEnv.corpus?.privateDirSource).toBe("environment");
    expect(viaEnv.corpus?.privateEntries.map((entry) => entry.id)).toEqual(["n1-pt-from-env"]);
  });

  it("warns about PDFs on disk that the manifest does not list", async () => {
    const repo = await makeRepo([]);
    await writeFile(path.join(repo.publicDir, "orphan.pdf"), "nobody's PDF");
    const io = capture();

    const result = await runFetch({ repoRoot: repo.root, env: {}, out: io.out, err: io.err });

    expect(result.code).toBe(0);
    const orphan = result.warnings.find((warning) =>
      warning.includes("PDF without a manifest entry"),
    );
    expect(orphan).toContain(path.join(repo.publicDir, "orphan.pdf"));
  });

  it("never sends GITHUB_TOKEN to a host that does not belong to GitHub", async () => {
    const server = await startServer(serve(200, BODY));
    const repo = await makeRepo([
      { id: "n1-en-fixture", url: `${server.origin}/n1-en-fixture.pdf`, sha256: sha(BODY) },
    ]);
    const io = capture();

    const result = await runFetch({
      repoRoot: repo.root,
      env: { GITHUB_TOKEN: "super-secret" },
      out: io.out,
      err: io.err,
    });

    expect(result.code).toBe(0);
    expect(server.headers[0]?.authorization).toBeUndefined();
    expect(io.text()).not.toContain("super-secret");
  });

  it("fails when a public entry has no source_url", async () => {
    const root = await tempDir();
    const publicDir = path.join(root, "corpus", "public");
    await mkdir(publicDir, { recursive: true });
    await writeFile(
      path.join(root, "corpus", "manifest.yaml"),
      `version: 1\ndocuments:\n\n  - id: n1-en-a\n    sha256: "${sha(BODY)}"\n    visibility: public\n`,
    );
    const io = capture();

    const result = await runFetch({ repoRoot: root, env: {}, out: io.out, err: io.err });

    expect(result.code).toBe(1);
    expect(io.errors()).toContain("n1-en-a has no source_url");
  });

  it("generates a missing synthetic document and reuses it on the second run", async () => {
    const spec = syntheticSpecOf("syn-n1-en-paragraphs") as SyntheticSpec;
    const artifact = buildSynthetic(spec);
    const root = await tempDir();
    await mkdir(path.join(root, "corpus"), { recursive: true });
    await writeFile(
      path.join(root, "corpus", "manifest.yaml"),
      [
        "version: 1",
        "documents:",
        "",
        "  - id: syn-n1-en-paragraphs",
        "    generated: true",
        `    sha256: "${artifact.sha256}"`,
        "    golden: syn-n1-en-paragraphs.golden.json",
        "",
      ].join("\n"),
    );
    const target = path.join(root, "corpus", "public", "synthetic", "syn-n1-en-paragraphs.pdf");
    const io = capture();

    const first = await runFetch({ repoRoot: root, env: {}, out: io.out, err: io.err });

    expect(first.code).toBe(0);
    expect(first.generated).toEqual(["syn-n1-en-paragraphs"]);
    expect(await readFile(target)).toEqual(Buffer.from(artifact.pdf));
    expect(io.text()).toContain("generated syn-n1-en-paragraphs");

    const second = await runFetch({ repoRoot: root, env: {}, out: io.out, err: io.err });

    expect(second.code).toBe(0);
    expect(second.generated).toEqual([]);
    expect(second.reused).toEqual(["syn-n1-en-paragraphs"]);
    expect(io.text()).toContain("no request");
  });

  it("regenerates a synthetic document whose digest does not match", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "corpus", "public", "synthetic"), { recursive: true });
    await writeFile(
      path.join(root, "corpus", "manifest.yaml"),
      [
        "version: 1",
        "documents:",
        "",
        "  - id: syn-n1-en-paragraphs",
        "    generated: true",
        `    sha256: "${sha("not what the specification builds")}"`,
        "    golden: syn-n1-en-paragraphs.golden.json",
        "",
      ].join("\n"),
    );
    const target = path.join(root, "corpus", "public", "synthetic", "syn-n1-en-paragraphs.pdf");
    await writeFile(target, "stale bytes");
    const io = capture();

    const result = await runFetch({ repoRoot: root, env: {}, out: io.out, err: io.err });

    expect(result.code).toBe(1);
    expect(io.errors()).toContain("digest mismatch for syn-n1-en-paragraphs");
    expect(io.errors()).toContain("the specification and corpus/manifest.yaml disagree");
    expect(io.errors()).toContain("pnpm corpus:synthetic");
    expect(await readFile(target, "utf8")).toBe("stale bytes");
  });

  it("fails when a generated entry has no specification", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "corpus"), { recursive: true });
    await writeFile(
      path.join(root, "corpus", "manifest.yaml"),
      [
        "version: 1",
        "documents:",
        "",
        "  - id: syn-ghost",
        "    generated: true",
        `    sha256: "${sha(BODY)}"`,
        "",
      ].join("\n"),
    );
    const io = capture();

    const result = await runFetch({ repoRoot: root, env: {}, out: io.out, err: io.err });

    expect(result.code).toBe(1);
    expect(io.errors()).toContain("syn-ghost is marked generated but has no specification");
  });
});

describe("runFetchCli", () => {
  it("prints the help with exit code 0", async () => {
    const io = capture();

    const code = await runFetchCli(["--help"], io);

    expect(code).toBe(0);
    expect(io.text()).toContain("Usage:");
    expect(io.text()).toContain("Exit codes:");
    expect(io.errors()).toBe("");
  });

  it("rejects unknown options with exit code 2", async () => {
    const io = capture();

    const code = await runFetchCli(["--force"], io);

    expect(code).toBe(2);
    expect(io.errors()).toContain("unknown option: --force");
    expect(io.text()).toBe("");
  });
});

describe("githubRequestHeaders (ADR-034)", () => {
  const token = "ghs_test_token";

  it("attaches the token to GitHub hosts only", () => {
    expect(githubRequestHeaders("https://api.github.com/repos/o/r/releases", token)).toEqual({
      authorization: `Bearer ${token}`,
      accept: "application/octet-stream",
    });
    expect(
      githubRequestHeaders("https://github.com/o/r/releases/download/v1/a.pdf", token),
    ).toEqual({
      authorization: `Bearer ${token}`,
    });
    expect(githubRequestHeaders("https://objects.githubusercontent.com/x", token)).toEqual({
      authorization: `Bearer ${token}`,
    });
    expect(githubRequestHeaders("https://release-assets.githubusercontent.com/x", token)).toEqual({
      authorization: `Bearer ${token}`,
    });
  });

  it("sends nothing to other sites or without a token", () => {
    expect(githubRequestHeaders("https://www.scielo.br/j/fun/a/x/?format=pdf", token)).toEqual({});
    expect(githubRequestHeaders("https://arxiv.org/pdf/2602.21912v1", token)).toEqual({});
    expect(githubRequestHeaders("http://127.0.0.1:8080/a.pdf", token)).toEqual({});
    expect(githubRequestHeaders("https://github.com.attacker.example/a.pdf", token)).toEqual({});
    expect(githubRequestHeaders("https://github.com/a.pdf", undefined)).toEqual({});
    expect(githubRequestHeaders("https://api.github.com/x", undefined)).toEqual({});
    expect(githubRequestHeaders("not a URL", token)).toEqual({});
  });
});
