# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E7 EM ANDAMENTO** — T01 concluída (2026-10-20, ADR-071), T02 concluída (2026-10-20, ADR-072). E6 CONCLUÍDA — T01 (PR #56); T02 (PR #57); T03, T04 (2026-10-19, ADR-070). E5 fechada (PRs #45–#54); E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37). Tarefas de E7 em `phases/E7-confidence-overlay.md`.
- **Tarefa atual:** nenhuma em andamento — E7-T02 concluída. Próxima sessão: **E7-T03** (teste de reprocessamento: overlay reaplica após mudança leve na extração) em `phases/E7-confidence-overlay.md`.
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (907 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (baseline intacta — E7-T02 não mexeu na extração).
- **Última atualização:** 2026-10-20 (E7-T02 concluída; ADR-072).

## Tarefa atual — nenhuma (E7-T02 fechada; próxima: E7-T03)
- Ver **Fase atual** acima e `phases/E7-confidence-overlay.md` (E7-T03 · teste de reprocessamento).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-20 — E7-T02 (`applyOverlay`) — CONCLUÍDO** · branch `e7-t02-apply-overlay` · `packages/schema/src/apply.ts` no `@pagepace/schema`: 6 ops (merge/split/set_kind/delete/edit_text/set_style) com reancoragem id + busca única por `quote/prefix/suffix` (zero ou 2+ achados = `unapplied`), offsets deslocados pelo delta, ids de split `id#n`, merge retargeta toc/noteRef/âncora, `edit_text` = confiança 1 sem flags, `delete_block` preserva o último bloco, overlay de outro `bookId` = tudo em `unapplied`; resultado validado por `parseBook`; **34 testes**, `pnpm verify` verde (**907 testes**), `pnpm eval --ci` exit 0; **ADR-072**; `package.json` do schema sincronizado em 1.2.0.
- Próxima sessão: **E7-T03** (teste de reprocessamento: Book v1 → overlay → extração alterada → reaplicar; ≥ 95% reancoram, resto em `unapplied`) — `start-session` → `phases/E7-confidence-overlay.md`.
- *(handoffs anteriores: ver Log de sessões e archive/)*
- **Métrica:** `confidence_calibration` = correlação ponto-biserial **negada** confiança × erro (erro = FP do casamento texto+kind, mesma regra do `block_kind_f1`; sem erro = 1, todos errados = 0); `blockConfidenceCalibration` no runner, coluna `conf_calib`, seção própria, `METRIC_DIRECTIONS` higher, gate ≥ 0,5 em todo doc com golden + teste de consistência com `blockKindDetection`.
- **Resultado:** baseline ganhou `confidence_calibration` **1,0000 nos 12** (sintéticos sem bloco errado — calibragem real espera golden com erros); nada piorou (`pnpm eval --ci` exit 0); `pnpm verify` verde (**873 testes**, +34 — 10 modelo + 10 métrica + 14 aceite; prova "falha antes" = módulo inexistente + teste OCR+hífen 0,5→0,3).
- Docs: fase E7 (T01 `done`), `DECISIONS.md` (**ADR-071**), `EVALUATION.md` (seção "Confiança por bloco"), este STATE.
- Próxima sessão: **E7-T02** (`applyOverlay`: merge/split/set_kind/delete/edit_text/set_style com reancoragem) — `start-session` → `phases/E7-confidence-overlay.md`.

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
| E7 | em andamento (T01, T02 done 2026-10-20, ADR-071/072; T03–T05 todo) |
| E8…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-20 · **E7-T02 (`applyOverlay`, correções do leitor) — CONCLUÍDO** · `apply.ts` no `@pagepace/schema` (reancoragem id+citação/busca única, `unapplied` explícito, ids `#n`, verdade do usuário em `edit_text`); **907 testes** (+34); `pnpm eval --ci` exit 0; **ADR-072**.
- 2026-10-20 · **E7-T01 (modelo de confiança + calibragem medida) — CONCLUÍDO** · `confidence.ts` (pesos aditivos por flag, piso 0,1) + `confidence_calibration` no eval (correlação ponto-biserial negada; erro = FP do casamento texto+kind, consistente com `block_kind_f1`); **873 testes** (+34); baseline ganhou a métrica 1,0000 nos 12, `pnpm eval --ci` exit 0; **ADR-071**.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`.

Histórico completo: docs/extractor/archive/
