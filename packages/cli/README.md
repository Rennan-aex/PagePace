# @pagepace/cli

Comando único do PagePace: `pnpm pagepace <comando>` (na raiz do monorepo).

## Comandos

| Comando | O que faz |
| --- | --- |
| `dump-raw <pdf> [--pages a-b]` | Lê o PDF e escreve o `RawDocument` (JSON) no console |
| `extract <pdf>` | Gera o `Book` (JSON) e escreve no console |
| `inspect <pdf> [--pages a-b] [--format text\|md\|html] [--out <arquivo>]` | Relatório da extração: resumo do documento e, por página, os blocos com tipo, nível, confiança e flags de dúvida; em `md`/`html` a página original fica ao lado dos blocos |
| `explain-page <pdf> <n>` | Explica a página `n` (1-based): a decisão de cada camada (colunas, margin-ref, heading, footnote/endnote, quote, lista, caption, referência, sidebar, hífen, fonte quebrada, ligação de nota) parágrafo a parágrafo |
| `eval [--diff\|--ci\|--update-baseline]` | Roda a avaliação do corpus contra os gabaritos — mesmas opções e códigos de saída do `pnpm eval` |
| `--help` | Ajuda completa, com códigos de saída |

## Formatos do `inspect`

- **`text`** (padrão): no console, ou em `--out relatorio.txt`.
- **`md`**: exige `--out relatorio.md`; grava as imagens das páginas em `relatorio-inspect/pagina-N.png` e monta uma tabela lado a lado (original × extraído).
- **`html`**: exige `--out relatorio.html`; arquivo único com as imagens embutidas (base64), grade de duas colunas por página e as flags destacadas em vermelho.

Blocos com flags de dúvida (`uncertain-hyphen`, `note-without-call`, ...) aparecem realçados no HTML — são os candidatos a correção manual.

## Exemplos (PowerShell)

```powershell
# Relatório de texto das páginas 10 a 12
pnpm -s pagepace inspect <CORPUS_PRIVATE_DIR>\n1-pt-sofia.pdf --pages 10-12

# Relatório HTML lado a lado para conferência visual
pnpm pagepace inspect <CORPUS_PRIVATE_DIR>\n1-pt-sofia.pdf --pages 10-12 --format html --out $env:TEMP\sofia.html

# Por que a página 12 saiu assim (decisão de cada camada)
pnpm -s pagepace explain-page <CORPUS_PRIVATE_DIR>\n1-pt-sofia.pdf 12

# Avaliação do corpus (o mesmo que pnpm eval)
pnpm pagepace eval --diff
```

## Códigos de saída

`0` sucesso · `1` erro de leitura · `2` uso incorreto · `3` PDF escaneado (ADR-018).

## Camadas que o `explain-page` mostra

Cada parágrafo da página traz, em ordem do pipeline: `margin-ref`, `reference`,
`footnote` (inclui endnotes), `heading`, `caption`, `list`, `quote`, `sidebar`,
`cross-page`, `hyphen` (cada sitio `hife-|palavra → junção (join|keep|uncertain)`),
`broken-font` e `note-link`. O `kind`, `level`, `flags` e `confidence` impressos são
os do `Book` real (ADR-077) — o relatório nunca diverge da extração.
