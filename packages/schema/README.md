# @pagepace/schema

The data contract of PagePace — shared by every other package and by the app.
It defines the intermediate formats (`RawDocument` coming out of ingestion,
`Book` coming out of the extractor, `Overlay`/`Anchor` for reader corrections)
as TypeScript types plus `zod` runtime validators, and applies reader overlays
with re-anchoring. No file I/O, no extraction logic.

## Use it inside the monorepo

Save as `example.ts` in the repository root and run it with `tsx` (no build step):

```ts
import { BLOCK_KINDS, blockText, parseBook } from "./packages/schema/src/index.ts";

const book = parseBook({
  schemaVersion: "1.2.0",
  id: "0".repeat(64),
  source: { fileName: "demo.pdf", pageCount: 1 },
  metadata: { language: "en" },
  toc: [],
  blocks: [
    {
      id: "p0-0-aaaa",
      kind: "paragraph",
      runs: [{ text: "Hello, ", bold: true }, { text: "world." }],
      origin: { pageFrom: 0, pageTo: 0 },
      confidence: 1,
      flags: [],
    },
  ],
  extraction: { tool: "demo", version: "0.0.0", avgConfidence: 1, warnings: [] },
});

console.log("block kinds:", BLOCK_KINDS.length, "-", BLOCK_KINDS.join(" "));
console.log("parsed", book.blocks.length, "block(s):", blockText(book.blocks[0]));
```

```bash
pnpm exec tsx example.ts
# block kinds: 13 - heading paragraph blockquote epigraph list_item footnote reference caption figure table equation code margin_ref
# parsed 1 block(s): Hello, world.
```

Objects are strict: unknown keys are rejected, so a schema change is always a
deliberate, versioned decision.

## Main exports

- Validators: `parseRawDocument`, `parseBook`, `parseOverlay`, `parseAnchor`, `parseWith` / `safeParseWith`, `SchemaValidationError`.
- Schemas: `rawDocumentSchema`, `bookSchema`, `overlaySchema`, `anchorSchema`, `blockSchema`, `BLOCK_KINDS`.
- Overlay: `applyOverlay(book, overlay)` → `{ book, unapplied }`, `blockText(block)`.

## Test it

```bash
pnpm vitest run packages/schema   # 71 tests
```

## Docs

[docs/extractor/SCHEMA.md](../../docs/extractor/SCHEMA.md) (contract, versioning,
changelog) · [docs/extractor/ARCHITECTURE.md](../../docs/extractor/ARCHITECTURE.md).
