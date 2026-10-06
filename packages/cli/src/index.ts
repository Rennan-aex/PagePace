import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { ingestPdfjs, SCANNED_PDF_MESSAGE, ScannedPdfError } from "@pagepace/extractor";

export const PACKAGE_NAME = "@pagepace/cli";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_SCANNED = 3;

export interface CliIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

const USAGE = `Uso:
  pnpm pagepace dump-raw <arquivo.pdf> [--pages 1-5]
  pnpm pagepace --help`;

export const HELP = `pagepace — extrator de PDF do PagePace

Uso:
  pnpm pagepace dump-raw <arquivo.pdf> [--pages 1-5]
  pnpm pagepace --help

Comandos:
  dump-raw <arquivo.pdf>   Lê o PDF e escreve o RawDocument (JSON) no console

Opções:
  --pages 1-5              Só as páginas de 1 a 5 (1-based, inclusivo)
  --pages 3                Só a página 3
  -h, --help               Mostra esta ajuda

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
    file = arg;
  }

  if (file === undefined) {
    io.err(`Falta o arquivo PDF.\n\n${USAGE}\n`);
    return EXIT_USAGE;
  }

  let bytes: Uint8Array;
  try {
    // pdf.js rejects a Node `Buffer` even though it extends `Uint8Array`.
    bytes = new Uint8Array(await readFile(file));
  } catch (error) {
    io.err(describeReadError(file, error));
    return EXIT_ERROR;
  }

  try {
    const document = await ingestPdfjs(bytes, { fileName: basename(file), pageRange });
    io.out(`${JSON.stringify(document, null, 2)}\n`);
    return EXIT_OK;
  } catch (error) {
    if (error instanceof ScannedPdfError) {
      io.err(`${SCANNED_PDF_MESSAGE}\n`);
      return EXIT_SCANNED;
    }
    if (error instanceof RangeError) {
      io.err(`Faixa de páginas inválida: ${messageOf(error)}\n`);
      return EXIT_USAGE;
    }
    io.err(describeIngestError(file, error));
    return EXIT_ERROR;
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
  io.err(`Comando desconhecido: ${command}\n\n${USAGE}\n`);
  return EXIT_USAGE;
}
