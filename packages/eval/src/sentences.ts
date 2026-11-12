// Annotated sentence corpus and `sentence_f1` runner (SEG-T05).
//
// The corpus lives in `corpus/sentences/*.json`: one JSON per public-domain
// document with the annotated sentences. The text handed to the segmenter is
// the sentences joined by a single space, so the annotation and the metric
// share the very same character stream (see ADR-108).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SegmentLang } from "@pagepace/segmenter";
import { splitSentences } from "@pagepace/segmenter";
import { type SentenceF1Result, sentenceF1 } from "./metrics";

/** Repository-relative directory of the annotated corpus (SEG-T05). */
export const SENTENCE_CORPUS_DIR = "corpus/sentences";

export const SENTENCE_CORPUS_FORMAT = 1;

/** Acceptance goal of SEG-T05: common prose must reach this `sentence_f1`. */
export const SENTENCE_F1_TARGET = 0.97;

export class SentenceCorpusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SentenceCorpusError";
  }
}

export interface SentenceCorpusEntry {
  id: string;
  lang: SegmentLang;
  /** Public-domain citation (author, work, edition). */
  source: string;
  /** The annotated sentences, in reading order. */
  sentences: string[];
  /** `sentences.join(" ")`: what the segmenter receives. */
  text: string;
  /** Trimmed ends of every sentence but the last, the reference breaks. */
  boundaries: number[];
}

export interface SentenceDocumentResult {
  id: string;
  lang: SegmentLang;
  source: string;
  /** Number of annotated sentences. */
  sentences: number;
  /** Number of reference breaks (sentences - 1). */
  boundaries: number;
  result: SentenceF1Result;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CLOSERS_PATTERN = /["'\u201d\u2019\u00bb)\]}]$/u;
const TERMINATOR_PATTERN = /[.!?\u2026]$/u;

function fail(source: string, message: string): never {
  throw new SentenceCorpusError(`${source}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a sentence ends with a terminator, optionally followed by closers. */
function endsWithTerminator(sentence: string): boolean {
  let text = sentence.trimEnd();
  while (CLOSERS_PATTERN.test(text)) text = text.slice(0, -1);
  return TERMINATOR_PATTERN.test(text);
}

/**
 * Parses one annotated document. Strict: unknown keys, a wrong format, an
 * unsupported language, an empty or unterminated sentence are errors with the
 * file name (never silently skipped, ADR-036 style).
 */
export function parseSentenceCorpus(text: string, source: string): SentenceCorpusEntry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(source, `invalid JSON (${message})`);
  }
  if (!isRecord(parsed)) fail(source, "the top level must be an object");

  for (const key of Object.keys(parsed)) {
    if (
      key !== "format" &&
      key !== "id" &&
      key !== "lang" &&
      key !== "source" &&
      key !== "sentences"
    ) {
      fail(source, `unknown key "${key}"`);
    }
  }
  if (parsed.format !== SENTENCE_CORPUS_FORMAT) {
    fail(
      source,
      `format ${JSON.stringify(parsed.format)} is not supported (expected ${SENTENCE_CORPUS_FORMAT})`,
    );
  }
  const id = parsed.id;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    fail(source, `"id" must be a non-empty identifier like "seg-pt-livro"`);
  }
  const lang = parsed.lang;
  if (lang !== "pt" && lang !== "en") {
    fail(source, `"lang" must be "pt" or "en", got ${JSON.stringify(lang)}`);
  }
  const citation = parsed.source;
  if (typeof citation !== "string" || citation.trim() === "") {
    fail(source, `"source" must be a non-empty public-domain citation`);
  }
  if (!Array.isArray(parsed.sentences) || parsed.sentences.length === 0) {
    fail(source, `"sentences" must be a non-empty array of strings`);
  }
  const sentences: string[] = [];
  for (const [index, sentence] of parsed.sentences.entries()) {
    if (typeof sentence !== "string" || sentence.trim() === "") {
      fail(source, `sentences[${index}] must be a non-empty string`);
    }
    if (sentence !== sentence.trim()) {
      fail(source, `sentences[${index}] must not start or end with whitespace`);
    }
    if (!endsWithTerminator(sentence)) {
      fail(source, `sentences[${index}] does not end with a sentence terminator: ${sentence}`);
    }
    sentences.push(sentence);
  }

  const flat = sentences.join(" ");
  const boundaries: number[] = [];
  let offset = 0;
  for (const [index, sentence] of sentences.entries()) {
    offset += sentence.length;
    if (index < sentences.length - 1) boundaries.push(offset);
    offset += 1; // the joining space
  }
  if (offset - 1 !== flat.length) fail(source, "internal offset mismatch while joining sentences");

  return { id, lang, source: citation, sentences, text: flat, boundaries };
}

/**
 * Reads every `*.json` of `<repoRoot>/corpus/sentences`, sorted by file name, so
 * the run is deterministic. A missing directory is not an error (a temporary
 * repository in the tests has none); a broken file is.
 */
export async function loadSentenceCorpus(repoRoot: string): Promise<SentenceCorpusEntry[]> {
  const dir = path.join(repoRoot, ...SENTENCE_CORPUS_DIR.split("/"));
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const entries: SentenceCorpusEntry[] = [];
  const seen = new Set<string>();
  for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
    const source = `${SENTENCE_CORPUS_DIR}/${file}`;
    const entry = parseSentenceCorpus(await readFile(path.join(dir, file), "utf8"), source);
    if (`${entry.id}.json` !== file) {
      fail(source, `"id" must match the file name ("${entry.id}.json")`);
    }
    if (seen.has(entry.id)) fail(source, `duplicate id "${entry.id}"`);
    seen.add(entry.id);
    entries.push(entry);
  }
  return entries;
}

/** Runs the segmenter on one annotated document and compares the breaks. */
export function evaluateSentenceDocument(entry: SentenceCorpusEntry): SentenceDocumentResult {
  const spans = splitSentences(entry.text, { lang: entry.lang });
  // The break at the end of the text is not a decision: drop it on both sides.
  const hypothesis = spans.map((span) => span.end).filter((offset) => offset !== entry.text.length);
  return {
    id: entry.id,
    lang: entry.lang,
    source: entry.source,
    sentences: entry.sentences.length,
    boundaries: entry.boundaries.length,
    result: sentenceF1(entry.boundaries, hypothesis),
  };
}

/** `sentence_f1` of every annotated document, in corpus order. */
export function evaluateSentenceCorpus(
  entries: readonly SentenceCorpusEntry[],
): SentenceDocumentResult[] {
  return entries.map(evaluateSentenceDocument);
}

/** Mean `sentence_f1` over the documents (1 when the corpus is empty). */
export function meanSentenceF1(results: readonly SentenceDocumentResult[]): number {
  if (results.length === 0) return 1;
  return results.reduce((total, item) => total + item.result.f1, 0) / results.length;
}
