---
name: plan-task
description: Use quando uma fase ou tarefa do roadmap for grande demais para uma sessão, ou quando for preciso detalhar uma fase em tarefas atômicas com critérios de aceite verificáveis (método GSD).
---

# Quebrar em tarefas atômicas

## Critérios de uma boa tarefa
- Cabe em **uma sessão** (~1–3 h de IA, ≲ 300 linhas de mudança).
- Tem **aceite verificável por comando ou checklist** (ex.: "`pnpm eval` mostra `para_boundary_f1` N1 ≥ 0,98").
- Deixa o repositório **verde** e é mergeável sozinha.
- Faz **uma** coisa (uma heurística, um módulo, uma métrica).

## Passos
1. Leia o objetivo e o critério de saída da fase (`docs/extractor/phases/<fase>.md`) e os requisitos (`REQUIREMENTS.md`).
2. Liste as menores fatias verticais que levam ao critério de saída. Prefira: teste/gabarito primeiro → implementação mínima → refinamentos.
3. Para cada uma, preencha `docs/templates/TASK.md` (objetivo, dependências, passos, aceite, fora de escopo, testes).
4. Ordene por dependência e por risco (o mais incerto primeiro).
5. Edite o arquivo da fase e atualize `STATE.md`. Mudança de ordem/corte de marcos = `record-decision`.

## Armadilhas
Tarefas "implementar X inteiro", aceite subjetivo ("ficar bom"), tarefas que dependem de decisão do PO sem pergunta registrada.
