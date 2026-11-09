# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E10 EM ANDAMENTO (2026-11-06)** — T01 (`nonText` no RawPage + figuras) e T02 (tabelas) prontas; T03 (equações), T04 (recortes) pendentes. E9/E8/E7/E6/E5/E4/E3 fechadas.
- **Próxima tarefa:** **E10-T03 — equações** (`phases/E10-nontext.md`, § "Plano — E10-T03"). Depois: T04 (recortes, depende de OPEN-QUESTIONS #1).
- **Ação pendente do PO:** não apagar a entrega (Release) `corpus-public-v1`; git desde 2026-10-14 (**ADR-054**) o agente faz sozinho com o `gh`. (Branch `ci-baseline-check` apagada em 2026-11-06 com autorização do PO.)
- **Status:** **E10-T02 PR aberto (número a preencher no merge)** — branch `e10-t02-detect-tables`. `pnpm verify` local verde (1174 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0; baseline/schema intocados; **ADR-101** registrada.
- **Última atualização:** 2026-11-06 (E10-T02 tabelas concluída).

## Tarefa atual — E10-T03 (equações) · copiada da fase em 2026-11-06
- **Da fase (aceite):** Detectar linhas com fontes matemáticas/símbolos; bloco `equation` (placeholder com recorte de página). **Aceite:** equações não entram no texto do parágrafo como lixo.
- **Plano:** detecção `mathFontShare ≥ ~0,25` **OU** `symbolDensity ≥ ~0,2` (+ `=` ou linha curta); fontes `rtxmi|txsy|txex|CMMI|CMSY|CMEX...`; `n4-en-fisica` sem fontes math → cair só na densidade de símbolos. Mesclar parágrafos de equação consecutivos em um bloco `equation`. Detalhe: `phases/E10-nontext.md` § "Plano — E10-T03".
- **Base pronta:** `tables.ts` (T02) mostra o padrão de detector + `splitParagraphsAtTables` no `book.ts`; ADR-100 já fixou a prioridade `table > equation > list > quote`.
- **Medição:** equações de `n4-en-fisica` (hoje viram parágrafo com lixo de símbolo); FPs conhecidos: TOC e tabelas já cobertas pela T02.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão concluída: E10-T02 (tabelas).** Feito: `src/tables.ts` (`detectTables`, gates finais em ADR-101/BACKLOG), wire em `book.ts` (`splitParagraphsAtTables` → UM bloco `table` com TSV), 10 unitários + 7 integração (`table-pdf.test.ts`), fase/STATE/DECISIONS/BACKLOG atualizados, `pnpm verify` verde (1174), `pnpm eval --ci` exit 0.
- **Próximo passo:** commit + push + PR da branch `e10-t02-detect-tables`, `gh pr checks` verde → `gh pr merge --squash --delete-branch`, depois report-to-po. Em seguida: E10-T03 (equações).

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
- 2026-11-06 · **E10-T02 (tabelas) — CONCLUÍDO** · `tables.ts` (`detectTables`, gates da ADR-101) + `splitParagraphsAtTables` em `book.ts` (UM bloco `table` com TSV), 17 testes novos (1174 totais), fase/STATE/DECISIONS/BACKLOG atualizados, verify/eval verdes (`eval --ci` exit 0; schema/baseline intocados). PR aberto na branch `e10-t02-detect-tables`.
- 2026-11-06 · **E10-T01b (figuras) — CONCLUÍDO** · `figures.ts` (`detectFigures`) + intercalação por banda em `buildBlockChunks` + `figureOnlyChunks`, 14 testes novos (1157 totais), ADR-100 (bloco `caption` mantido, texto em `placeholder.description`), fase atualizada, verify/eval verdes (schema/baseline intocados). PR #94 (squash `5e86bf3`).
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md`, `archive/STATE-log-2026-11-02-e9t04.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088; E9-T02 = ADR-095/096; E9-T04 = ADR-098).

Histórico completo: docs/extractor/archive/
