# Contributing to PagePace

Thanks for your interest in PagePace. This is a **personal portfolio
project**, developed and maintained in spare time with the help of AI coding
agents. Issues and pull requests are answered as time allows — **there is no
guaranteed response time**.

## Getting started

1. Install the Node version declared in [`.nvmrc`](.nvmrc) (for example with
   `nvm use`).
2. Install pnpm — the exact version is pinned in the `packageManager` field of
   [`package.json`](package.json) (`corepack enable` installs it automatically).
3. `pnpm install`
4. `pnpm corpus:fetch` — downloads the public evaluation corpus described in
   `corpus/manifest.yaml`. The corpus itself is never committed.
5. `pnpm verify` — typecheck, lint, format check, tests, the no-PDF check and
   the documentation budget. **This must pass before any pull request.**

`pnpm eval` (or `pnpm eval --ci`) measures extraction quality against the
committed baseline.

## Branches and pull requests

- Branch from `main` with a descriptive name.
- Keep pull requests **small and focused**.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  in **English** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- CI must be green (`pnpm verify` and `pnpm eval --ci`) before review.

## The golden rule for metrics

**No change to an extraction heuristic is accepted if it makes any metric
worse than the baseline** (`packages/eval/baseline.json`). A justified
regression requires an ADR in `docs/extractor/DECISIONS.md` and an explicit
baseline update in the same pull request.

## Corpus and copyright rules

- Only material that is **CC BY, CC0 or public domain** (with attribution)
  may enter the repository. Attribution is recorded in `corpus/manifest.yaml`
  and `corpus/vendored/README.md`.
- **Never attach PDFs — or any text with copyright — to an issue, a pull
  request, a commit or a comment.** Describe the document type and the page
  instead; a maintainer can reproduce the case from a licensed source.

## AI-assisted contributions

This project is developed with AI coding agents. Contributions produced with
AI tools are welcome under the same rules: the same tests, the same review
criteria and the same metric and copyright rules apply to every pull request,
no matter how it was written.

## Reporting bugs and requesting features

Use the issue templates in `.github/ISSUE_TEMPLATE/`. For security problems,
follow [SECURITY.md](SECURITY.md) instead — do **not** open a public issue for
a vulnerability.
