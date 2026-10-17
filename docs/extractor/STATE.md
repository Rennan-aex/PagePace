# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E5 em andamento** — T01 concluída (PR #45); **T02 concluída (PR #46)**; **T03 concluída (PR #48)**; **T04 concluída (PR #50)**; próxima **E5-T05**. E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E5-T05 — listas e legendas** (cópia abaixo; detalhe em `phases/E5-notes-quotes.md`).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (718 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (`block_kind_f1` = 1,0000 no `syn-n3-en-quotes`).
- **Última atualização:** 2026-10-17 (E5-T04 concluída — detecção de citações + métrica `block_kind_f1`).

## Tarefa atual — E5-T05 · Listas e legendas (cópia de `phases/E5-notes-quotes.md`)
- Marcadores/numeração, recuo. Legendas próximas a figuras/tabelas (`caption`). **Aceite:** testes.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-17 — E5-T04 (citações em bloco e epígrafes) — CONCLUÍDO** · branch `e5-t04-block-quotes`.
- Detector `quotes.ts` (camada 4): porta recuo ≥ 1,8 em; epígrafo = ≤ 4 linhas + (itálico ≥ 0,6 ou fonte < 0,95 × corpo); blockquote = recuo sozinho; prioridade footnote > heading > quote > paragraph; flag `uncertain-quote` + conf 0,7.
- Métrica `block_kind_f1` (macro-média dos F1 por tipo, casamento por texto multiconjunto como `heading_f1`); `blockKindDetection` no runner; coluna + seção no relatório; `METRIC_DIRECTIONS` = higher.
- Sintético `syn-n3-en-quotes` (epígrafo + blockquote; atribuição `--` porque minipdf só grava ASCII); 14 testes `quotes` + 8 `metrics` + aceite `block-kind.test.ts` (N3 ≥ 0,95, guardião multi-tipo).
- Baseline: `syn-n3-en-quotes` 1,0000; `syn-n2-pt-estilos` 0,6667 (list_item → alvo E5-T05); `syn-n2-en-columns` 0,0667 (alvo E6); nenhum outro regrediu. **ADR-062**.

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
| E5 | in progress (T01 PR #45; T02 PR #46; T03 PR #48; T04 PR #50; T05 é a próxima) |
| E6…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 26 documentos (13 públicos + 15 privados); 9 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 9 · `para_boundary_f1` 1,0000 em 8 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 8 de coluna única e 0,1429 em `syn-n2-en-columns` · `header_footer_f1` 1,0000 nos 9 · `hyphen_join_acc` 1,0000 nos 9 (ADR-047) · `style_f1` 1,0000 nos 9 (E4-T01/T05) · `heading_f1`/`heading_level_acc` 1,0000 em 8 dos 9 e 0,0000 em `syn-n2-en-columns` (E4-T02) · `footnote_link_acc` 1,0000 nos 9 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` 1,0000 em 7 dos 9, 0,6667 em `syn-n2-pt-estilos` (list_item = alvo E5-T05) e 0,0667 em `syn-n2-en-columns` (E5-T04, ADR-062).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-17 · **E5-T04 (citações em bloco e epígrafes) — CONCLUÍDO** · **PR #50** · `quotes.ts` + `block_kind_f1` (macro-média por tipo) + sintético `syn-n3-en-quotes` (1,0000) + **ADR-062**; **718 testes**; `pnpm eval --ci` exit 0.
- 2026-10-17 · **E5-T03 (notas de fim / endnotes) — CONCLUÍDO** · **PR #48** · `endnotes.ts` + fallback de label em `notelinks.ts` + sintético `syn-n3-en-endnotes` (1,0000 em tudo) + **ADR-061** (sem mudança de esquema); **690 testes**; `pnpm eval --ci` exit 0 (baseline 8 × 1,0000).
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`.

Histórico completo: docs/extractor/archive/
