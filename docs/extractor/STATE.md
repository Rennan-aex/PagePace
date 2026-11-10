# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E10 EM ANDAMENTO (2026-11-10)** — T01 (figuras), T02 (tabelas) e T03 (equações) prontas; só T04 (recortes) pendente. E9/E8/E7/E6/E5/E4/E3 fechadas.
- **Próxima tarefa:** **E10-T04 — recortes de imagem** (`phases/E10-nontext.md`, § "Plano — E10-T04"): teste ligando `origin.bbox` de `figure` a `renderPageRegion`; a decisão de produto já existe (**ADR-016** — OPEN-QUESTIONS #1 respondida em 2026-10-04).
- **Ação pendente do PO:** não apagar a entrega (Release) `corpus-public-v1`; git desde 2026-10-14 (**ADR-054**) o agente faz sozinho com o `gh`. (Branch `ci-baseline-check` apagada em 2026-11-06 com autorização do PO.)
- **Status:** **PR #98 ABERTO** (branch `e10-t03-detect-equations`, aguardando CI/merge) — E10-T03 pronta. `pnpm verify` local verde (1196 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0; baseline/schema intocados; **ADR-102** registrada.
- **Última atualização:** 2026-11-10 (E10-T03 equações concluída).

## Tarefa atual — E10-T04 (recortes) · copiada da fase em 2026-11-10
- **Da fase (aceite):** API para renderizar a região do bloco (PDF.js) para o app exibir em modo normal. **Aceite:** função com teste; decisão de produto registrada.
- **Plano:** teste ligando `origin.bbox` de bloco `figure` a `renderPageRegion` (função e ADR-016 já existem); decisão de produto pendente em `OPEN-QUESTIONS #1`.
- **Base pronta:** `figures.ts` (T01b) já emite `figure` com `origin.bbox`; `renderPageRegion` existe desde a ADR-016 (recorte só no modo normal, nunca na leitura dinâmica).
- **Medição:** o teste é de integração (bbox → PNG não-branco); nenhum doc de eval muda.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão concluída: E10-T03 (equações).** Feito: `src/equations.ts` (`detectEquations`, gates da ADR-102) + `src/claims.ts` (`splitParagraphsAtClaims` genérico, T02 passou a usá-lo) + bloco `equation` (`runs: []`, texto em `placeholder.description`), 22 testes novos (1196 totais), fase/STATE/DECISIONS/BACKLOG atualizados, `pnpm verify` verde, `pnpm eval --ci` exit 0 (schema/baseline intocados). **PR #98 aberto.**
- **Próximo passo:** **E10-T04 (recortes)** — `phases/E10-nontext.md` § "Plano — E10-T04"; branch nova a partir de `main` depois do merge. É a última tarefa da E10.

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
| E7 | done (T01–T05 done 2026-10-20/21, ADR-071/072/073/074/075/076/077 — fase fechada 2026-10-21) |
| E8 | **done** (T01–T04 — fase fechada 2026-10-29; ADR-088/089/090/091/092; medições Android 3/3) |
| E9 | **done** (T01–T04 done 2026-10-30/11-02, ADR-093–098 — fase fechada 2026-11-02; E9 = OCR da ADR-018) |
| E10, SEG | todo (E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-11-10 · **E10-T03 (equações) — CONCLUÍDO** · `equations.ts` (`detectEquations`, gates da ADR-102: run máximo de linhas reivindicáveis + fragmento de fórmula, `PROSE_TAIL`, `symbols > 0`) + `claims.ts` (`splitParagraphsAtClaims`, T02 reusou) + bloco `equation` em `book.ts`, 22 testes novos (1196 totais), fase/STATE/DECISIONS/BACKLOG atualizados, verify/eval verdes (`eval --ci` exit 0; schema/baseline intocados; medido: phobos 20, n2-astro 30, n4-en-astro 62, n4-pt 2080). PR #98.
- 2026-11-06 · **E10-T02 (tabelas) — CONCLUÍDO** · `tables.ts` (`detectTables`, gates da ADR-101) + `splitParagraphsAtTables` em `book.ts` (UM bloco `table` com TSV), 17 testes novos (1174 totais), fase/STATE/DECISIONS/BACKLOG atualizados, verify/eval verdes (`eval --ci` exit 0; schema/baseline intocados). PR #96 (squash `39c697e`).
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md`, `archive/STATE-log-2026-11-02-e9t04.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088; E9-T02 = ADR-095/096; E9-T04 = ADR-098).

Histórico completo: docs/extractor/archive/
