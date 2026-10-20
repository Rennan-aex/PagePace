# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E7 EM ANDAMENTO** — T01 concluída (2026-10-20, ADR-071), T02 concluída (2026-10-20, ADR-072), T03 concluída (2026-10-20, ADR-073). E6 CONCLUÍDA — T01 (PR #56); T02 (PR #57); T03, T04 (2026-10-19, ADR-070). E5 fechada (PRs #45–#54); E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37). Tarefas de E7 em `phases/E7-confidence-overlay.md`.
- **Tarefa atual:** nenhuma em andamento — E7-T03 concluída. Próxima sessão: **E7-T04** (dados para "ver original": `origin.bbox` + API de render da página/região) em `phases/E7-confidence-overlay.md`.
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (909 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (baseline intacta — E7-T03 só adicionou teste).
- **Última atualização:** 2026-10-20 (E7-T03 concluída; ADR-073).

## Tarefa atual — nenhuma (E7-T03 fechada; próxima: E7-T04)
- Ver **Fase atual** acima e `phases/E7-confidence-overlay.md` (E7-T04 · dados para "ver original").

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-20 — E7-T03 (teste de reprocessamento) — CONCLUÍDO** · branch `e7-t03-reprocess-test` · `packages/extractor/test/reprocess-overlay.test.ts`: PDF sintético (minipdf) pela pipeline de produção → Book v1 (26 blocos) → overlay do leitor de **42 ops** (os 6 tipos; âncoras únicas verificadas na hora de montar) aplica **100%** → reextração leve **simulada** (ids todos renumerados, 1 parágrafo dividido, 2 fundidos, colofão já removido, 1 parágrafo já cortado no mesmo ponto do leitor) → reaplicação: **40/42 = 95,2% reancoram** por citação; as 2 que a nova extração já resolveu (`split-cartographer`, `drop-colophon`) voltam em `unapplied` na ordem do overlay; + teste de determinismo; **909 testes** (+2), `pnpm eval --ci` exit 0; **ADR-073**; nenhum código de produção mudou.
- Próxima sessão: **E7-T04** (dados para "ver original": `origin.bbox` por bloco + API para renderizar página/região com PDF.js) — `start-session` → `phases/E7-confidence-overlay.md`.
- *(handoffs anteriores: ver Log de sessões e archive/)*

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- [ ] Não apagar a entrega (Release) `corpus-public-v1`: o `corpus/manifest.yaml` aponta para ela (apagar = CI vermelho com 404).

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
| E7 | em andamento (T01–T03 done 2026-10-20, ADR-071/072/073; T04–T05 todo) |
| E8…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-20 · **E7-T03 (teste de reprocessamento) — CONCLUÍDO** · `reprocess-overlay.test.ts` no extractor (minipdf → pipeline real → overlay 42 ops 100% → reextração simulada → 40/42 = 95,2% reancoram, 2 em `unapplied`); **909 testes** (+2); `pnpm eval --ci` exit 0; **ADR-073**.
- 2026-10-20 · **E7-T02 (`applyOverlay`, correções do leitor) — CONCLUÍDO** · `apply.ts` no `@pagepace/schema` (reancoragem id+citação/busca única, `unapplied` explícito, ids `#n`, verdade do usuário em `edit_text`); **907 testes** (+34); `pnpm eval --ci` exit 0; **ADR-072**.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`.

Histórico completo: docs/extractor/archive/
