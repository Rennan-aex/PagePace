# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E5 CONCLUÍDA** — T01 (PR #45); T02 (PR #46); T03 (PR #48); T04 (PR #50); T05 (PR #51); T06 (PR #52); T07 (PR #53); T08 (PR #54). **E6 CONCLUÍDA** — T01 (PR #56); T02 (PR #57); T03 concluída (2026-10-19); T04 concluída (2026-10-19, ADR-070). E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37). **Próxima fase: E7** (`phases/E7-confidence-overlay.md`).
- **Tarefa atual:** nenhuma em andamento — E6 fechada. Próxima sessão: ler `phases/E7-confidence-overlay.md` e seguir o protocolo de início (STATE → fase → git → verify → branch).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (839 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (`syn-n2-en-columns`: `block_kind_f1` 1,0000 e `heading_level_acc` 1,0000 — nada piorou, baseline regravada).
- **Última atualização:** 2026-10-19 (E6-T04 concluída; ADR-070).

## Tarefa atual — nenhuma (E6 fechada; próxima: E7)
- Ver **Fase atual** acima e `phases/E7-confidence-overlay.md`.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-19 — E6-T04 (colunas + notas + cabeçalhos) — CONCLUÍDO** · branch `e6-t04-columns-integration` · `TextLine.band` por linha (`lines.ts`), rodapé = linha spanning abaixo da última baseline das colunas lido **depois** das colunas (`paragraphs.ts`), medida por parágrafo em `paragraphMeasures` (`book.ts`), headings/quotes/lists indexam `measures` por parágrafo (marginrefs segue por página); spec `syn-n2-en-columns` `level: 2 → 1` + golden regenerado.
- **Resultado:** `block_kind_f1` 0,5556 → **1,0000**, `heading_level_acc` 0 → **1,0000** (demais N2 intactos), `pnpm eval --ci` exit 0, baseline regravada; `pnpm verify` verde (**839 testes**, 5 novos que falham no código antigo — prova "falha antes" feita).
- Docs: `E6-columns.md` (T04 `done` + resultado), `DECISIONS.md` (**ADR-070**), `EVALUATION.md` (baseline), BACKLOG (junção de parágrafo na quebra de coluna), este STATE.
- Próxima sessão: fase **E7** — `start-session` → `phases/E7-confidence-overlay.md`.

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
| E7…E10, SEG | todo (E7 = confiança/overlay; E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 30 documentos (15 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-19 · **E6-T04 (medida por coluna + rodapé + nível do golden) — CONCLUÍDO** · `TextLine.band` + `paragraphMeasures` por parágrafo (headings/quotes/lists) + rodapé depois das colunas + spec `level: 1`; **839 testes**; `block_kind_f1` 0,5556→1, `heading_level_acc` 0→1; `pnpm eval --ci` exit 0, baseline regravada; **ADR-070**.
- 2026-10-19 · **E6-T03 (regiões laterais/sidebars) — CONCLUÍDO** · `splitSideRegions` (`sidebars.ts`) antes do `detectColumns` no `groupPageParagraphs` (ADR-069) + `side: true` nas linhas + `flags: ["sidebar"]` sem baixar confiança + side fora das medidas + guarda E3-T04; **835 testes**; `pnpm eval --ci` exit 0, baseline intocada; 0 falsos positivos em 137 páginas do corpus público.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`.

Histórico completo: docs/extractor/archive/
