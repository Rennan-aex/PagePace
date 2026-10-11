---
name: end-session
description: Use ao terminar uma tarefa ou quando a sessão estiver perto do fim dos tokens. Fecha a tarefa com verificação, atualiza STATE.md para a próxima IA, commita e abre o PR.
---

# Fim de sessão (ou fim de tokens)

## Se a tarefa terminou
1. `pnpm verify` verde (olhe só as últimas ~20 linhas da saída). Se mexeu na extração: `pnpm eval` sem regressão (use a skill `run-eval`).
2. Atualize `docs/extractor/STATE.md` respeitando o orçamento (`pnpm check:docs` precisa passar):
   - **Tarefa atual:** copie a **próxima tarefa** (do arquivo da fase ou do ROADMAP) para a seção "Tarefa atual" — cópia completa, com a data da cópia. Não deixe a seção vazia.
   - **Log:** registro de **3 a 4 linhas** (data · tarefa · o que ficou · próximo). Ao registrar, **mova** as entradas além das 2 mais recentes para `docs/extractor/archive/` (nada é apagado; uma entrada não pode crescer sem limite).
   - **Handoff:** no máximo **15 linhas**.
3. Se tomou decisão: skill `record-decision` (ADR de no máximo 12 linhas).
4. Commit (Conventional Commits em inglês), `git push`, abra PR com `.github/pull_request_template.md` preenchido.

## Se a sessão vai acabar no meio da tarefa
1. Faça commit `wip: <o que está feito>` com o código no estado mais estável possível (testes que falham de propósito devem estar marcados `it.todo`/`skip` com comentário).
2. Atualize o bloco **Handoff** de STATE.md com precisão e **máx. 15 linhas**: **feito**, **pela metade** (arquivo e função), **próximo comando exato**, **armadilhas descobertas**, resultado do último `pnpm verify`.
3. `git push` da branch.

Nunca deixe trabalho só no disco, e nunca termine com STATE.md desatualizado (`pnpm check:docs` verde).
Ao terminar, escreva a mensagem final usando a skill report-to-po.
