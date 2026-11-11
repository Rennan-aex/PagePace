---
name: add-corpus-pdf
description: Use para adicionar um PDF ao corpus de testes do PagePace, público (entra no manifest com SHA-256) ou privado (fica fora do repositório). Garante licença verificada, nível e idioma corretos e nenhum PDF no git.
---

# Adicionar PDF ao corpus

## Decisão: público ou privado?
- **Público**: domínio público ou licença aberta verificável (arXiv, Wikisource, Gutenberg, Standard Ebooks, Internet Archive com licença clara). Vai ao `corpus/manifest.yaml`.
- **Privado**: qualquer coisa com copyright (livros do PO). Fica em `$CORPUS_PRIVATE_DIR`, com `manifest.yaml` próprio lá. **Nunca** copie para dentro do repositório.

## Passos (público)
1. Confirme e registre a **licença** e a URL de origem. Se tiver dúvida, não adicione; registre em `OPEN-QUESTIONS.md`.
2. Baixe para `corpus/public/` (pasta ignorada pelo git) e calcule: `sha256sum corpus/public/<arquivo>.pdf`.
3. Adicione ao manifest: `id`, `level` (N1–N5), `lang` (pt|en), `title`, `source_url`, `license`, `sha256`, `features`, `golden`, `visibility: public`.
4. Rode `pnpm corpus:fetch` numa cópia limpa (ou apague o arquivo e rode) para provar que é reproduzível.
5. (Opcional) Crie golden parcial: skill `write-golden-test`.
6. `pnpm check:no-pdf` deve passar. Commit só do manifest/golden.
   - **A fonte bloqueia o CI (403 no GitHub Actions, como o SciELO)?** Coloque o PDF em `corpus/vendored/` e troque `source_url` por `vendored: "corpus/vendored/<arquivo>.pdf"` no manifest (ADR-103): o fetch copia sem rede e o `check:no-pdf` cobre esse caminho com o SHA-256 do manifest. Escreva um `corpus/vendored/README.md` com título, autor, DOI, página, licença e hash (modelo: `corpus/vendored/README.md`).

## Passos (privado)
1. Coloque o PDF em `$CORPUS_PRIVATE_DIR`, registre no manifest privado com `visibility: private`.
2. Rode `pnpm eval` localmente. Resultados privados são só para você: não cole texto do livro em PRs, issues ou commits.
