---
name: run-eval
description: Use para rodar e interpretar a avaliação do corpus (métricas do extrator), comparar com o baseline, investigar regressões e atualizar o baseline com justificativa. Obrigatório ao fim de qualquer tarefa que altere a extração.
---

# Rodar a avaliação

## Comandos
- `pnpm eval`: roda o corpus (público + privado, se `CORPUS_PRIVATE_DIR` definido) e imprime tabela por nível/documento.
- `pnpm eval --diff`: mostra o que mudou contra `packages/eval/baseline.json`.
- `pnpm eval --ci`: modo do CI (apenas corpus público; sai com erro se algo piorar).
- `pnpm eval --update-baseline`: regrava o baseline (só quando houve melhora **ou** decisão registrada).
- `pnpm corpus:fetch`: baixa/valida os PDFs públicos antes.

## Interpretação
Tolerância: **0,002 absoluto** por métrica. Piorou acima disso = falha. Veja a coluna do documento e do nível: uma melhora em N1 que piora N3 não é aceitável sem decisão.

## Se houver regressão
1. Identifique o documento e a página (`pnpm eval --diff --verbose`).
2. Use a skill `debug-page` para ver a decisão de cada camada.
3. Corrija a heurística (preferível) ou, se o trade-off for deliberado, `record-decision` + `--update-baseline` explicando.

## Registro
Cole um resumo (sem texto de livros) no PR e atualize "Métricas atuais" em STATE.md.
