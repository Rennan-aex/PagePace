# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **SEG concluída (2026-11-12)** — T01–T05 done; E10/E9/E8/E7/E6/E5/E4/E3/E2/E1/E0 fechadas. Nenhuma tarefa aberta no extrator.
- **Próxima tarefa:** **M0/M2 do app** — espera o PO liberar o M0 (`docs/app/STATE.md`). Nenhuma tarefa aberta no extrator.
- **Ação pendente do PO:** liberar o M0 do app.
- **Status:** **PUB-05 (triagem dos PRs do Dependabot) — CONCLUÍDA em 2026-11-13** (branch `chore/align-types-node-24`): dos 7 PRs abertos, #6 (biome/canvas/zod), #2 (upload-artifact 7.0.2), #4 (checkout 7.0.1) e #7 (TypeScript 7.0.2) mesclados; #13 fechado como superado pelo #6; #14 (vitest 4) e #8 (`@types/node` 26) fechados com `@dependabot ignore this major version`; `@types/node` alinhado a `^24` e regra de ignore de major no `dependabot.yml`; ADR-111. Antes: **PUB-04 (READMEs)**, **PUB-03 (PR #11)** e **PUB-02 (PR #9)**.
- **Última atualização:** 2026-11-13 (PUB-05).

## Tarefa atual
Nenhuma. Última concluída: **PUB-05 — triagem dos PRs do Dependabot** (branch `chore/align-types-node-24`).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **PUB-05 (Dependabot):** #6 `8797251` (biome 2.6.6, `@napi-rs/canvas` 1.1.0, zod 4.6.7), #2 `be698c5` (upload-artifact 7.0.2) e #4 `1758fe8` (checkout 7.0.1) mesclados com o `verify` verde; as duas Actions seguem **por SHA com o comentário da versão** no `ci.yml`.
- **#7 TypeScript 7.0.2 `a805340` mesclado** depois de `pnpm verify`, `pnpm eval --ci` e `pnpm bench --ci --runs 3` verdes na branch; o typecheck foi conferido reprovando um erro plantado (não é no-op).
- **Causa do #14 (vitest 4):** peer `vite ^6 || ^7 || ^8` contra `vite@5.4.21` no lockfile (o workspace não declara `vite`) → `ERR_PACKAGE_PATH_NOT_EXPORTED` no `pnpm test`; reproduzido localmente e registrado no BACKLOG como "avaliar quando maduro".
- **#8 (`@types/node` 26):** fechado porque o runtime é Node 24; os tipos foram para `^24.0.0` (24.19.2) e o `dependabot.yml` ignora majors dele, com comentário. ADR-111 cobre os três majors.
- **Próximo passo:** o PO libera o M0 do app (único bloqueio aberto).

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- Liberar o M0 do app (fases e tarefas) para o M2 começar.

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
- 2026-11-13 · **PUB-05 (triagem dos PRs do Dependabot) — CONCLUÍDO** · 7 PRs: #6/#2/#4/#7 mesclados, #13 superado, #14 e #8 fechados com `@dependabot ignore this major version`; TS 7 passou verify/eval/bench; `@types/node` em `^24` + ignore de major no `dependabot.yml`; ADR-111; `pnpm verify` e `pnpm eval --ci` verdes.
- 2026-11-13 · **PUB-04 (README principal mais visual) — CONCLUÍDO** · README EN + pt-BR reescritos com selos, tabela de problema, mermaid de 7 camadas, callouts, CLI com saídas reais, qualidade só com o corpus público, árvore, roadmap e `<details>`; 114 links = 0 quebrados, 16 URLs externas 200, mermaid válido; `pnpm verify` verde (1406 testes).
- Sessões anteriores: PUB-03 em `archive/STATE-log-2026-11-13-pub03.md`; PUB-02 em `archive/STATE-log-2026-11-13-pub02.md`; 2026-11-12 SEG-T05 (`archive/STATE-log-2026-11-12-segt05.md`), 2026-11-11 SEG-T04 (PR #110, ADR-107), `archive/STATE-log-2026-11-11-segt03.md`, `archive/STATE-log-2026-11-11-segt02.md`, `archive/STATE-log-2026-11-11-corpus-vendored.md`, `archive/STATE-log-2026-11-11-e10t04.md`, `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md`, `archive/STATE-log-2026-11-02-e9t04.md`.

Histórico completo: docs/extractor/archive/
