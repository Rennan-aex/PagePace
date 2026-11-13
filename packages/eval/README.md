# @pagepace/eval

The evaluation harness: corpus manifests, golden documents, metrics
(`text_cer`, `para_boundary_f1`, `reading_order`, `style_f1`, …), the committed
baseline and the CI regression gate. It also runs the synthetic-PDF generator
and the speed/memory benchmark.

## Commands (from the repository root)

```bash
pnpm eval                  # measure everything, print the tables
pnpm eval --diff           # compare with the baseline (informational)
pnpm eval --ci             # gate: exit 1 if any metric worsens by > 0.002
pnpm eval --update-baseline  # rewrite the baseline with this run (see tests/README.md)
pnpm bench                 # per-document speed and memory
pnpm corpus:fetch          # download/verify the public corpus
pnpm corpus:synthetic      # regenerate synthetic PDFs + goldens
```

## Use it inside the monorepo

Save as `example.ts` in the repository root and run it with `tsx`:

```ts
import { readFileSync } from "node:fs";
import { parseGolden, readBaseline } from "./packages/eval/src/index.ts";

const source = "corpus/golden/syn-n1-en-paragraphs.golden.json";
const golden = parseGolden(readFileSync(source, "utf8"), source);
console.log("golden blocks:", golden.blocks.length);

const baseline = await readBaseline(process.cwd());
console.log(
  "baseline version:",
  baseline?.version,
  "| tolerance:",
  baseline?.tolerance,
  "| documents:",
  baseline === null ? 0 : Object.keys(baseline.documents).length,
);
```

```bash
pnpm exec tsx example.ts
# golden blocks: 7
# baseline version: 1 | tolerance: 0.002 | documents: 16
```

## Main exports

- Runner: `runEval`, `runEvalCli` (the `pnpm eval` / `pagepace eval` entry).
- Baseline: `readBaseline`, `writeBaseline`, `compareBaseline`, `parseBaseline`, `BASELINE_TOLERANCE`, `METRIC_DIRECTIONS`.
- Golden: `parseGolden`, `GOLDEN_FORMAT_VERSION`.
- Corpus: `loadCorpus`, manifest parsing helpers; benchmark: `runBench`, `compareBenchBaseline`.

## Test it

```bash
pnpm vitest run packages/eval   # 24 files, 360 tests
```

## Docs

[docs/extractor/EVALUATION.md](../../docs/extractor/EVALUATION.md) (metrics,
goals, flags) · [corpus/README.md](../../corpus/README.md) (corpus layout)
· [tests/README.md](../../tests/README.md) (how the suites fit together).
