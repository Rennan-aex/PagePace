# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E5 em andamento** — T01 concluída (PR #45); **T02 concluída (PR #46)**; **T03 concluída (PR #48)**; **T04 concluída (PR #50)**; **T05 concluída (PR #51)**; próxima **E5-T06**. E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E5-T06 — referências bibliográficas** (detalhe em `phases/E5-notes-quotes.md`).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (742 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (`block_kind_f1` = 1,0000 em 9 dos 10 sintéticos).
- **Última atualização:** 2026-10-17 (E5-T05 concluída — listas e legendas).

## Tarefa atual — E5-T06 · Referências (cópia de `phases/E5-notes-quotes.md`)
- Seção "Referências/Bibliografia/References"; blocos `reference` com recuo deslocado. **Aceite:** testes em N2.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-17 — E5-T05 (listas e legendas) — CONCLUÍDO** · branch `e5-t05-lists-captions`.
- `lists.ts` (marcador/numeração decide; recuo raso 0,8 ≤ em < 1,8 decide com flag `uncertain-list`) + `captions.ts` (rótulo `Fig. 3 -`/`Table 2:` com separador + fonte menor ou ≤ 3 linhas; senão `uncertain-caption`).
- Prioridade no `book.ts`: footnote > heading > caption > lista marcada > quote > lista por recuo > paragraph. Fix no gate de heading: marcador de lista não vira heading por centralização (E4-T02; **ADR-063**).
- Sintético `syn-n2-en-lists` (marcada, numerada, legendas 9 pt) 1,0000 em tudo; `syn-n2-pt-estilos` 0,6667 → 1,0000; nenhum regrediu; baseline atualizada; 21 testes novos + 1 heading + aceite E5-T05 em `block-kind.test.ts`.
- Próximo passo: E5-T06 (referências) — léxico de seção igual ao `endnotes.ts`, recuo deslocado, testes em N2.

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
| E5 | in progress (T01 PR #45; T02 PR #46; T03 PR #48; T04 PR #50; T05 PR #51; T06 é a próxima) |
| E6…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 27 documentos (13 públicos + 15 privados); 10 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 10 · `para_boundary_f1` 1,0000 em 9 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 9 de coluna única e 0,1429 em `syn-n2-en-columns` · `header_footer_f1` 1,0000 nos 10 · `hyphen_join_acc` 1,0000 nos 10 (ADR-047) · `style_f1` 1,0000 nos 10 (E4-T01/T05) · `heading_f1`/`heading_level_acc` 1,0000 em 9 dos 10 e 0,0000 em `syn-n2-en-columns` (E4-T02) · `footnote_link_acc` 1,0000 nos 10 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` 1,0000 em 9 dos 10 e 0,0667 em `syn-n2-en-columns` (E5-T04/T05, ADR-062/063).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-17 · **E5-T05 (listas e legendas) — CONCLUÍDO** · **PR #51** · `lists.ts` + `captions.ts` + fix do gate de heading (marcador nunca vira heading por centralização) + sintético `syn-n2-en-lists` (1,0000) + **ADR-063**; **742 testes**; `pnpm eval --ci` exit 0 (`syn-n2-pt-estilos` 1,0000).
- 2026-10-17 · **E5-T04 (citações em bloco e epígrafes) — CONCLUÍDO** · **PR #50** · `quotes.ts` + `block_kind_f1` (macro-média por tipo) + sintético `syn-n3-en-quotes` (1,0000) + **ADR-062**; **718 testes**; `pnpm eval --ci` exit 0.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`.

Histórico completo: docs/extractor/archive/
