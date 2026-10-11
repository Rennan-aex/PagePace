---
name: start-session
description: Use no início de TODA sessão de trabalho no PagePace, antes de qualquer alteração. Orienta a ler o estado, localizar a tarefa atual, checar o git e rodar a verificação.
---

# Início de sessão

Você pode ser uma IA diferente da sessão anterior. Não confie em memória: confie no repositório. Leia pouco: siga a **Leitura econômica** do `AGENTS.md`.

## Passos (nesta ordem)
1. Leia `AGENTS.md` e depois `docs/extractor/STATE.md` (ou `docs/app/STATE.md` se o trabalho for do app). O STATE.md já traz a tarefa atual completa — **não abra o arquivo da fase**. Anote: tarefa atual, bloco **Handoff** e **Bloqueios**.
2. Rode `git status` e `git branch --show-current`. Se há mudanças não commitadas, leia `git diff` para entender o que a sessão anterior deixou pela metade.
3. Rode `pnpm verify` e olhe **só as últimas ~20 linhas** da saída (verde, ou onde falhou). Se falhar antes de você mexer em algo, corrija ou registre em STATE.md (Bloqueios) antes de seguir.
4. Entre na branch da tarefa (`<fase>-t<nn>-<slug>`, ex.: `e2-t03-detect-paragraphs`); se não existir, crie a partir de `main` atualizada.
5. Escreva em STATE.md (Handoff, **máx. 15 linhas**): "Sessão iniciada: tarefa X, plano em 2–3 linhas". Commit `wip: start <tarefa>` se tiver alterado arquivos.
6. Se precisar de uma decisão antiga, busque `ADR-NNN` em `DECISIONS.md` e leia **só esse trecho** — nunca o arquivo inteiro (nem o STATE.md por curiosidade).

## Se a tarefa estiver `blocked` ou ambígua
Não adivinhe. Registre a pergunta em `OPEN-QUESTIONS.md`, marque `blocked` em STATE.md e pare. Se a tarefa for grande demais para uma sessão, use a skill `plan-task`.
