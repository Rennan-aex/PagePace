---
name: run-eval
description: Use para rodar e interpretar a avaliação do corpus (métricas do extrator), comparar com o baseline, investigar regressões e atualizar o baseline com justificativa. Obrigatório ao fim de qualquer tarefa que altere a extração.
---

# Rodar a avaliação

## Comandos
- `pnpm eval`: roda o corpus (público + privado, se `CORPUS_PRIVATE_DIR` definido) e imprime tabela por nível/documento.
- `pnpm eval --help`: o que existe hoje.
- `pnpm corpus:fetch`: baixa/valida os PDFs públicos antes.

**Só existem a partir da E1-T08** (hoje qualquer opção desconhecida = exit 2): `--diff`, `--ci`, `--update-baseline`.

## O que ele mede hoje (E1-T06, ADR-035)
`text_cer` = Levenshtein (texto normalizado × golden) ÷ tamanho do golden. Normalização: NFC, sem soft hyphen, espaços colapsados — caixa e pontuação **não** mudam. Junção provisória dos itens do pdf.js: `hasEOL` → `\n`, distância > 0,15 em → espaço (trocada pela E2-T03). Só documentos com `golden:` declarado são medidos; sem gabarito nenhum o runner avisa e sai com 0. Relatório: `packages/eval/out/report.json` (sem timestamps, ignorado).

## Interpretação
Tolerância: **0,002 absoluto** por métrica (vale quando o gate existir, E1-T08). Piorou acima disso = falha. Veja a coluna do documento e do nível: uma melhora em N1 que piora N3 não é aceitável sem decisão.

## Se houver regressão
1. Identifique o documento e a página (`pnpm eval --diff --verbose`, quando o `--diff` existir).
2. Use a skill `debug-page` para ver a decisão de cada camada.
3. Corrija a heurística (preferível) ou, se o trade-off for deliberado, `record-decision` + `--update-baseline` explicando.

## Registro
Cole um resumo (sem texto de livros) no PR e atualize "Métricas atuais" em STATE.md.
