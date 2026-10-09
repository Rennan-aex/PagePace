import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SCANNED_PDF_MESSAGE } from "@pagepace/extractor";
import { parseBook } from "@pagepace/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPdf, textStream } from "../../extractor/test/minipdf";
import { EXIT_ERROR, EXIT_OK, EXIT_SCANNED, EXIT_USAGE, HELP, run } from "./index";

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
    expect(document.schemaVersion).toBe("1.1.0");
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
    expect(streams.err()).toBe("");
    const book = parseBook(JSON.parse(streams.out()));
    expect(book.schemaVersion).toBe("1.1.0");
    expect(book.source).toEqual({ fileName: "extract.pdf", pageCount: 1 });
    expect(book.blocks.length).toBeGreaterThan(0);
    expect(book.blocks.every((block) => block.kind === "paragraph")).toBe(true);
    expect(book.blocks[0]?.origin).toEqual({ pageFrom: 0, pageTo: 0 });
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
