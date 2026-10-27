import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildBook,
  extractionCacheKeyFor,
  ingestPdfjs,
  SCANNED_PDF_MESSAGE,
} from "@pagepace/extractor";
import { parseBook } from "@pagepace/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPdf, textStream } from "../../extractor/test/minipdf";
import { EXIT_ERROR, EXIT_OK, EXIT_SCANNED, EXIT_USAGE, HELP, run } from "./index";
import { normalizeCliPath, pagesRange } from "./report";

/**
 * E1-T04: the minimal CLI.
 *
 * `run()` takes injected streams so the tests exercise the real command
 * (file reading + ingestion) without spawning a process.
 */

function capture(): {
  io: { out: (text: string) => void; err: (text: string) => void };
  out: () => string;
  err: () => string;
} {
  let out = "";
  let err = "";
  return {
    io: {
      out: (text) => {
        out += text;
      },
      err: (text) => {
        err += text;
      },
    },
    out: () => out,
    err: () => err,
  };
}

let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pagepace-cli-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writePdf(name: string, bytes: Uint8Array): Promise<string> {
  const file = path.join(dir, name);
  await writeFile(file, bytes);
  return file;
}

describe("help and usage", () => {
  it("--help prints the usage and exits 0", async () => {
    const streams = capture();
    const code = await run(["--help"], streams.io);

    expect(code).toBe(EXIT_OK);
    expect(streams.out()).toBe(HELP);
    expect(streams.out()).toContain("dump-raw");
    expect(streams.out()).toContain("extract");
    expect(streams.err()).toBe("");
  });

  it("no command at all is a usage error", async () => {
    const streams = capture();
    const code = await run([], streams.io);

    expect(code).toBe(EXIT_USAGE);
    expect(streams.out()).toBe("");
    expect(streams.err()).toContain("Nenhum comando informado.");
  });

  it("rejects an unknown command", async () => {
    const streams = capture();
    const code = await run(["explode"], streams.io);

    expect(code).toBe(EXIT_USAGE);
    expect(streams.err()).toContain("Comando desconhecido: explode");
  });

  it("rejects an unknown option and a malformed --pages", async () => {
    const unknown = capture();
    expect(await run(["dump-raw", "--force"], unknown.io)).toBe(EXIT_USAGE);
    expect(unknown.err()).toContain("Opção desconhecida: --force");

    const malformed = capture();
    expect(await run(["dump-raw", "a.pdf", "--pages", "5-1"], malformed.io)).toBe(EXIT_USAGE);
    expect(malformed.err()).toContain("Valor inválido para --pages");

    const missingFile = capture();
    expect(await run(["dump-raw"], missingFile.io)).toBe(EXIT_USAGE);
    expect(missingFile.err()).toContain("Falta o arquivo PDF.");
  });

  it("reports a missing file with a clear message", async () => {
    const streams = capture();
    const code = await run(["dump-raw", path.join(dir, "nope.pdf")], streams.io);

    expect(code).toBe(EXIT_ERROR);
    expect(streams.out()).toBe("");
    expect(streams.err()).toContain("Arquivo não encontrado:");
  });
});

describe("dump-raw", () => {
  it("writes the RawDocument as JSON", async () => {
    const file = await writePdf("digital.pdf", buildPdf([textStream("hello world")]));
    const streams = capture();
    const code = await run(["dump-raw", file], streams.io);

    expect(code).toBe(EXIT_OK);
    expect(streams.err()).toBe("");
    const document = JSON.parse(streams.out()) as {
      schemaVersion: string;
      source: { fileName: string; pageCount: number };
      pages: { items: { text: string }[] }[];
    };
    expect(document.schemaVersion).toBe("1.2.0");
    expect(document.source.fileName).toBe("digital.pdf");
    expect(document.source.pageCount).toBe(1);
    expect(document.pages[0]?.items.map((item) => item.text)).toEqual(["hello world"]);
  });

  it("limits the output to --pages", async () => {
    const file = await writePdf(
      "three.pdf",
      buildPdf([textStream("one"), textStream("two"), textStream("three")]),
    );

    const single = capture();
    expect(await run(["dump-raw", file, "--pages", "2-2"], single.io)).toBe(EXIT_OK);
    const page = JSON.parse(single.out()) as { pages: { items: { text: string }[] }[] };
    expect(page.pages).toHaveLength(1);
    expect(page.pages[0]?.items.map((item) => item.text)).toEqual(["two"]);

    const range = capture();
    expect(await run(["dump-raw", file, "--pages=1-3"], range.io)).toBe(EXIT_OK);
    const all = JSON.parse(range.out()) as { pages: unknown[] };
    expect(all.pages).toHaveLength(3);
  });

  it("rejects a --pages range outside the document", async () => {
    const file = await writePdf("one.pdf", buildPdf([textStream("only page")]));
    const streams = capture();
    const code = await run(["dump-raw", file, "--pages", "9-9"], streams.io);

    expect(code).toBe(EXIT_USAGE);
    expect(streams.out()).toBe("");
    expect(streams.err()).toContain("Faixa de páginas inválida:");
  });

  it("shows the ADR-018 message for a scanned PDF and writes no JSON", async () => {
    const file = await writePdf("scan.pdf", buildPdf([""]));
    const streams = capture();
    const code = await run(["dump-raw", file], streams.io);

    expect(code).toBe(EXIT_SCANNED);
    expect(streams.out()).toBe("");
    expect(streams.err()).toBe(`${SCANNED_PDF_MESSAGE}\n`);
  });

  it("keeps the ocr-text-layer flag of an embedded OCR layer in the JSON", async () => {
    const file = await writePdf(
      "ocr.pdf",
      buildPdf([textStream("invisible OCR text layer", { renderMode: 3 })]),
    );
    const streams = capture();
    const code = await run(["dump-raw", file], streams.io);

    expect(code).toBe(EXIT_OK);
    const document = JSON.parse(streams.out()) as { source: { ocrTextLayer?: boolean } };
    expect(document.source.ocrTextLayer).toBe(true);
  });
});

describe("inspect", () => {
  it("prints body size, line height, margins and column width", async () => {
    const file = await writePdf(
      "lines.pdf",
      buildPdf([
        [
          textStream("line one", { x: 72, y: 400, size: 12 }),
          textStream("line two", { x: 72, y: 380, size: 12 }),
          textStream("line three", { x: 72, y: 360, size: 12 }),
        ].join("\n"),
      ]),
    );

    const streams = capture();
    const code = await run(["inspect", file], streams.io);

    expect(code).toBe(EXIT_OK);
    expect(streams.err()).toBe("");
    expect(streams.out()).toContain("Páginas medidas: 1 de 1");
    expect(streams.out()).toContain("Itens de texto: 3");
    expect(streams.out()).toContain("Corpo (moda ponderada): 12.00 pt");
    expect(streams.out()).toContain("Entrelinha típica: 20.00 pt");
    expect(streams.out()).toContain("esquerda 72.00 pt");
    expect(streams.out()).toContain("Largura de coluna:");
  });

  it("reports usage and read errors without printing statistics", async () => {
    const missing = capture();
    expect(await run(["inspect"], missing.io)).toBe(EXIT_USAGE);
    expect(missing.err()).toContain("Falta o arquivo PDF.");

    const unknown = capture();
    expect(await run(["inspect", "a.pdf", "--force"], unknown.io)).toBe(EXIT_USAGE);
    expect(unknown.err()).toContain("Opção desconhecida: --force");

    const absent = capture();
    expect(await run(["inspect", path.join(dir, "nope.pdf")], absent.io)).toBe(EXIT_ERROR);
    expect(absent.err()).toContain("Arquivo não encontrado:");
    expect(absent.out()).toBe("");
  });

  it("reports a scanned PDF with the ADR-018 message", async () => {
    const file = await writePdf("scan-inspect.pdf", buildPdf([""]));
    const streams = capture();
    const code = await run(["inspect", file], streams.io);

    expect(code).toBe(EXIT_SCANNED);
    expect(streams.out()).toBe("");
    expect(streams.err()).toBe(`${SCANNED_PDF_MESSAGE}\n`);
  });
});

describe("extract", () => {
  it("writes a valid Book as JSON", async () => {
    const file = await writePdf(
      "extract.pdf",
      buildPdf([
        [
          textStream("line one", { x: 72, y: 400, size: 12 }),
          textStream("line two", { x: 72, y: 380, size: 12 }),
          textStream("line three", { x: 72, y: 360, size: 12 }),
        ].join("\n"),
      ]),
    );

    const streams = capture();
    const code = await run(["extract", file], streams.io);

    expect(code).toBe(EXIT_OK);
    // E8-T01 fatia 3: progress goes to stderr, never to the JSON on stdout.
    expect(streams.err()).toContain("Página 1 lida");
    const book = parseBook(JSON.parse(streams.out()));
    expect(book.schemaVersion).toBe("1.2.0");
    expect(book.source).toEqual({ fileName: "extract.pdf", pageCount: 1 });
    expect(book.blocks.length).toBeGreaterThan(0);
    expect(book.blocks.every((block) => block.kind === "paragraph")).toBe(true);
    expect(book.blocks[0]?.origin).toMatchObject({ pageFrom: 0, pageTo: 0 });
    expect(book.blocks[0]?.runs[0]?.text).toBe("line one line two line three");
  });

  it("is deterministic: two runs produce the same ids and the same JSON", async () => {
    const file = await writePdf(
      "stable.pdf",
      buildPdf([
        [
          textStream("stable block", { x: 72, y: 400, size: 12 }),
          textStream("second line", { x: 72, y: 370, size: 12 }),
        ].join("\n"),
      ]),
    );

    const first = capture();
    expect(await run(["extract", file], first.io)).toBe(EXIT_OK);
    const second = capture();
    expect(await run(["extract", file], second.io)).toBe(EXIT_OK);

    const one = JSON.parse(first.out()) as { blocks: { id: string }[] };
    const two = JSON.parse(second.out()) as { blocks: { id: string }[] };
    expect(two.blocks.map((block) => block.id)).toEqual(one.blocks.map((block) => block.id));
    expect(second.out()).toBe(first.out());
  });

  it("prints per-page progress on stderr and keeps the batch stdout byte-identical (E8-T01)", async () => {
    const bytes = buildPdf([textStream("one"), textStream("two"), textStream("three")]);
    const file = await writePdf("progress.pdf", bytes);

    const streams = capture();
    const code = await run(["extract", file], streams.io);

    expect(code).toBe(EXIT_OK);
    expect(streams.err()).toBe("Página 1 lida\nPágina 2 lida\nPágina 3 lida\n");

    // The stdout of the streaming CLI is exactly what the batch path prints.
    const document = await ingestPdfjs(bytes, { fileName: "progress.pdf" });
    expect(streams.out()).toBe(`${JSON.stringify(buildBook(document), null, 2)}\n`);
  });

  it("reports usage errors without printing a book", async () => {
    const missing = capture();
    expect(await run(["extract"], missing.io)).toBe(EXIT_USAGE);
    expect(missing.err()).toContain("Falta o arquivo PDF.");

    const unknown = capture();
    expect(await run(["extract", "a.pdf", "--force"], unknown.io)).toBe(EXIT_USAGE);
    expect(unknown.err()).toContain("Opção desconhecida: --force");

    const absent = capture();
    expect(await run(["extract", path.join(dir, "nope.pdf")], absent.io)).toBe(EXIT_ERROR);
    expect(absent.err()).toContain("Arquivo não encontrado:");
    expect(absent.out()).toBe("");
  });

  it("reports a scanned PDF with the ADR-018 message and no JSON", async () => {
    const file = await writePdf("scan-extract.pdf", buildPdf([""]));
    const streams = capture();
    const code = await run(["extract", file], streams.io);

    expect(code).toBe(EXIT_SCANNED);
    expect(streams.out()).toBe("");
    expect(streams.err()).toBe(`${SCANNED_PDF_MESSAGE}\n`);
  });
});

describe("extract --cache-dir (E8-T02)", () => {
  const cachedPdf = (): Uint8Array =>
    buildPdf([
      [
        textStream("cache line one", { x: 72, y: 400, size: 12 }),
        textStream("cache line two", { x: 72, y: 370, size: 12 }),
      ].join("\n"),
    ]);

  it("reprocesses on the first opening and serves the second from the cache", async () => {
    const bytes = cachedPdf();
    const file = await writePdf("cache-a.pdf", bytes);
    const cacheDir = path.join(dir, "cache-a");

    const first = capture();
    expect(await run(["extract", file, "--cache-dir", cacheDir], first.io)).toBe(EXIT_OK);
    expect(first.err()).toContain("Página 1 lida");

    const second = capture();
    expect(await run(["extract", file, "--cache-dir", cacheDir], second.io)).toBe(EXIT_OK);
    // A hit never opens the PDF: no page progress, only the cache key.
    expect(second.err()).not.toContain("Página");
    expect(second.err()).toContain(extractionCacheKeyFor(bytes));
    // The stdout of the hit is the byte-identical JSON of the miss.
    expect(second.out()).toBe(first.out());

    const entries = await readdir(cacheDir);
    expect(entries).toEqual([`${extractionCacheKeyFor(bytes)}.json`]);
  });

  it("invalidates the entry when the extractor or schema version changes", async () => {
    const bytes = cachedPdf();
    const file = await writePdf("cache-b.pdf", bytes);
    const cacheDir = path.join(dir, "cache-b");

    const first = capture();
    expect(await run(["extract", file, "--cache-dir", cacheDir], first.io)).toBe(EXIT_OK);
    const key = extractionCacheKeyFor(bytes);

    // Simulate a build with other versions: the entry exists with its content
    // but under the key those versions derived — the current build must miss.
    const versionParts = key.split("-");
    const staleName = `${versionParts[0]}-9.9.9-9.9.9.json`;
    await writeFile(
      path.join(cacheDir, staleName),
      await readFile(path.join(cacheDir, `${key}.json`), "utf8"),
    );
    await rm(path.join(cacheDir, `${key}.json`));

    const second = capture();
    expect(await run(["extract", file, "--cache-dir", cacheDir], second.io)).toBe(EXIT_OK);
    expect(second.err()).toContain("Página 1 lida");
    expect(await readdir(cacheDir)).toContain(`${key}.json`);
  });

  it("treats a corrupt entry as a miss, warns and reprocesses", async () => {
    const bytes = cachedPdf();
    const file = await writePdf("cache-c.pdf", bytes);
    const cacheDir = path.join(dir, "cache-c");

    const first = capture();
    expect(await run(["extract", file, "--cache-dir", cacheDir], first.io)).toBe(EXIT_OK);
    const key = extractionCacheKeyFor(bytes);
    await writeFile(path.join(cacheDir, `${key}.json`), "not json {");

    const second = capture();
    expect(await run(["extract", file, "--cache-dir", cacheDir], second.io)).toBe(EXIT_OK);
    expect(second.err()).toContain("Página 1 lida");
    expect(second.out()).toBe(first.out());
    const repaired = await readFile(path.join(cacheDir, `${key}.json`), "utf8");
    expect(JSON.parse(repaired)).toEqual(JSON.parse(first.out()));
  });

  it("keeps the default behavior without --cache-dir and rejects a missing value", async () => {
    const file = await writePdf("cache-d.pdf", cachedPdf());

    const plain = capture();
    expect(await run(["extract", file], plain.io)).toBe(EXIT_OK);
    expect(plain.err()).toContain("Página 1 lida");
    expect(plain.err()).not.toContain("Cache:");

    const missing = capture();
    expect(await run(["extract", file, "--cache-dir"], missing.io)).toBe(EXIT_USAGE);
    expect(missing.err()).toContain("Valor ausente para --cache-dir");
  });
});

describe("inspect report formats (E7-T05)", () => {
  async function samplePdf(name: string): Promise<string> {
    return writePdf(
      name,
      buildPdf([
        [
          textStream("line one", { x: 72, y: 400, size: 12 }),
          textStream("line two", { x: 72, y: 380, size: 12 }),
          textStream("line three", { x: 72, y: 360, size: 12 }),
        ].join("\n"),
      ]),
    );
  }

  it("lists the extracted blocks with kind, confidence and flags", async () => {
    const file = await writePdf(
      "flags.pdf",
      buildPdf([
        [
          textStream("Chapter", { x: 72, y: 500, size: 24 }),
          textStream("line one", { x: 72, y: 400, size: 12 }),
          textStream("line two", { x: 72, y: 380, size: 12 }),
          textStream("line three", { x: 72, y: 360, size: 12 }),
        ].join("\n"),
      ]),
    );

    const streams = capture();
    const code = await run(["inspect", file], streams.io);

    expect(code).toBe(EXIT_OK);
    expect(streams.out()).toContain("== Página 1");
    expect(streams.out()).toContain("heading nível 1");
    expect(streams.out()).toContain("paragraph · páginas 1 · confiança 0.90");
    expect(streams.out()).toContain("flags: nenhuma");
  });

  it("requires --out for md and html and rejects an unknown format", async () => {
    const file = await samplePdf("formats.pdf");

    const md = capture();
    expect(await run(["inspect", file, "--format", "md"], md.io)).toBe(EXIT_USAGE);
    expect(md.err()).toContain("exige --out");

    const html = capture();
    expect(await run(["inspect", file, "--format", "html"], html.io)).toBe(EXIT_USAGE);
    expect(html.err()).toContain("exige --out");

    const bogus = capture();
    expect(await run(["inspect", file, "--format", "pdf"], bogus.io)).toBe(EXIT_USAGE);
    expect(bogus.err()).toContain("Formato inválido");
  });

  it("writes the text report to --out", async () => {
    const file = await samplePdf("out-text.pdf");
    const out = path.join(dir, "report.txt");

    const streams = capture();
    const code = await run(["inspect", file, "--out", out], streams.io);

    expect(code).toBe(EXIT_OK);
    expect(streams.out()).toBe("");
    expect(streams.err()).toContain("Relatório gravado em");
    const written = await readFile(out, "utf8");
    expect(written).toContain("Páginas medidas: 1 de 1");
    expect(written).toContain("== Página 1");
  });

  it("writes an html report with the page image embedded", async () => {
    const file = await samplePdf("out-html.pdf");
    const out = path.join(dir, "report.html");

    const streams = capture();
    const code = await run(["inspect", file, "--format", "html", "--out", out], streams.io);

    expect(code).toBe(EXIT_OK);
    expect(streams.err()).toContain("Relatório gravado em");
    const written = await readFile(out, "utf8");
    expect(written).toContain("<!doctype html>");
    expect(written).toContain("data:image/png;base64,");
    expect(written).toContain('class="blocks"');
  });

  it("writes a markdown report with the page image next to it", async () => {
    const file = await samplePdf("out-md.pdf");
    const out = path.join(dir, "report.md");

    const streams = capture();
    const code = await run(["inspect", file, "--format", "md", "--out", out], streams.io);

    expect(code).toBe(EXIT_OK);
    const written = await readFile(out, "utf8");
    expect(written).toContain("| Original | Extraído |");
    expect(written).toContain("](report-inspect/pagina-1.png)");
    const png = await readFile(path.join(dir, "report-inspect", "pagina-1.png"));
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("limits the report to --pages", async () => {
    const file = await writePdf(
      "three-inspect.pdf",
      buildPdf([textStream("one"), textStream("two"), textStream("three")]),
    );

    const streams = capture();
    const code = await run(["inspect", file, "--pages", "2-2"], streams.io);

    expect(code).toBe(EXIT_OK);
    expect(streams.out()).toContain("Páginas no relatório: 2");
    expect(streams.out()).toContain("== Página 2");
    expect(streams.out()).not.toContain("== Página 1");
    expect(streams.out()).not.toContain("== Página 3");
  });
});

describe("explain-page (E7-T05)", () => {
  it("prints every layer's decision for the page", async () => {
    const file = await writePdf(
      "explain.pdf",
      buildPdf([
        [
          textStream("Chapter One", { x: 72, y: 500, size: 24 }),
          textStream("line one", { x: 72, y: 400, size: 12 }),
          textStream("line two", { x: 72, y: 380, size: 12 }),
          textStream("line three", { x: 72, y: 360, size: 12 }),
        ].join("\n"),
      ]),
    );

    const streams = capture();
    const code = await run(["explain-page", file, "1"], streams.io);

    expect(code).toBe(EXIT_OK);
    expect(streams.err()).toBe("");
    expect(streams.out()).toContain("Página 1 de 1");
    expect(streams.out()).toContain("--- Bloco 1");
    expect(streams.out()).toContain("kind: ");
    expect(streams.out()).toContain("camadas:");
    expect(streams.out()).toContain("margin-ref: ");
    expect(streams.out()).toContain("heading: ");
    expect(streams.out()).toContain("hyphen: ");
  });

  it("rejects a page outside the document and a missing argument", async () => {
    const file = await writePdf("explain-range.pdf", buildPdf([textStream("only page")]));

    const outside = capture();
    expect(await run(["explain-page", file, "2"], outside.io)).toBe(EXIT_USAGE);
    expect(outside.err()).toContain("página 2 inexistente");

    const missing = capture();
    expect(await run(["explain-page", file], missing.io)).toBe(EXIT_USAGE);
    expect(missing.err()).toContain("exige o arquivo PDF e o número da página");

    const noFile = capture();
    expect(await run(["explain-page"], noFile.io)).toBe(EXIT_USAGE);
    expect(noFile.err()).toContain("exige o arquivo PDF e o número da página");
  });
});

describe("path handling and --out validation (CLI fixes)", () => {
  it("collapses the doubled backslashes pnpm adds on Windows", async () => {
    const streams = capture();
    const code = await run(["dump-raw", "missing\\\\dir\\\\nope.pdf"], streams.io);

    expect(code).toBe(EXIT_ERROR);
    expect(streams.err()).toContain("missing\\dir\\nope.pdf");
    expect(streams.err()).not.toContain("missing\\\\dir");
  });

  it("rejects a --out that names a root instead of a file, before reading the PDF", async () => {
    const streams = capture();
    const code = await run(["inspect", "no-such.pdf", "--out", path.sep], streams.io);

    expect(code).toBe(EXIT_USAGE);
    expect(streams.err()).toContain("Caminho de --out inválido");
    expect(streams.err()).toContain("pasta e nome");
  });

  it("normalizeCliPath collapses separator runs and keeps a leading UNC marker", () => {
    expect(normalizeCliPath("C:\\\\Users\\\\me\\\\x.pdf")).toBe("C:\\Users\\me\\x.pdf");
    expect(normalizeCliPath("\\\\nas\\\\share\\\\x.pdf")).toBe("\\\\nas\\share\\x.pdf");
    expect(normalizeCliPath("corpus/public//x.pdf")).toBe("corpus/public/x.pdf");
    expect(normalizeCliPath("plain.pdf")).toBe("plain.pdf");
  });

  it("pagesRange collapses consecutive pages and keeps gaps", () => {
    expect(pagesRange([1])).toBe("1");
    expect(pagesRange([1, 2, 3])).toBe("1-3");
    expect(pagesRange([1, 3])).toBe("1, 3");
    expect(pagesRange([3, 1, 2, 5])).toBe("1-3, 5");
  });

  it("shows the page span of every block in the html and markdown reports", async () => {
    const file = await writePdf(
      "span.pdf",
      buildPdf([
        [
          textStream("line one", { x: 72, y: 400, size: 12 }),
          textStream("line two", { x: 72, y: 380, size: 12 }),
        ].join("\n"),
      ]),
    );

    const htmlOut = path.join(dir, "span.html");
    const html = capture();
    expect(await run(["inspect", file, "--format", "html", "--out", htmlOut], html.io)).toBe(
      EXIT_OK,
    );
    expect(await readFile(htmlOut, "utf8")).toContain('<span class="pages">páginas 1</span>');

    const mdOut = path.join(dir, "span.md");
    const md = capture();
    expect(await run(["inspect", file, "--format", "md", "--out", mdOut], md.io)).toBe(EXIT_OK);
    expect(await readFile(mdOut, "utf8")).toContain("páginas 1 · confiança");
  });

  it("notes an embedded OCR layer in the summary (base confidence 0.50)", async () => {
    const file = await writePdf(
      "ocr-report.pdf",
      buildPdf([textStream("invisible OCR text layer", { renderMode: 3 })]),
    );
    const streams = capture();
    const code = await run(["inspect", file], streams.io);

    expect(code).toBe(EXIT_OK);
    expect(streams.out()).toContain("camada de OCR embutida");
  });
});

describe("eval dispatch (E7-T05)", () => {
  it("shows the eval help through the pagepace CLI", async () => {
    const streams = capture();
    const code = await run(["eval", "--help"], streams.io);

    expect(code).toBe(EXIT_OK);
    expect(streams.out()).toContain("text_cer");
    expect(streams.out()).toContain("confidence_calibration");
  });

  it("rejects an unknown eval option with the eval usage", async () => {
    const streams = capture();
    const code = await run(["eval", "--bogus"], streams.io);

    expect(code).toBe(EXIT_USAGE);
    expect(streams.err()).toContain("eval: unknown option: --bogus");
  });
});
