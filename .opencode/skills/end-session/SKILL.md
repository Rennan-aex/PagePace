---
name: end-session
description: Use ao terminar uma tarefa ou quando a sessão estiver perto do fim dos tokens. Fecha a tarefa com verificação, atualiza STATE.md para a próxima IA, commita e abre o PR.
---

# Fim de sessão (ou fim de tokens)

## Se a tarefa terminou
1. `pnpm verify` verde. Se mexeu na extração: `pnpm eval` sem regressão (use a skill `run-eval`).
2. Marque `[x]`/`done` na tarefa dentro do arquivo da fase.
3. Atualize `STATE.md`: situação, próxima tarefa, métricas atuais, uma linha no Log de sessões.
4. Se tomou decisão: skill `record-decision`.
5. Commit (Conventional Commits em inglês), `git push`, abra PR com `.github/pull_request_template.md` preenchido.

## Se a sessão vai acabar no meio da tarefa
1. Faça commit `wip: <o que está feito>` com o código no estado mais estável possível (testes que falham de propósito devem estar marcados `it.todo`/`skip` com comentário).
2. Atualize o bloco **Handoff** de STATE.md com precisão: **feito**, **pela metade** (arquivo e função), **próximo comando exato**, **armadilhas descobertas**, resultado do último `pnpm verify`.
3. `git push` da branch.

Nunca deixe trabalho só no disco, e nunca termine com STATE.md desatualizado.
Ao terminar, escreva a mensagem final usando a skill report-to-po.