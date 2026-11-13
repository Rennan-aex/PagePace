# Third-party notices

PagePace itself is MIT licensed — see [LICENSE](LICENSE). This file lists
material from other projects that lives in this repository or is used at
runtime.

## Test corpus vendored in `corpus/vendored/`

Two open-access SciELO articles, stored **byte for byte and unmodified** (no
edit, re-render or recomposition) as test fixtures. Full metadata, SHA-256 and
verification date: `corpus/vendored/README.md` and `corpus/manifest.yaml`.

| File | Title | Author | Journal | DOI |
|---|---|---|---|---|
| `n3-pt-scielo-wittgenstein.pdf` | Wittgenstein e o ceticismo | Daniel Temp | Filosofia Unisinos, v. 27, n. 1 (2026), e27103 | [10.4013/fsu.2026.271.03](https://doi.org/10.4013/fsu.2026.271.03) |
| `n3-en-scielo-climatejustice.pdf` | Climate justice, land-use change emissions and global health | Milene Consenso Tonetto | Filosofia Unisinos, v. 27, n. 1 (2026), e27117 | [10.4013/fsu.2026.271.17](https://doi.org/10.4013/fsu.2026.271.17) |

License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (Creative
Commons Attribution 4.0 International) — attribution required.

## Source Serif 4 test fonts

The fonts in `packages/extractor/test/fonts/` (Regular, Bold, Italic) are used
by the test suite only. They are licensed under the SIL Open Font License
1.1 — see `packages/extractor/test/fonts/LICENSE-SourceSerif4.md`.

## Public corpus (downloaded at runtime, not redistributed)

Most of the evaluation corpus is **not** committed to this repository:
`pnpm corpus:fetch` downloads it into the gitignored `corpus/public/` and
verifies each file against the SHA-256 in `corpus/manifest.yaml`. The manifest
records source URL, license and license-verification date for every document.
Only the two SciELO PDFs above are versioned.

## npm dependencies

All dependencies are declared in the `package.json` files and locked in
`pnpm-lock.yaml`. Their licenses were audited with the ADR-006 procedure
(`packages/extractor/spikes/s5-licenses.mjs`, report in
`packages/extractor/spikes/S5-licenses.md`): no AGPL/GPL/LGPL/SSPL/MPL/EPL/CDDL
dependency is allowed. SPDX license identifiers are listed per package in the
lockfile and in each `package.json`.

## Fonts inside `pdfjs-dist` (not versioned here)

`pdfjs-dist` ships standard-font files under `node_modules/` (installed by
pnpm, never committed): 10 Foxit `.pfb` fonts (BSD), 4 Liberation Sans `.ttf`
(GPLv2 with font exception) and their `LICENSE_*` files. Only the Foxit `.pfb`
files may be copied into a bundle, and only by `scripts/copy-pdfjs-assets.mjs`
(ADR-020); the Liberation files are explicitly denied. Nothing from
`pdfjs-dist` is committed to this repository.
