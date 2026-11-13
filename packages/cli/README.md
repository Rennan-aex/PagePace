# @pagepace/cli

The PagePace command line: `pnpm pagepace <command>` from the monorepo root
(run through `tsx`, no build step).

## Commands

| Command | What it does |
| --- | --- |
| `dump-raw <pdf> [--pages a-b]` | Reads the PDF and prints the `RawDocument` (JSON) |
| `extract <pdf>` | Builds the `Book` (JSON) and prints it; page progress goes to stderr; `--cache-dir`, `--memory-limit-mb`, `--ocr`, `--tessdata` available |
| `inspect <pdf> [--pages a-b] [--format text\|md\|html] [--out <file>]` | Extraction report: document summary plus every block with type, level, confidence and doubt flags; `md`/`html` show the original page beside the blocks |
| `explain-page <pdf> <n>` | Explains page `n` (1-based): the decision of each layer (columns, margin-ref, heading, footnote/endnote, quote, list, caption, reference, sidebar, hyphen, broken font, note link), paragraph by paragraph |
| `eval [--diff\|--ci\|--update-baseline]` | Runs the corpus evaluation — same options and exit codes as `pnpm eval` |
| `--help` | Full help with exit codes |

## The `--silent` warning

pnpm prints its own header before the script output. Add `-s`/`--silent` (or
redirect stderr) when you want **clean JSON** on stdout:

```bash
pnpm --silent pagepace extract corpus/vendored/n3-pt-scielo-wittgenstein.pdf > book.json
```

## Formats of `inspect`

- **`text`** (default): to the console, or to `--out report.txt`.
- **`md`**: requires `--out report.md`; writes page images to `report-inspect/page-N.png` and a side-by-side table (original × extracted).
- **`html`**: requires `--out report.html`; a single file with embedded images (base64), a two-column grid per page and doubt flags highlighted in red.

Blocks with doubt flags (`uncertain-hyphen`, `note-without-call`, …) are the
candidates for manual correction.

## Examples

```bash
# Text report of pages 1–2 of a committed corpus PDF
pnpm --silent pagepace inspect corpus/vendored/n3-pt-scielo-wittgenstein.pdf --pages 1-2

# Why page 2 came out that way (each layer's decision)
pnpm --silent pagepace explain-page corpus/vendored/n3-pt-scielo-wittgenstein.pdf 2

# Corpus evaluation (the same as pnpm eval)
pnpm pagepace eval --diff
```

## Exit codes

`0` success · `1` read error · `2` wrong usage · `3` scanned PDF without a text
layer (ADR-018) — use `--ocr` to recognise the text instead.

## Docs

[docs/extractor/ARCHITECTURE.md](../../docs/extractor/ARCHITECTURE.md) ·
[docs/extractor/EVALUATION.md](../../docs/extractor/EVALUATION.md) ·
[corpus/README.md](../../corpus/README.md) ·
[tests/README.md](../../tests/README.md).
