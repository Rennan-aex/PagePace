#!/usr/bin/env bash
# Fails if any PDF is tracked by git. PDFs never belong in this repository.
set -euo pipefail
found=$(git ls-files | grep -iE '\.pdf$' || true)
if [ -n "$found" ]; then
  echo "ERROR: PDF files are tracked by git:" >&2
  echo "$found" >&2
  echo "Remove them (git rm --cached) and keep them in corpus/public (ignored) or CORPUS_PRIVATE_DIR." >&2
  exit 1
fi
echo "OK: no PDFs tracked."
