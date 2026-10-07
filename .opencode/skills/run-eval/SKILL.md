---
name: run-eval
description: Use para rodar e interpretar a avaliação do corpus (métricas do extrator), comparar com o baseline, investigar regressões e atualizar o baseline com justificativa. Obrigatório ao fim de qualquer tarefa que altere a extração.
---

# Rodar a avaliação

## Comandos
- `pnpm eval`: roda o corpus (público + privado, se `CORPUS_PRIVATE_DIR` definido) e imprime tabela por nível/documento.
- `pnpm eval --help`: o que existe hoje.
- `pnpm corpus:fetch`: baixa/valida os PDFs públicos antes (e gera os sintéticos que faltarem).
- `pnpm corpus:synthetic`: (re)gera os PDFs `syn-*` e seus goldens a partir das especificações, se você mexer numa spec.

**Flags do baseline (desde a E1-T08, ADR-038):**
- `pnpm eval --diff` — tabela do run ao lado de `packages/eval/baseline.json` (informativa, nunca falha).
- `pnpm eval --ci` — o gate do CI: saída **1** se alguma métrica piorar além da tolerância.
- `pnpm eval --update-baseline` — regrava o baseline com este run; **recusa** (saída 1) se algum documento falhou ou se nada foi medido. Não combina com `--ci`/`--diff` (saída 2).

## O que ele mede hoje (E1-T06, ADR-035)
`text_cer` = Levenshtein (texto normalizado × golden) ÷ tamanho do golden. Normalização: NFC, sem soft hyphen, espaços colapsados — caixa e pontuação **não** mudam. Junção provisória dos itens do pdf.js: `hasEOL` → `\n`, distância > 0,15 em → espaço (trocada pela E2-T03). Só documentos com `golden:` declarado são medidos; sem gabarito nenhum o runner avisa e sai com 0. Relatório: `packages/eval/out/report.json` (sem timestamps, ignorado).

## Interpretação
Tolerância: **0,002 absoluto** por métrica, comparada **por documento** (`packages/eval/baseline.json`, versão no git). Piorou acima disso = `--ci` falha, com a linha `eval: regression: <id> <métrica> <antes> -> <depois>`. Veja a coluna do documento e do nível: uma melhora em N1 que piora N3 não é aceitável sem decisão.

## Se houver regressão
1. Identifique o documento (`pnpm eval --diff`) e a página (skill `debug-page`).
2. Corrija a heurística (preferível).
3. Só então, se o trade-off for deliberado: `record-decision` (entra em `DECISIONS.md`) e `pnpm eval --update-baseline` **no mesmo PR**, justificando o ganho que compensa a piora (regra de ouro, ADR-008).
4. Melhora de verdade (piorar é que exige decisão): rode `--update-baseline` junto da mudança, senão o CI do PR seguinte acusa.

## Registro
Cole um resumo (sem texto de livros) no PR e atualize "Métricas atuais" em STATE.md.
