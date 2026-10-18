# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E5 CONCLUÍDA** — T01 (PR #45); T02 (PR #46); T03 (PR #48); T04 (PR #50); T05 (PR #51); T06 (PR #52); T07 (PR #53); T08 (**PR #54**, mergeado 2026-10-18). Próximo marco: **E6 (colunas e ordem de leitura)**. E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E6-T01 — detecção de colunas** (detalhe em `phases/E6-columns.md`).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (773 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (nenhuma métrica piorou com a E5-T08).
- **Última atualização:** 2026-10-18 (E5-T08 mergeada; E5 fechada).

## Tarefa atual — E6-T01 · Detecção de colunas (cópia de `phases/E6-columns.md`)
- Análise de vazios verticais (projeção) por página; 1, 2 ou 3 colunas; tratar títulos e figuras que atravessam colunas. **Aceite:** fixtures sintéticas de 1/2 colunas passam.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-18 — E5-T08 (grego/latim) — CONCLUÍDA (PR #54)** · merge `40a5f38` na `main`, branch remota apagada.
- O que ficou: `greek.ts` (camada 5: `lang: "grc"` se todas as letras do run são grego e ≥ 3, latim nunca marcado); `tagGreekRuns` no fim de `book.ts`; `minipdf` + `/ToUnicode` para o sintético; aceitação E2E (citação de Platão caractere a caractere + `n2-en-arxiv-phobos` público); ADR-066. Sem mudança de esquema, golden nem métrica.
- Próxima sessão: `pnpm verify` verde antes de mexer em algo → branch `e6-t01-columns` a partir de `main` → seguir `phases/E6-columns.md` (skill `start-session` + `add-heuristic`).
- Armadilha conhecida da E6: `syn-n2-en-columns` está no baseline com `para_boundary_f1` 0,0000 e `block_kind_f1` 0,0667 — o objetivo da E6 é melhorar esses números sem piorar N1/N3.

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
| E6…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 30 documentos (15 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` 1,0000 em 11 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 11 de coluna única e 0,1429 em `syn-n2-en-columns` · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1`/`heading_level_acc` 1,0000 em 11 dos 12 e 0,0000 em `syn-n2-en-columns` (E4-T02) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` 1,0000 em 11 dos 12 e 0,0667 em `syn-n2-en-columns` (E5-T04/T05/T06/T07, ADR-062/063/064/065).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-18 · **E5-T08 (trechos em grego/latim) — CONCLUÍDO** · **PR #54** · `greek.ts` (lang "grc" por bloco óbvio de letras gregas; latim não marcado) + aceitação E2E (sintético `/ToUnicode` + `n2-en-arxiv-phobos` público) + **ADR-066**; **773 testes**; `pnpm eval --ci` exit 0 (sem mudança de métrica); **E5 fechada**.
- 2026-10-18 · **E5-T07 (numeração marginal) — CONCLUÍDO** · **PR #53** · `marginrefs.ts` (forma + posição; `margin_ref` acima de tudo; `origin.bbox`) + sintético `syn-n2-en-marginrefs` (1,0000) + **ADR-065**; **769 testes**; `pnpm eval --ci` exit 0; REQ-19 → BACKLOG.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`.

Histórico completo: docs/extractor/archive/
