---
name: debug-page
description: Use para investigar por que uma página (ou trecho) do PDF foi extraída errada: inspecionar itens brutos, linhas, colunas, decisões por camada e criar a fixture mínima que reproduz o problema.
---

# Depurar uma página

## Passos
1. Identifique o PDF e a página (do relatório de `pnpm eval --diff` ou de `pagepace inspect`).
2. Veja os **itens brutos**: `pnpm pagepace dump-raw <pdf> --pages N`. Confira fonte, tamanho, posição; espaços ausentes; fragmentação de itens.
3. Veja a decisão por camada: `pnpm pagepace explain-page <pdf> N` (quando existir, E7-T05). Antes disso, adicione logs temporários **fora do commit**.
4. Localize **a primeira camada** em que o resultado deixa de estar correto (o erro costuma aparecer depois, mas nasce antes).
5. Reduza a um caso mínimo: copie só os itens relevantes para uma fixture JSON em `packages/extractor/test/fixtures/<camada>/`, **trocando o texto por texto sintético** se o original tiver copyright (preserve fonte, tamanho e posição, que são o que importa).
6. Escreva o teste que falha e siga a skill `add-heuristic`.

## Causas frequentes
Espaços inferidos errados (kerning), fonte com nome opaco (`F23`), nota de rodapé confundida com parágrafo, coluna não detectada, cabeçalho confundido com título, hifenização legítima desfeita, PDF com mapeamento de fonte quebrado (texto embaralhado).
