# @pagepace/segmenter

Pure, deterministic sentence and word segmentation for Portuguese and English.
No I/O, no randomness: the same text always produces the same spans. Used by
the extractor (paragraph/footnote work), by the evaluation harness
(`sentence_f1`) and later by the reader app and TTS.

Words are intentionally **not** part of the `Book` model (ADR-012): the model
stores blocks of styled runs, and this package tokenizes them on demand.
Reading position = `(blockId, wordIndex)`.

## Use it inside the monorepo

Save as `example.ts` in the repository root and run it with `tsx`:

```ts
import { splitSentences, splitWords } from "./packages/segmenter/src/index.ts";

const text = "O Sr. Silva visitou São Paulo. Ele voltou ontem, mas não disse nada. Foi claro?";
const sentences = splitSentences(text, { lang: "pt" });
for (const span of sentences) console.log(JSON.stringify(text.slice(span.start, span.end)));
console.log(splitWords(text).length, "word tokens");
```

```bash
pnpm exec tsx example.ts
# "O Sr. Silva visitou São Paulo."
# "Ele voltou ontem, mas não disse nada."
# "Foi claro?"
# 15 word tokens
```

`splitSentences(text, { lang, maxSpanLength? })` returns half-open `[start, end)`
offsets (the span cap defaults to `DEFAULT_MAX_SPAN_LENGTH`; pass `Infinity` to
disable it — invariants are tested in `properties.test.ts`).

## Main exports

- `splitSentences(text, options)` → `SentenceSpan[]`
- `splitWords(text)` → `WordToken[]` (punctuation attached, with offsets)
- `DEFAULT_MAX_SPAN_LENGTH`, types `SegmentLang`, `SplitSentencesOptions`, `SentenceSpan`, `WordToken`

## Test it

```bash
pnpm vitest run packages/segmenter   # 4 files, 181 tests
```

The corpus-level metric (`sentence_f1`, target ≥ 0.97) is measured by
`pnpm eval` on the annotated texts in `corpus/sentences/`.

## Docs

[docs/extractor/phases/SEG-segmenter.md](../../docs/extractor/phases/SEG-segmenter.md) (phase record)
· [corpus/README.md](../../corpus/README.md) (annotated sentence corpus)
· [docs/extractor/EVALUATION.md](../../docs/extractor/EVALUATION.md).
