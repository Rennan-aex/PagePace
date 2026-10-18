# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E5 em andamento** — T01 concluída (PR #45); **T02 concluída (PR #46)**; **T03 concluída (PR #48)**; **T04 concluída (PR #50)**; **T05 concluída (PR #51)**; **T06 concluída** (PR em abertura); próxima **E5-T07**. E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E5-T07 — numeração marginal (Bekker/Stephanus)** (detalhe em `phases/E5-notes-quotes.md`).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (754 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (`block_kind_f1` = 1,0000 em 10 dos 11 sintéticos, 0,0667 só em `syn-n2-en-columns`).
- **Última atualização:** 2026-10-17 (E5-T06 concluída — referências bibliográficas).

## Tarefa atual — E5-T07 · Numeração marginal (cópia de `phases/E5-notes-quotes.md`)
- Números/pontos nas margens (`1094a`, `327a`) viram `margin_ref`, fora do fluxo, mas com posição relativa ao texto. **Aceite:** fixture sintética; REQ-19 (P2, pode ser adiado via BACKLOG se não houver PDF real no corpus).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-17 — E5-T06 (referências bibliográficas) — CONCLUÍDO** · branch `e5-t06-references`.
- `references.ts` (camada 4): título de seção com igualdade exata normalizada no léxico en/pt (`normalizeSectionTitle`, antes `normalizeEndnoteTitle`) + forma de entrada (`opensLikeReference`: `[1]`, `(2020)`/`2019,`, inicial maiúscula/dígito/aspas); para na 1ª decisão `heading` e no 1º parágrafo sem a forma; recuo não participa (**ADR-064**).
- Prioridade no `book.ts`: **reference > footnote > heading > caption > lista > quote** > paragraph. Sem flag, sem mudança de esquema.
- Sintético `syn-n2-en-references` 1,0000 em tudo; nenhum documento existente mudou; 11 testes em `references.test.ts` + aceite E5-T06 em `block-kind.test.ts`; corpus real: rebus 85 blocos `reference` (+5 docs com 1–2); FPs residuais de `n2-en-astrofisica` = coluna (alvo E6).
- Próximo passo: E5-T07 (numeração marginal `1094a`) — fixture sintética + REQ-19; se não houver PDF real no corpus, avaliar adiamento via BACKLOG.

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
| E5 | in progress (T01 PR #45; T02 PR #46; T03 PR #48; T04 PR #50; T05 PR #51; T06 concluída; T07 é a próxima) |
| E6…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 30 documentos (15 públicos + 15 privados); 11 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 11 · `para_boundary_f1` 1,0000 em 10 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 10 de coluna única e 0,1429 em `syn-n2-en-columns` · `header_footer_f1` 1,0000 nos 11 · `hyphen_join_acc` 1,0000 nos 11 (ADR-047) · `style_f1` 1,0000 nos 11 (E4-T01/T05) · `heading_f1`/`heading_level_acc` 1,0000 em 10 dos 11 e 0,0000 em `syn-n2-en-columns` (E4-T02) · `footnote_link_acc` 1,0000 nos 11 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` 1,0000 em 10 dos 11 e 0,0667 em `syn-n2-en-columns` (E5-T04/T05/T06, ADR-062/063/064).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-17 · **E5-T06 (referências bibliográficas) — CONCLUÍDO** · **PR #52** · `references.ts` (título de seção en/pt + forma de entrada; `reference` acima de tudo) + sintético `syn-n2-en-references` (1,0000) + **ADR-064**; **754 testes**; `pnpm eval --ci` exit 0.
- 2026-10-17 · **E5-T05 (listas e legendas) — CONCLUÍDO** · **PR #51** · `lists.ts` + `captions.ts` + fix do gate de heading (marcador nunca vira heading por centralização) + sintético `syn-n2-en-lists` (1,0000) + **ADR-063**; **742 testes**; `pnpm eval --ci` exit 0 (`syn-n2-pt-estilos` 1,0000).
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`.

Histórico completo: docs/extractor/archive/
