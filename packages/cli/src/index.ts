import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { runEvalCli } from "@pagepace/eval";
import {
  BookError,
  buildBook,
  documentStats,
  ExplainPageError,
  explainPage,
  ingestPdfjs,
  SCANNED_PDF_MESSAGE,
  ScannedPdfError,
  StatsError,
} from "@pagepace/extractor";
import { SchemaValidationError } from "@pagepace/schema";
import { renderPagesPng } from "./render-pdf";
import {
  formatExplainText,
  formatInspectHtml,
  formatInspectMarkdown,
  formatInspectText,
  inspectModel,
  normalizeCliPath,
} from "./report";

export const PACKAGE_NAME = "@pagepace/cli";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_SCANNED = 3;

export interface CliIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

type RawDocument = Awaited<ReturnType<typeof ingestPdfjs>>;

const USAGE = `Uso:
  pnpm pagepace dump-raw <arquivo.pdf> [--pages 1-5]
  pnpm pagepace extract <arquivo.pdf>
  pnpm pagepace inspect <arquivo.pdf> [--pages 1-5] [--format text|md|html] [--out <arquivo>]
  pnpm pagepace explain-page <arquivo.pdf> <n>
  pnpm pagepace eval [--diff|--ci|--update-baseline]
  pnpm pagepace --help`;

export const HELP = `pagepace — extrator de PDF do PagePace

Uso:
  pnpm pagepace dump-raw <arquivo.pdf> [--pages 1-5]
  pnpm pagepace extract <arquivo.pdf>
  pnpm pagepace inspect <arquivo.pdf> [--pages 1-5] [--format text|md|html] [--out <arquivo>]
  pnpm pagepace explain-page <arquivo.pdf> <n>
  pnpm pagepace eval [--diff|--ci|--update-baseline]
  pnpm pagepace --help

Comandos:
  dump-raw <arquivo.pdf>    Lê o PDF e escreve o RawDocument (JSON) no console
  extract <arquivo.pdf>     Gera o Book (JSON) e escreve no console
  inspect <arquivo.pdf>     Relatório da extração: resumo do documento e os blocos
                            de cada página, com tipo, confiança e flags de dúvida
  explain-page <pdf> <n>    Explica a página n (1-based): a decisão de cada camada
                            (colunas, margin-ref, heading, footnote, quote, lista,
                            hífen etc.) parágrafo a parágrafo
  eval                      Roda a avaliação do corpus contra os gabaritos
                            (mesmas opções de pnpm eval: --diff, --ci,
                            --update-baseline)

Opções:
  --pages 1-5               Só as páginas de 1 a 5 (1-based, inclusivo)
  --pages 3                 Só a página 3
  --format text             Relatório em texto no console (padrão do inspect)
  --format md               Relatório Markdown, com a página original ao lado dos
                            blocos; exige --out e grava as imagens numa pasta
                            <arquivo>-inspect/ ao lado do .md
  --format html             Relatório HTML lado a lado com as imagens embutidas;
                            exige --out
  --out <arquivo>           Grava o relatório em arquivo em vez do console
  -h, --help                Mostra esta ajuda

Códigos de saída:
  0  sucesso
  1  erro de leitura (arquivo ausente ou PDF inválido)
  2  uso incorreto (comando, opção ou valor desconhecidos)
  3  PDF escaneado: sem camada de texto — mensagem da ADR-018, sem JSON

Salvando em arquivo:
  o pnpm imprime um cabeçalho no console; acrescente -s para o JSON sair limpo:
  pnpm -s pagepace dump-raw livro.pdf > livro.json
`;

interface PageRange {
  from: number;
  to: number;
}

function parsePages(value: string): PageRange | null {
  const match = /^(\d+)(?:-(\d+))?$/.exec(value.trim());
  const first = match?.[1];
  if (!match || first === undefined) return null;
  const from = Number(first);
  const last = match[2];
  const to = last === undefined ? from : Number(last);
  if (from < 1 || to < from) return null;
  return { from, to };
}

function pagesOfRange(range: PageRange, pageCount: number): number[] {
  const to = Math.min(range.to, pageCount);
  const pages: number[] = [];
  for (let page = range.from; page <= to; page++) pages.push(page);
  return pages;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function describeReadError(file: string, error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT") return `Arquivo não encontrado: ${file}\n`;
  if (code === "EISDIR") return `É uma pasta, não um arquivo: ${file}\n`;
  if (code === "EACCES") return `Sem permissão para ler o arquivo: ${file}\n`;
  return `Não foi possível ler ${file}: ${messageOf(error)}\n`;
}

function describeIngestError(file: string, error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "PasswordException") return `PDF protegido por senha: ${file}\n`;
  if (name === "InvalidPDFException") return `Não é um PDF válido: ${file}\n`;
  return `Falha ao ler ${file}: ${messageOf(error)}\n`;
}

type LoadResult = { document: RawDocument; bytes: Uint8Array } | { error: string; code: number };

async function loadBytes(file: string): Promise<Uint8Array | { error: string; code: number }> {
  try {
    // pdf.js rejects a Node `Buffer` even though it extends `Uint8Array`.
    return new Uint8Array(await readFile(file));
  } catch (error) {
    return { error: describeReadError(file, error), code: EXIT_ERROR };
  }
}

async function loadDocument(file: string, pageRange?: PageRange): Promise<LoadResult> {
  const bytes = await loadBytes(file);
  if ("error" in bytes) return bytes;
  try {
    const document = await ingestPdfjs(bytes, { fileName: basename(file), pageRange });
    return { document, bytes };
  } catch (error) {
    if (error instanceof ScannedPdfError) {
      return { error: `${SCANNED_PDF_MESSAGE}\n`, code: EXIT_SCANNED };
    }
    if (error instanceof RangeError) {
      return { error: `Faixa de páginas inválida: ${messageOf(error)}\n`, code: EXIT_USAGE };
    }
    return { error: describeIngestError(file, error), code: EXIT_ERROR };
  }
}

async function writeOrOut(io: CliIo, out: string | undefined, text: string): Promise<number> {
  if (out === undefined) {
    io.out(text);
    return EXIT_OK;
  }
  try {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, text, "utf8");
    io.err(`Relatório gravado em ${out}\n`);
    return EXIT_OK;
  } catch (error) {
    io.err(`Não foi possível gravar ${out}: ${messageOf(error)}\n`);
    return EXIT_ERROR;
  }
}

async function dumpRaw(args: readonly string[], io: CliIo): Promise<number> {
  let file: string | undefined;
  let pageRange: PageRange | undefined;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index] as string;
    if (arg === "-h" || arg === "--help") {
      io.out(HELP);
      return EXIT_OK;
    }
    if (arg === "--pages" || arg.startsWith("--pages=")) {
      const inline = arg.startsWith("--pages=") ? arg.slice("--pages=".length) : undefined;
      const value = inline ?? args[index + 1];
      if (inline === undefined) index++;
      const parsed = value === undefined ? null : parsePages(value);
      if (!parsed) {
        io.err(
          `Valor inválido para --pages: ${value ?? "(valor ausente)"}. Use --pages 1-5 ou --pages 3.\n`,
        );
        return EXIT_USAGE;
      }
      pageRange = parsed;
      continue;
    }
    if (arg.startsWith("-")) {
      io.err(`Opção desconhecida: ${arg}\n\n${USAGE}\n`);
      return EXIT_USAGE;
    }
    if (file !== undefined) {
      io.err(`Só é possível ler um arquivo por vez: ${file} e ${arg}\n`);
      return EXIT_USAGE;
    }
    file = normalizeCliPath(arg);
  }

  if (file === undefined) {
    io.err(`Falta o arquivo PDF.\n\n${USAGE}\n`);
    return EXIT_USAGE;
  }

  const loaded = await loadDocument(file, pageRange);
  if ("error" in loaded) {
    io.err(loaded.error);
    return loaded.code;
  }
  io.out(`${JSON.stringify(loaded.document, null, 2)}\n`);
  return EXIT_OK;
}

interface InspectOptions {
  file: string;
  pageRange?: PageRange;
  format: "text" | "md" | "html";
  out?: string;
}

function parseInspectArgs(args: readonly string[]): InspectOptions | { error: string } {
  let file: string | undefined;
  let pageRange: PageRange | undefined;
  let format: InspectOptions["format"] = "text";
  let out: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index] as string;
    if (arg === "-h" || arg === "--help") return { error: "" };
    if (arg === "--pages" || arg.startsWith("--pages=")) {
      const inline = arg.startsWith("--pages=") ? arg.slice("--pages=".length) : undefined;
      const value = inline ?? args[index + 1];
      if (inline === undefined) index++;
      const parsed = value === undefined ? null : parsePages(value);
      if (!parsed) {
        return {
          error: `Valor inválido para --pages: ${value ?? "(valor ausente)"}. Use --pages 1-5 ou --pages 3.\n`,
        };
      }
      pageRange = parsed;
      continue;
    }
    if (arg === "--format" || arg.startsWith("--format=")) {
      const inline = arg.startsWith("--format=") ? arg.slice("--format=".length) : undefined;
      const value = inline ?? args[index + 1];
      if (inline === undefined) index++;
      if (value !== "text" && value !== "md" && value !== "html") {
        return {
          error: `Formato inválido: ${value ?? "(valor ausente)"}. Use --format text, md ou html.\n`,
        };
      }
      format = value;
      continue;
    }
    if (arg === "--out" || arg.startsWith("--out=")) {
      const inline = arg.startsWith("--out=") ? arg.slice("--out=".length) : undefined;
      const value = inline ?? args[index + 1];
      if (inline === undefined) index++;
      if (value === undefined || value.startsWith("-")) {
        return { error: `Opção --out exige um caminho de arquivo.\n` };
      }
      out = normalizeCliPath(value);
      continue;
    }
    if (arg.startsWith("-")) return { error: `Opção desconhecida: ${arg}\n\n${USAGE}\n` };
    if (file !== undefined) {
      return { error: `Só é possível ler um arquivo por vez: ${file} e ${arg}\n` };
    }
    file = normalizeCliPath(arg);
  }

  if (file === undefined) return { error: `Falta o arquivo PDF.\n\n${USAGE}\n` };
  if (out !== undefined && (out === "" || dirname(out) === out)) {
    return {
      error: `Caminho de --out inválido: ${out === "" ? "(vazio)" : out}. Use um caminho de arquivo com pasta e nome, ex.: C:\\Users\\seu-nome\\relatorio.html\n`,
    };
  }
  if (format !== "text" && out === undefined) {
    return {
      error: `O formato ${format} exige --out (um caminho de arquivo).\n`,
    };
  }
  return { file, ...(pageRange === undefined ? {} : { pageRange }), format, out };
}

async function inspect(args: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseInspectArgs(args);
  if ("error" in parsed) {
    if (parsed.error === "") {
      io.out(HELP);
      return EXIT_OK;
    }
    io.err(parsed.error);
    return EXIT_USAGE;
  }

  const loaded = await loadDocument(parsed.file);
  if ("error" in loaded) {
    io.err(loaded.error);
    return loaded.code;
  }

  try {
    const book = buildBook(loaded.document);
    const stats = documentStats(loaded.document);
    const pages =
      parsed.pageRange === undefined
        ? Array.from({ length: loaded.document.source.pageCount }, (_, index) => index + 1)
        : pagesOfRange(parsed.pageRange, loaded.document.source.pageCount);
    const model = inspectModel(parsed.file, loaded.document, book, stats, pages);

    if (parsed.format === "text") {
      return await writeOrOut(io, parsed.out, formatInspectText(model));
    }

    const images = await renderPagesPng(loaded.bytes, pages);
    if (parsed.format === "html") {
      const base64 = new Map([...images].map(([page, png]) => [page, png.toString("base64")]));
      return await writeOrOut(io, parsed.out, formatInspectHtml(model, base64));
    }

    // Markdown: the PNGs live next to the .md, referenced relatively.
    const out = parsed.out as string;
    const assetDir = `${out.replace(/\.(md|markdown)$/i, "")}-inspect`;
    await mkdir(assetDir, { recursive: true });
    const imageRefs = new Map<number, string>();
    for (const [page, png] of images) {
      const imagePath = join(assetDir, `pagina-${page}.png`);
      await writeFile(imagePath, png);
      imageRefs.set(page, relative(dirname(out), imagePath).replace(/\\/g, "/"));
    }
    return await writeOrOut(io, out, formatInspectMarkdown(model, imageRefs));
  } catch (error) {
    if (error instanceof BookError || error instanceof SchemaValidationError) {
      io.err(`Não foi possível gerar o Book de ${parsed.file}: ${messageOf(error)}\n`);
      return EXIT_ERROR;
    }
    if (error instanceof StatsError) {
      io.err(`Não foi possível medir o documento ${parsed.file}: ${error.message}\n`);
      return EXIT_ERROR;
    }
    throw error;
  }
}

async function extract(args: readonly string[], io: CliIo): Promise<number> {
  let file: string | undefined;

  for (const arg of args) {
    if (arg === "-h" || arg === "--help") {
      io.out(HELP);
      return EXIT_OK;
    }
    if (arg.startsWith("-")) {
      io.err(`Opção desconhecida: ${arg}\n\n${USAGE}\n`);
      return EXIT_USAGE;
    }
    if (file !== undefined) {
      io.err(`Só é possível ler um arquivo por vez: ${file} e ${arg}\n`);
      return EXIT_USAGE;
    }
    file = normalizeCliPath(arg);
  }

  if (file === undefined) {
    io.err(`Falta o arquivo PDF.\n\n${USAGE}\n`);
    return EXIT_USAGE;
  }

  const loaded = await loadDocument(file);
  if ("error" in loaded) {
    io.err(loaded.error);
    return loaded.code;
  }

  try {
    io.out(`${JSON.stringify(buildBook(loaded.document), null, 2)}\n`);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof BookError || error instanceof SchemaValidationError) {
      io.err(`Não foi possível gerar o Book de ${file}: ${messageOf(error)}\n`);
      return EXIT_ERROR;
    }
    throw error;
  }
}

async function explainPageCommand(args: readonly string[], io: CliIo): Promise<number> {
  let file: string | undefined;
  let pageNumber: number | undefined;

  for (const arg of args) {
    if (arg === "-h" || arg === "--help") {
      io.out(HELP);
      return EXIT_OK;
    }
    if (arg.startsWith("-")) {
      io.err(`Opção desconhecida: ${arg}\n\n${USAGE}\n`);
      return EXIT_USAGE;
    }
    if (file === undefined) {
      file = normalizeCliPath(arg);
      continue;
    }
    if (pageNumber === undefined && /^\d+$/.test(arg)) {
      pageNumber = Number(arg);
      continue;
    }
    io.err(`Argumento inesperado: ${arg}\n\n${USAGE}\n`);
    return EXIT_USAGE;
  }

  if (file === undefined || pageNumber === undefined) {
    io.err(`explain-page exige o arquivo PDF e o número da página.\n\n${USAGE}\n`);
    return EXIT_USAGE;
  }

  const loaded = await loadDocument(file);
  if ("error" in loaded) {
    io.err(loaded.error);
    return loaded.code;
  }

  try {
    io.out(formatExplainText(explainPage(loaded.document, pageNumber)));
    return EXIT_OK;
  } catch (error) {
    if (error instanceof ExplainPageError) {
      io.err(`${error.message}\n`);
      return EXIT_USAGE;
    }
    if (error instanceof BookError || error instanceof SchemaValidationError) {
      io.err(`Não foi possível gerar o Book de ${file}: ${messageOf(error)}\n`);
      return EXIT_ERROR;
    }
    throw error;
  }
}

/**
 * Runs the CLI and returns the process exit code.
 *
 * `io` is injected so tests can capture the streams without spawning a
 * process; `main.ts` wires it to stdout/stderr.
 */
export async function run(argv: readonly string[], io: CliIo): Promise<number> {
  const [command, ...args] = argv;
  if (command === undefined) {
    io.err(`Nenhum comando informado.\n\n${USAGE}\n`);
    return EXIT_USAGE;
  }
  if (command === "-h" || command === "--help" || command === "help") {
    io.out(HELP);
    return EXIT_OK;
  }
  if (command === "dump-raw") return dumpRaw(args, io);
  if (command === "inspect") return inspect(args, io);
  if (command === "extract") return extract(args, io);
  if (command === "explain-page") return explainPageCommand(args, io);
  // The eval runner owns its own flags, messages and exit codes (E1-T06):
  // the CLI only dispatches, so `pagepace eval` and `pnpm eval` stay one code.
  if (command === "eval") return runEvalCli(args, io);
  io.err(`Comando desconhecido: ${command}\n\n${USAGE}\n`);
  return EXIT_USAGE;
}
