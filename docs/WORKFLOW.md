# Workflow

Método: **GSD (Get Shit Done) + ágil**, adaptado a uma IA por vez (OpenCode), com troca de modelo quando os tokens acabam.

## Hierarquia do plano
`Marco (E0..E10 / M0..M6)` → `Fase` → `Tarefa atômica`.
- **Tarefa atômica:** cabe em uma sessão (alvo: 1–3 horas de IA, no máximo ~300 linhas de mudança), tem critério de aceite **verificável por comando ou checklist**, e deixa o repositório verde.
- Cada fase tem seu arquivo em `docs/extractor/phases/` com a lista de tarefas, requisitos atendidos e critério de saída.
- O estado vivo fica em `STATE.md`. O plano (`ROADMAP.md` e fases) só muda por decisão registrada.

## Ciclo de uma tarefa
1. **Plan:** ler a tarefa; se grande demais, usar `plan-task` e dividir.
2. **Test first (quando possível):** escrever o teste/gabarito que define "pronto".
3. **Implement:** menor mudança que passa.
4. **Verify:** `pnpm verify` + `pnpm eval` (sem regressão).
5. **Record:** STATE.md, DECISIONS.md, checkbox da tarefa.
6. **Ship:** PR, CI verde, squash merge.

## Git
- `main` protegida: só entra via PR com CI verde.
- Branch por tarefa: `e2-t03-detect-paragraphs`. Commits `wip:` livres na branch; o squash gera um commit limpo (Conventional Commits).
- Tags: `schema-vX.Y.Z` a cada versão do esquema; `e1-done`, `e2-done`... ao fechar marcos.
- Configuração recomendada do GitHub (uma vez): proteger `main`, exigir o check `verify`, permitir apenas squash merge, apagar branch após merge.

## Handoff entre IAs (o ponto mais importante)
A IA seguinte pode ser outro modelo, sem nenhum contexto. Por isso:
- `STATE.md` tem um bloco **Handoff** atualizado em checkpoints: *feito, pela metade, próximo comando, armadilhas*.
- Commits WIP frequentes. Nunca deixar trabalho só no disco.
- Instruções curtas e explícitas (AGENTS.md + skills). Nada de "como combinamos antes".

## Testes
- **Automatizados:** unitários (Vitest), golden por página/livro, avaliação do corpus com métricas e baseline (`EVALUATION.md`).
- **Manuais:** checklists em `tests/manual/`, executadas pelo humano em marcos (conferência visual da extração, depois do app).
- Toda heurística nova nasce com pelo menos um caso de teste que falhava antes.

## Cadência humana
O humano (PO) valida ao fim de cada fase: roda a checklist manual, olha o relatório de métricas e libera a próxima fase em `STATE.md`.
