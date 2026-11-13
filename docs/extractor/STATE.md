# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **SEG concluída (2026-11-12)** — T01–T05 done; E10/E9/E8/E7/E6/E5/E4/E3/E2/E1/E0 fechadas. Nenhuma tarefa aberta no extrator.
- **Próxima tarefa:** **M0/M2 do app** — espera o PO liberar o M0 (`docs/app/STATE.md`). Nenhuma tarefa aberta no extrator.
- **Ação pendente do PO:** liberar o M0 do app.
- **Status:** **PUB-03 (CI endurecido, regras do agente e conferência final) — CONCLUÍDA nesta sessão**: actions fixadas por SHA, `concurrency` que só cancela PR, job com `timeout-minutes: 20`; `pnpm check:emails` (noreply obrigatório) no CI em pull_request; AGENTS.md com as regras de publicação e ADR-110; conferência final (gitleaks 0, 0 links quebrados, clone limpo do README verde, repo ainda privado). Antes: **PUB-02 (PR #9, squash `f063107`)** e **PUB-01 (PR #1)**.
- **Última atualização:** 2026-11-13 (PUB-03).

## Tarefa atual
Nenhuma. Última concluída: **PUB-03 — CI endurecido, regras do agente e conferência final** (branch `chore-pub-ci-final`).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **PUB-03 (CI + regras + conferência):** `ci.yml` com todas as actions por SHA completo + comentário `# v4.x.y` (confira com `gh api repos/<repo>/commits/<tag>`), `concurrency` cancelando só pull_request, `timeout-minutes: 20`, `permissions: contents: read` e todos os passos antigos.
- **E-mail:** `scripts/check-commit-emails.mjs` + `pnpm check:emails <base> <head>` reprova autor/committer fora de `*@users.noreply.github.com` e `noreply@github.com`; provado em repo temporário (reprova `teste@exemplo.com`, aprova as duas formas); CI só em pull_request, checkout `fetch-depth: 0`.
- **Regras (AGENTS.md 9.377 B, limite 10 KB):** 11 = repositório público (dado pessoal, nunca `git config` de usuário) e 12 = corpus só CC BY/CC0/domínio público (licença duvidosa: parar e perguntar); merge `--auto --squash --delete-branch` quando público com main protegida; `end-session` ajustada.
- **Conferência:** gitleaks 8.30.1 no histórico inteiro (134 commits) = **0 achados**; 114 links relativos em 97 `.md` = 0 quebrados (1 falso positivo de regex em código inline); 0 PDFs fora de `corpus/vendored/`; `C:\Users`/`ghp_`/`github_pat_`/`BEGIN PRIVATE KEY` = 0 em arquivos e no histórico.
- **Clone limpo (fora do repo, sem `CORPUS_PRIVATE_DIR`):** clone 4,5 s; install 1 s; `corpus:fetch` 6 s (2 baixados + 12 gerados); `verify` 29 s exit 0; `inspect` idêntico ao README; pasta apagada.
- **GitHub:** ainda **privado**; `allow_squash_merge` true, `allow_merge_commit` false, `delete_branch_on_merge` true, `has_projects` true, `has_wiki` false; `branches/main/protection` = **403** (exige repo público ou GitHub Pro).
- **Próximo passo:** o PO libera o M0 do app; a publicação (público + proteção da main + auto-merge) espera a resposta dele.

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- Liberar o M0 do app (fases e tarefas) para o M2 começar.
- Autorizar a publicação do repositório (tornar público, proteger a main com o check `verify`, ligar o auto-merge) — passo a passo na mensagem final.

## Progresso por marco
| Marco | Status |
|---|---|
| E0 | done (2026-10-05, PR #11) |
| E1 | done (2026-10-07, PR #22) |
| E2 | done (2026-10-08, PR #28; checklist manual concluído 2026-10-11) |
| E3 | done (2026-10-11, PRs #29–#34; checklist manual concluído 2026-10-11) |
| E4 | done (T01 PR #38, T02 PR #40, T03 PR #42, T04 PR #43, T05 PR #44) |
| E5 | done (T01 PR #45; T02 PR #46; T03 PR #48; T04 PR #50; T05 PR #51; T06 PR #52; T07 PR #53; T08 PR #54 — fase fechada 2026-10-18) |
| E6 | done (T01 PR #56, T02 PR #57, T03, T04 — fase fechada 2026-10-19, ADR-070) |
| E7 | done (T01–T05 done 2026-10-20/21, ADR-071/072/073/074/075/076/077 — fase fechada 2026-10-21) |
| E8 | **done** (T01–T04 — fase fechada 2026-10-29; ADR-088/089/090/091/092; medições Android 3/3) |
| E9 | **done** (T01–T04 done 2026-10-30/11-02, ADR-093–098 — fase fechada 2026-11-02; E9 = OCR da ADR-018) |
| E10 | **done** (T01a/T01b/T02/T03/T04 — fase fechada 2026-11-11; ADR-100/101/102; recorte = ADR-016 + ADR-075) |
| SEG | **done** (T01–T05 done 2026-11-11/12; ADR-104–109) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`) + **4 documentos de frases** em `corpus/sentences/`.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos) · `sentence_f1` **1,0000 nos 4** documentos anotados (SEG-T05, ADR-108; meta 0,97; 22/13 pt, 24/12 en).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-11-13 · **PUB-03 (CI endurecido, regras do agente e conferência final) — CONCLUÍDO (PR #11)** · actions por SHA com a tag ao lado, `concurrency` só para PR, `timeout-minutes: 20`; `pnpm check:emails` (noreply obrigatório, `base..head`, `fetch-depth: 0`) provado em repo temporário; AGENTS.md com as regras 11/12 e o merge `--auto`, ADR-110; conferência final: gitleaks 0 achados, 0 links quebrados, clone limpo do README verde, repo ainda privado (prot. da main 403); `pnpm verify` e `pnpm eval --ci` verdes.
- 2026-11-13 · **PUB-02 (READMEs e documentação de entrada) — CONCLUÍDO (PR #9, squash `f063107`)** · README raiz EN + README.pt-BR; READMEs dos 5 pacotes; tests/, corpus/, docs/README, scripts/, apps/, .opencode/; 109 links = 0 quebrados; números do `pnpm eval` conferidos; `pnpm verify` verde (1406 testes).
- Sessões anteriores: 2026-11-12 SEG-T05 (`archive/STATE-log-2026-11-12-segt05.md`), 2026-11-11 SEG-T04 (PR #110, ADR-107), `archive/STATE-log-2026-11-11-segt03.md`, `archive/STATE-log-2026-11-11-segt02.md`, `archive/STATE-log-2026-11-11-corpus-vendored.md`, `archive/STATE-log-2026-11-11-e10t04.md`, `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md`, `archive/STATE-log-2026-11-02-e9t04.md`.

Histórico completo: docs/extractor/archive/
