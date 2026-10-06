// Text metrics for the evaluation runner (E1-T06, ADR-035).
//
// Both sides of a comparison go through `normalizeText`, so `text_cer` only
// counts real character errors and never whitespace/Unicode artefacts of the
// PDF text layer. The metric is deterministic: same strings, same number.

/** Invisible hyphen used to break words; never part of what the reader sees. */
export const SOFT_HYPHEN = String.fromCharCode(0x00ad);

/**
 * Brings both texts to the same shape before comparing (ADR-035):
 * NFC, soft hyphens removed, every whitespace run (space, tab, NBSP, newline)
 * collapsed to one space, trimmed. Case and punctuation are kept: they are
 * real content and a wrong case is a real error.
 */
export function normalizeText(text: string): string {
  return text.normalize("NFC").split(SOFT_HYPHEN).join("").replace(/\s+/g, " ").trim();
}

/**
 * Levenshtein distance over code points (two rows, `O(n·m)` time).
 *
 * The quadratic ceiling exists because a golden covering a whole book would
 * need ~10^11 cell updates. `maxCells` fails loudly instead of hanging (the
 * fix for a huge golden is `coverage.pages`, which is the documented format).
 */
export const MAX_CER_CELLS = 200_000_000;

function editDistance(a: readonly string[], b: readonly string[]): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  let previous = new Int32Array(m + 1);
  let current = new Int32Array(m + 1);
  for (let j = 0; j <= m; j++) previous[j] = j;

  for (let i = 1; i <= n; i++) {
    current[0] = i;
    const left = a[i - 1];
    for (let j = 1; j <= m; j++) {
      const cost = left === b[j - 1] ? 0 : 1;
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      const substitution = (previous[j - 1] ?? 0) + cost;
      current[j] = Math.min(deletion, insertion, substitution);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[m] ?? 0;
}

export interface CerResult {
  /** `edits / refChars`, 0 when both sides are empty (see `textCer`). */
  cer: number;
  edits: number;
  /** Length of the normalized golden text (the denominator). */
  refChars: number;
  /** Length of the normalized extracted text. */
  hypChars: number;
}

export interface CerOptions {
  /** Cell ceiling of the edit-distance table. Defaults to `MAX_CER_CELLS`. */
  maxCells?: number;
}

/**
 * Character error rate: `editDistance(golden, extracted) / len(golden)`.
 *
 * Both arguments are raw texts; normalization happens here so every caller
 * compares the same way. An empty golden scores 0 for an empty extraction and
 * 1 for anything else (the whole extraction would be invented content).
 */
export function textCer(
  reference: string,
  hypothesis: string,
  options: CerOptions = {},
): CerResult {
  const golden = [...normalizeText(reference)];
  const extracted = [...normalizeText(hypothesis)];
  const refChars = golden.length;
  const hypChars = extracted.length;

  if (refChars === 0) {
    return { cer: hypChars === 0 ? 0 : 1, edits: hypChars, refChars, hypChars };
  }

  const maxCells = options.maxCells ?? MAX_CER_CELLS;
  if (refChars * hypChars > maxCells) {
    throw new Error(
      `textCer: comparison too large (${refChars} x ${hypChars} characters, ` +
        `limit ${maxCells} cells). Limit the golden with "coverage.pages" ` +
        `or split it into smaller documents.`,
    );
  }

  const edits = editDistance(golden, extracted);
  return { cer: edits / refChars, edits, refChars, hypChars };
}
