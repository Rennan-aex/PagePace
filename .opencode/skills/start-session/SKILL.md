---
name: start-session
description: Use no início de TODA sessão de trabalho no PagePace, antes de qualquer alteração. Orienta a ler o estado, localizar a tarefa atual, checar o git e rodar a verificação.
---

# Início de sessão

Você pode ser uma IA diferente da sessão anterior. Não confie em memória: confie no repositório.

## Passos (nesta ordem)
1. Leia `docs/extractor/STATE.md` (ou `docs/app/STATE.md` se o trabalho for do app). Anote: tarefa atual, status, bloco **Handoff**, bloqueios.
2. Abra o arquivo da fase em `docs/extractor/phases/` e leia **somente a tarefa atual** (e `REQUIREMENTS.md` para os IDs citados).
3. Rode `git status` e `git branch --show-current`. Se há mudanças não commitadas, leia `git diff` para entender o que a sessão anterior deixou pela metade.
4. Rode `pnpm verify`. Se falhar antes de você mexer em algo, corrija ou registre em STATE.md (Bloqueios) antes de seguir.
5. Entre na branch da tarefa (`<fase>-t<nn>-<slug>`, ex.: `e2-t03-detect-paragraphs`); se não existir, crie a partir de `main` atualizada.
6. Escreva em STATE.md (Handoff): "Sessão iniciada: tarefa X, plano em 2–3 linhas". Commit `wip: start <tarefa>` se tiver alterado arquivos.

## Se a tarefa estiver `blocked` ou ambígua
Não adivinhe. Registre a pergunta em `OPEN-QUESTIONS.md`, marque `blocked` em STATE.md e pare. Se a tarefa for grande demais para uma sessão, use a skill `plan-task`.
