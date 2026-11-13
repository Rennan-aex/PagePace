# tests/

How the test suites of PagePace are organised and how to run them.

## Where the tests live

| Kind | Where | Runner |
|---|---|---|
| Unit and integration tests | next to the code: `packages/*/src/**/*.test.ts` | `pnpm test` |
| PDF/fixture tests (real pages, synthetic PDFs, fonts) | `packages/*/test/*.test.ts` (+ fixtures such as `packages/extractor/test/minipdf.ts` and `packages/extractor/test/fonts/`) | `pnpm test` |
| Golden tests (expected output) | `corpus/golden/*.golden.json`, asserted by tests in `packages/eval/src/` | `pnpm test` and `pnpm eval` |
| Corpus evaluation (metrics vs baseline) | `packages/eval/` + `corpus/` | `pnpm eval` |
| Manual visual checklists | `tests/manual/` (human runs them at the end of a milestone) | by hand |

Vitest is configured in [`vitest.config.ts`](../vitest.config.ts); it includes
`packages/*/src/**/*.test.ts` and `packages/*/test/**/*.test.ts`.

## Commands

```bash
pnpm test                      # the whole suite once (93 files, 1406 tests, ~35 s)
pnpm test:watch                # watch mode
pnpm vitest run packages/extractor   # only one package (schema | extractor | segmenter | eval | cli)
pnpm verify                    # typecheck + lint + format + tests + no-PDF check + docs budget

pnpm eval                      # measure the corpus, print the tables (exit 0)
pnpm eval --diff               # same run compared with the baseline, informational (exit 0)
pnpm eval --ci                 # the gate: exit 1 if any metric worsens by more than 0.002
pnpm eval --update-baseline    # rewrite packages/eval/baseline.json with this run
```

**When `--update-baseline` is allowed:** only together with the change that
improved the metrics, in the same pull request — never to hide a regression, and
never when a document failed or nothing was measured (the command refuses).
It cannot be combined with `--ci`/`--diff` (exit 2). A *worsening* baseline
update requires an ADR in [`docs/extractor/DECISIONS.md`](../docs/extractor/DECISIONS.md)
first (the golden rule of metrics, ADR-008). Details:
[`docs/extractor/EVALUATION.md`](../docs/extractor/EVALUATION.md).

## Tests that skip without a corpus

Two inputs are **not** in the repository:

- **Public PDFs** — downloaded by `pnpm corpus:fetch` into the gitignored
  `corpus/public/`. Tests that need one check `existsSync(...)` and skip
  (`it.skipIf`) until the file is there.
- **Private PDFs** — copyrighted books live outside the repo, pointed at by the
  `CORPUS_PRIVATE_DIR` environment variable (or `.env`). Acceptance tests named
  “… skipped without `$CORPUS_PRIVATE_DIR`” skip when it is absent.

They skip (they never fail) because **no PDF may be committed** except the two
CC BY SciELO articles in `corpus/vendored/`. A checkout without the private
corpus still runs every unit test, every synthetic golden test and the whole
public corpus; `pnpm eval` simply reports fewer documents. The tesseract OCR
tests need the `@tesseract.js-data` models from the devDependencies — they run
after a normal `pnpm install`.

## How this connects to CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs, on every pull
request and on `main`: `lint`, `format:check`, `typecheck`, `pnpm corpus:fetch`
(restored from a cache keyed by `corpus/manifest.yaml`), **`pnpm test`**,
`check:no-pdf` (no PDF outside `corpus/vendored/`), `check:docs` (documentation
budget), **`pnpm eval --ci`** (the metric gate) and **`pnpm bench --ci`**
(speed/memory alarm, informational). A pull request cannot merge with a red
`verify`.

Manual checklists in [`tests/manual/`](manual/) are the human half: visual
verification that no automated metric covers (layout on a real screen, Android
performance).
