---
name: add-heuristic
description: Use ao criar ou alterar qualquer heurística do extrator (linhas, parágrafos, títulos, notas, colunas, hifenização etc.). Garante teste que falha antes, parâmetros nomeados, medição no corpus e ausência de regressão.
---

# Adicionar/alterar uma heurística do extrator

## Antes de codar
1. Identifique a **camada** (`docs/extractor/ARCHITECTURE.md`) e a **métrica** que a heurística melhora (`EVALUATION.md`).
2. Rode `pnpm eval` e guarde a saída "antes".
3. Reproduza o problema com a skill `debug-page` e crie uma **fixture mínima** (itens brutos sintéticos, sem texto com copyright) em `packages/extractor/test/fixtures/`.
4. Escreva o **teste que falha** com o comportamento esperado.

## Implementação
- Função **pura** em módulo próprio da camada. Sem `fs`, sem `Date.now`, sem aleatoriedade.
- **Sem números mágicos soltos:** constantes nomeadas com comentário do que significam (preferir limiares *relativos* ao tamanho da fonte/corpo, não absolutos).
- Dúvida real vira `flags` + confiança mais baixa, não palpite silencioso.
- Mantenha o tamanho da mudança pequeno; se crescer, divida a tarefa.

## Depois
1. `pnpm verify` e `pnpm eval`: a métrica-alvo melhorou e **nenhuma outra piorou** (regra de ouro). Se melhorou: `pnpm eval --update-baseline` no mesmo PR.
2. Se piorou algo de propósito: `record-decision` explicando o trade-off. Sem isso, o PR não passa.
3. Documente a heurística em 3–5 linhas no cabeçalho do módulo (o que detecta, sinais usados, casos conhecidos que falham).
4. Atualize STATE.md e o arquivo da fase.
