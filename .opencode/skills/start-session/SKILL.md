---
name: start-session
description: Use no início de TODA sessão de trabalho no PagePace, antes de qualquer alteração. Orienta a ler o estado, localizar a tarefa atual, checar o git e rodar a verificação.
---

# Início de sessão

Você pode ser uma IA diferente da sessão anterior. Não confie em memória: confie no repositório. Leia pouco: siga a **Leitura econômica** do `AGENTS.md`.

## Passos (nesta ordem)
1. Leia `AGENTS.md` e depois `docs/extractor/STATE.md` (ou `docs/app/STATE.md` se o trabalho for do app). O STATE.md já traz a tarefa atual completa — **não abra o arquivo da fase**. Anote: tarefa atual, bloco **Handoff** e **Bloqueios**.
2. Rode `git status` e `git branch --show-current`. Se há mudanças não commitadas, leia `git diff` para entender o que a sessão anterior deixou pela metade. **Working tree sujo: pare e avise o PO (skill `report-to-po`) antes de qualquer ação de branch.**
3. Rode `pnpm verify` e olhe **só as últimas ~20 linhas** da saída (verde, ou onde falhou). Se falhar antes de você mexer em algo, corrija ou registre em STATE.md (Bloqueios) antes de seguir.
4. Rode `git fetch --prune` e `git branch -vv` e interprete a branch indicada em "Tarefa atual" no STATE.md:
   - **Aparece marcada como `[gone]`:** a tarefa anterior já foi mesclada. Faça `git checkout main`, `git pull`, `git branch -D <branch antiga>`, atualize STATE.md (arque a tarefa concluída e traga a próxima) e **só então** crie a branch nova da próxima tarefa.
   - **Ainda existe (não é `[gone]`) e o STATE.md diz que a tarefa anterior ainda está em andamento:** continue NESSA branch; não crie outra. Só trocar de branch/tarefa se o pedido desta sessão for explicitamente outra tarefa — nesse caso, avise o PO (`report-to-po`) antes de trocar.
   - **Ainda existe e o STATE.md marca a tarefa como terminada (há um PR aberto esperando):** rode `gh pr checks` nessa branch.
     - Todos os checks obrigatórios (o `verify`) passando: faça o merge AGORA (seção "Branches, PR e merge" do AGENTS.md) antes de começar qualquer tarefa nova.
     - Algum check falhou: entre na branch, investigue e corrija o problema como parte do início da sessão; só depois siga para a tarefa nova (se houver).
     - Checks ainda rodando (pendentes): espere uma única checagem adicional (ex.: ~1 minuto) e tente de novo; se continuar pendente, siga normalmente para a tarefa da sessão e deixe o merge para a próxima sessão.
   - **Mudanças não commitadas (git status sujo) em qualquer um desses casos:** pare e avise o PO antes de qualquer ação de branch.
5. Entre na branch da tarefa (`<fase>-t<nn>-<slug>`, ex.: `e2-t03-detect-paragraphs`); se não existir, crie a partir de `main` atualizada.
6. Escreva em STATE.md (Handoff, **máx. 15 linhas**): "Sessão iniciada: tarefa X, plano em 2–3 linhas". Commit `wip: start <tarefa>` se tiver alterado arquivos.
7. Se precisar de uma decisão antiga, busque `ADR-NNN` em `DECISIONS.md` e leia **só esse trecho** — nunca o arquivo inteiro (nem o STATE.md por curiosidade).

## Se a tarefa estiver `blocked` ou ambígua
Não adivinhe. Registre a pergunta em `OPEN-QUESTIONS.md`, marque `blocked` em STATE.md e pare. Se a tarefa for grande demais para uma sessão, use a skill `plan-task`.
