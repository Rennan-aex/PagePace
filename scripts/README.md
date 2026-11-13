# scripts/

Small repository utilities (plain Node ESM, no dependencies).

| Script | What it does | How to run |
|---|---|---|
| `check-docs-budget.mjs` | Fails when a "hot" document (`STATE.md`, `AGENTS.md`, `DECISIONS.md`) grows past its size/line budget; trimmed content must move to `docs/extractor/archive/` | `pnpm check:docs` (part of `pnpm verify`) |
| `build-decisions-index.mjs` | Regenerates the ADR index table between `INDEX:START/END` in `docs/extractor/DECISIONS.md`, parsing the `### ADR-NNN` headings; never touches the ADR bodies | `pnpm decisions:index` |
| `copy-pdfjs-assets.mjs` | Copies the runtime assets of `pdfjs-dist` into a bundle folder — only the Foxit `.pfb` fonts, `.bcmap`/`.cmap`, `.wasm` and `LICENSE_FOXIT`; the GPLv2 Liberation `.ttf` files are refused (ADR-020) | `node scripts/copy-pdfjs-assets.mjs --from packages/extractor/node_modules/pdfjs-dist --to dist/assets` |
