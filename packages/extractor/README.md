# @pagepace/extractor

The extraction core: turns PDF bytes into a structured, reflowable `Book`
(headings, paragraphs, notes, styles, reading order, confidence). Seven pure
layers — ingestion (pdf.js), normalization, layout, semantics, inline styles,
cross-page join, output — composed by `pipeline.ts`. Portable core: file access
lives only in adapters and in `@pagepace/cli`.

## Use it inside the monorepo

Save as `example.ts` in the repository root (it reads one of the two PDFs
committed in `corpus/vendored/`) and run it with `tsx`:

```ts
import { readFile } from "node:fs/promises";
import { buildBook, documentStats, ingestPdfjs } from "./packages/extractor/src/index.ts";

const bytes = new Uint8Array(await readFile("corpus/vendored/n3-pt-scielo-wittgenstein.pdf"));
const raw = await ingestPdfjs(bytes, {
  fileName: "n3-pt-scielo-wittgenstein.pdf",
  pageRange: { from: 1, to: 2 },
});
const stats = documentStats(raw);
const book = buildBook(raw);
console.log("pages:", raw.pages.length, "| text items:", stats.itemsMeasured, "| blocks:", book.blocks.length);
console.log("language:", book.metadata.language, "| avgConfidence:", book.extraction.avgConfidence);
```

```bash
pnpm exec tsx example.ts
# pages: 2 | text items: 165 | blocks: 22
# language: pt | avgConfidence: 0.87
```

`ingestPdfjs` needs a `Uint8Array` (not a Node `Buffer`); a PDF with no text
layer throws `ScannedPdfError` (ADR-018).

## Main exports

- Ingestion: `ingestPdfjs`, `ingestOcrFlow`, `createTesseractOcrEngine`, `sha256Hex`.
- Pipeline: `extractStream` (async iterator per page), `buildBook`, `extractCached` + cache helpers.
- Explainability: `explainPage`, `documentStats`, `renderPageRegion`, `blockId`.
- Detectors used by tests and the CLI: `detectColumns`, `detectEndnotes`, `brokenFontSignal`, plus their named parameters.

## Test it

```bash
pnpm vitest run packages/extractor   # 62 files, 748 tests
```

Some acceptance tests run only with `corpus/public` or `CORPUS_PRIVATE_DIR`
set (see [tests/README.md](../../tests/README.md)).

## Docs

[docs/extractor/ARCHITECTURE.md](../../docs/extractor/ARCHITECTURE.md) (layers)
· [docs/extractor/SCHEMA.md](../../docs/extractor/SCHEMA.md) (output)
· [docs/extractor/EVALUATION.md](../../docs/extractor/EVALUATION.md) (metrics).
