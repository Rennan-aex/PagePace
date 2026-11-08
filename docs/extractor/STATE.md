# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E10 EM ANDAMENTO (2026-11-06)** — T01 (`nonText` no RawPage + figuras) pronta; T02 (tabelas), T03 (equações), T04 (recortes) pendentes. E9/E8/E7/E6/E5/E4/E3 fechadas.
- **Próxima tarefa:** **E10-T02 — tabelas** (`phases/E10-nontext.md`, § "Plano — E10-T02"). Depois: T03 (equações), T04 (recortes, depende de OPEN-QUESTIONS #1).
- **Ação pendente do PO:** não apagar a entrega (Release) `corpus-public-v1`; git desde 2026-10-14 (**ADR-054**) o agente faz sozinho com o `gh`. (Branch `ci-baseline-check` apagada em 2026-11-06 com autorização do PO.)
- **Status:** **PR #94 MESCLADO** (squash `5e86bf3`, CI `verify` verde) — E10-T01b fechada. `pnpm verify` local verde (1157 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0; baseline/schema intocados; **ADR-100** registrada.
- **Última atualização:** 2026-11-06 (E10-T01b figuras concluída).

## Tarefa atual — E10-T02 (tabelas) · copiada da fase em 2026-11-06
- **Da fase (aceite):** Detectar tabelas por alinhamento de colunas/linhas de grade; bloco `table` com `placeholder` e, se possível, células. **Aceite:** metade das tabelas simples do corpus N4 detectadas; nunca misturar células no texto corrido.
- **Plano:** agrupar parágrafos consecutivos (mesma página/banda, gap ≤ fator×bodyFont) com gaps grandes alinhados entre linhas; anti dot-leader; **mesclar execuções consecutivas de linhas de tabela em UM bloco `table`** (hoje cada linha vira parágrafo) com embeddings de células em `placeholder.description` (TSV); prioridade de kind `table > equation > list > quote` (leitura registrada na ADR-100). Falsos positivos conhecidos: TOC `n4-en-astrofisica` p2 / `n4-pt` p9. Detalhe: `phases/E10-nontext.md` § "Plano — E10-T02".
- **Base pronta:** `ingest/non-text.ts` (T01a) lê `page.nonText`; `figures.ts` + a intercalação de `buildBlockChunks` (T01b) mostram o padrão de bloco novo com `placeholder`.
- **Medição:** `n4-en-fisica` p6-p8 e `n4-pt-astrofisica` p18 (linhas de tabela hoje viram parágrafos com gaps de célula ~57-78pt; T02 usa `page.nonText` para achar a grade).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-11-06 — E10-T01b (figuras) CONCLUÍDA E MESCLADA (PR #94, squash `5e86bf3`), ADR-100, verify/eval verdes.** Feito: `src/figures.ts` (`detectFigures` puro: área 1%–90% da página, merge com gap ≤ 1,2×body nos dois eixos, legenda da E5-T05 a ≤ 3×body abaixo com sobreposição horizontal → texto em `placeholder.description`, Opção A sem bump de esquema); wire no `analyzeDocument` (`BookAnalysis.figures`) e em `buildBlockChunks` (intercalação `insertBefore` por banda, `figureOnlyChunks` para página sem parágrafo, `endnoteFlags.push(false)`); exports em `index.ts`; 11 unitários (`src/figures.test.ts`) + 3 de integração (`test/figure-pdf.test.ts` — os 3 rodam, `corpus/public` existe). `pnpm verify` 1157 testes; `pnpm eval --ci` exit 0; schema/baseline intocados; fase E10 atualizada. **Próximo:** E10-T02 (tabelas). **Armadilhas:** um evento `blocks` por página é invariant testado (`pipeline.test.ts:62`) — a figura entra no chunk da página e o "chunk próprio" do plano vale só para a página sem parágrafo; `blockIndexByParagraph` limpa a cada página e a busca do âncora é limitada por `lastParagraphIndex`; rode `biome check --write` **só** nos arquivos da tarefa (o `noUselessContinue` de `ingest/non-text.ts` é info pré-existente, não é erro). **Não mexer:** baseline do eval/bench; `packages/app` não existe (só doc).

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
- 2026-11-06 · **E10-T01b (figuras) — CONCLUÍDO** · `figures.ts` (`detectFigures`) + intercalação por banda em `buildBlockChunks` + `figureOnlyChunks`, 14 testes novos (1157 totais), ADR-100 (bloco `caption` mantido, texto em `placeholder.description`), fase atualizada, verify/eval verdes (schema/baseline intocados). PR #94 (squash `5e86bf3`).
- 2026-11-06 · **E10-T01a (regiões não textuais) — CONCLUÍDO** · `ingest/non-text.ts` (`collectNonTextRegions` da operator list do pdf.js) + wire no `readPage` (`page.nonText` só quando não vazio), 14 testes novos (1143 totais), `minipdf.images`, plano de T01b–T04 na fase, verify/eval verdes, schema/baseline intocados. **Mesma sessão:** CI corrigido com fonte OFL própria (opção A do PO, ADR-099); PR #90 mesclado (squash `9f19db0`).
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md`, `archive/STATE-log-2026-11-02-e9t04.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088; E9-T02 = ADR-095/096; E9-T04 = ADR-098).

Histórico completo: docs/extractor/archive/
