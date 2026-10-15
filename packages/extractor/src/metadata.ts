import type { Block, Book, RawDocument } from "@pagepace/schema";

/**
 * Document metadata (E4-T04 — layer 4, "semântica"): what fills
 * `Book.metadata` — title, authors and language.
 *
 * Language is decided over the block text with two tiny stopword lexicons
 * (pt and en, accent-folded and disjoint by construction — the same
 * philosophy as the hyphenation lexicons of `hyphen.ts`), combined with the
 * free-form `source.lang` hint the PDF itself declares (`/Lang`). The text
 * decides whenever one language has enough hits; both languages strong and
 * close together is `mixed`; a sample too small to speak falls back to the
 * hint and then to `unknown`. The lexicons count function words only, so a
 * quotation or an English abstract inside a Portuguese book does not flip
 * the document — measured over the whole corpus before this task closed.
 *
 * Title and authors come from the PDF's own `Info.Title`/`Info.Author`
 * claims (the producer's word, not truth, S1 §3): blank strings, overlong
 * titles and values equal to the file name are discarded. There is no
 * content-based detection yet — a book without PDF info leaves the fields
 * absent.
 *
 * Known limits: `mixed` is defined by ratio, not by pages; a document
 * written in a third language with a few pt/en words still lands on the
 * stronger side or on `unknown`; authors split on `;` only.
 */

/** Function words distinctive of Portuguese (folded, disjoint from the English set). */
export const LANGUAGE_STOPWORDS_PT: ReadonlySet<string> = new Set([
  "ainda",
  "alguem",
  "apenas",
  "apos",
  "aquela",
  "aquelas",
  "aquele",
  "aqueles",
  "aquilo",
  "atraves",
  "cada",
  "com",
  "como",
  "conforme",
  "contra",
  "coisa",
  "coisas",
  "da",
  "das",
  "de",
  "dela",
  "dele",
  "delas",
  "deles",
  "desde",
  "disse",
  "dizia",
  "do",
  "dos",
  "durante",
  "e",
  "ela",
  "elas",
  "ele",
  "eles",
  "embora",
  "em",
  "entretanto",
  "era",
  "eram",
  "esta",
  "estao",
  "estas",
  "estavam",
  "este",
  "estes",
  "eu",
  "fazer",
  "feito",
  "foi",
  "foram",
  "ha",
  "havia",
  "isto",
  "isso",
  "lhe",
  "lhes",
  "mais",
  "mas",
  "mediante",
  "meu",
  "meus",
  "minha",
  "minhas",
  "muita",
  "muitas",
  "muito",
  "muitos",
  "na",
  "nao",
  "nas",
  "nela",
  "nele",
  "nelas",
  "neles",
  "nem",
  "ninguem",
  "no",
  "nos",
  "num",
  "numa",
  "outra",
  "outras",
  "outro",
  "outros",
  "pela",
  "pelas",
  "pelo",
  "pelos",
  "perante",
  "por",
  "porque",
  "portanto",
  "pois",
  "quando",
  "que",
  "se",
  "seja",
  "sejam",
  "segundo",
  "sem",
  "sera",
  "seu",
  "seus",
  "sob",
  "sobre",
  "somente",
  "sua",
  "suas",
  "talvez",
  "tambem",
  "tem",
  "tinha",
  "todavia",
  "todas",
  "todos",
  "tudo",
  "um",
  "uma",
  "umas",
  "uns",
  "vai",
  "vamos",
  "vao",
  "voce",
  "voces",
]);

/** Function words distinctive of English (folded, disjoint from the Portuguese set). */
export const LANGUAGE_STOPWORDS_EN: ReadonlySet<string> = new Set([
  "above",
  "after",
  "again",
  "against",
  "along",
  "already",
  "also",
  "although",
  "always",
  "among",
  "an",
  "and",
  "another",
  "anyone",
  "anything",
  "are",
  "around",
  "at",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "cannot",
  "could",
  "did",
  "does",
  "doing",
  "during",
  "each",
  "either",
  "enough",
  "even",
  "ever",
  "every",
  "everything",
  "following",
  "for",
  "from",
  "had",
  "has",
  "have",
  "having",
  "hence",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "however",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "many",
  "may",
  "might",
  "mine",
  "more",
  "most",
  "much",
  "must",
  "my",
  "myself",
  "never",
  "nor",
  "nothing",
  "of",
  "often",
  "on",
  "once",
  "only",
  "onto",
  "or",
  "other",
  "others",
  "our",
  "ours",
  "ourselves",
  "over",
  "own",
  "perhaps",
  "quite",
  "rather",
  "really",
  "same",
  "several",
  "she",
  "should",
  "since",
  "some",
  "something",
  "sometimes",
  "still",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "therefore",
  "these",
  "they",
  "thing",
  "those",
  "though",
  "through",
  "thus",
  "to",
  "toward",
  "towards",
  "under",
  "until",
  "up",
  "upon",
  "us",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "whether",
  "which",
  "while",
  "who",
  "whom",
  "whose",
  "why",
  "will",
  "with",
  "within",
  "without",
  "would",
  "you",
  "your",
  "yours",
]);

/** Below this many characters the lexical signal is not worth counting. */
export const LANGUAGE_MIN_SAMPLE_CHARS = 120;
/** Hits a language needs (over the whole text) before it can win or go `mixed`. */
export const LANGUAGE_MIN_HITS = 8;
/** Both languages need at least this many hits to call the document `mixed`. */
export const LANGUAGE_MIXED_MIN_HITS = 12;
/** Ratio ceiling for `mixed`: `hi < lo * ratio` keeps both languages in the game. */
export const LANGUAGE_MIXED_MAX_RATIO = 2;
/** Longest accepted `Info.Title` after whitespace collapse. */
export const TITLE_MAX_CHARS = 200;
/** Cap on authors split from `Info.Author` (runaway metadata guard). */
export const AUTHOR_MAX_COUNT = 20;

const combiningMarks = /\p{M}+/gu;

/** Lowercase and strip diacritics so the folded lexicons match real text. */
export function foldForLanguage(word: string): string {
  return word.toLowerCase().normalize("NFD").replace(combiningMarks, "");
}

const edges = /[^\p{L}\p{N}]+/gu;

function languageWords(text: string): string[] {
  return text
    .split(edges)
    .map((word) => foldForLanguage(word))
    .filter((word) => word !== "");
}

/** ISO 639-2 aliases a producer may use instead of the 639-1 subtag. */
const LANG_PRIMARY_ALIASES: Readonly<Record<string, "pt" | "en">> = { por: "pt", eng: "en" };

/** The primary subtag of a free-form `/Lang` value, when it is pt or en. */
export function langHintOf(lang: string | undefined): "pt" | "en" | undefined {
  if (typeof lang !== "string") return undefined;
  const [primary] = foldForLanguage(lang).trim().split(/[-_]/);
  if (primary === "pt" || primary === "en") return primary;
  return primary === undefined ? undefined : LANG_PRIMARY_ALIASES[primary];
}

/**
 * `pt` / `en` / `mixed` / `unknown` from the document text and the PDF's
 * `/Lang` hint. Pure and deterministic: same text, same answer.
 */
export function detectLanguage(text: string, langHint?: string): Book["metadata"]["language"] {
  if (text.trim().length < LANGUAGE_MIN_SAMPLE_CHARS) return langHintOf(langHint) ?? "unknown";
  let pt = 0;
  let en = 0;
  for (const word of languageWords(text)) {
    if (LANGUAGE_STOPWORDS_PT.has(word)) pt += 1;
    else if (LANGUAGE_STOPWORDS_EN.has(word)) en += 1;
  }
  const hi = Math.max(pt, en);
  const lo = Math.min(pt, en);
  if (hi < LANGUAGE_MIN_HITS) return langHintOf(langHint) ?? "unknown";
  if (lo >= LANGUAGE_MIXED_MIN_HITS && hi < lo * LANGUAGE_MIXED_MAX_RATIO) return "mixed";
  return pt >= en ? "pt" : "en";
}

/**
 * The PDF's `Info.Title` as a book title: whitespace collapsed, blank and
 * file-name-shaped values discarded (producer noise, S1 §3).
 */
export function sanitizePdfTitle(raw: string | undefined, fileName?: string): string | undefined {
  if (typeof raw !== "string") return undefined;
  const title = raw.replace(/\s+/g, " ").trim();
  if (title === "" || title.length > TITLE_MAX_CHARS) return undefined;
  // A URL is a download location, not a book title (measured: n1-en-sofia).
  if (title.includes("://")) return undefined;
  const lower = title.toLowerCase();
  const file = (fileName ?? "").toLowerCase();
  if (file !== "" && (lower === file || lower === file.replace(/\.[^.]+$/, ""))) return undefined;
  return title;
}

/** The PDF's `Info.Author` split on `;`, blanks dropped, count capped. */
export function splitPdfAuthors(raw: string | undefined): string[] | undefined {
  if (typeof raw !== "string") return undefined;
  const parts = raw
    .split(";")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part !== "")
    .slice(0, AUTHOR_MAX_COUNT);
  return parts.length > 0 ? parts : undefined;
}

/** `Book.metadata` from the blocks built by this document and the raw PDF claims. */
export function buildMetadata(
  blocks: readonly Block[],
  source: RawDocument["source"],
): Book["metadata"] {
  const text = blocks.map((block) => block.runs.map((run) => run.text).join("")).join(" ");
  const language = detectLanguage(text, source.lang);
  const title = sanitizePdfTitle(source.title, source.fileName);
  const authors = splitPdfAuthors(source.author);
  return {
    ...(title !== undefined ? { title } : {}),
    ...(authors !== undefined ? { authors } : {}),
    language,
  };
}
