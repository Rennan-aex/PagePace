# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E10 EM ANDAMENTO (2026-11-06)** — T01a (`nonText` no RawPage) pronta; T01b (figuras), T02 (tabelas), T03 (equações), T04 (recortes) pendentes. E9/E8/E7/E6/E5/E4/E3 fechadas.
- **Próxima tarefa:** **E10-T01b — figuras** (`phases/E10-nontext.md`, seção "Notas de sessão 2026-11-06" tem o plano inteiro). Depois: E10-T02, T03, T04 (ou SEG, ordem a confirmar com o PO/ROADMAP).
- **Ação pendente do PO:** (a) autorizar apagar a branch `ci-baseline-check` (sobrou no remoto, idêntica à main); (b) não apagar a entrega (Release) `corpus-public-v1`; git desde 2026-10-14 (**ADR-054**) o agente faz sozinho com o `gh`.
- **Status:** **PR #90 MESCLADO** (squash `9f19db0`, CI `verify` verde na imagem nova do runner com a correção ADR-099). `pnpm verify` local verde (1143 testes + `check:no-pdf` + `check:docs`); `pnpm eval` sem regressão; baseline/schema intocados.
- **Última atualização:** 2026-11-06 (E10-T01a mesclada + correção do CI com fonte própria).

## Tarefa concluída — E10-T01a (regiões não textuais do RawPage)
- **Módulo:** `ingest/non-text.ts` — `collectNonTextRegions(ops, view)` lê a operator list do pdf.js (CTM com save/restore/forms, imagens = unit square, `constructPath` com `pathMinMax`) e devolve `RawNonTextRegion[]` em coordenadas de página topo-esquerda (mesmo espelho do `glyphBox`), dedupe + ordenação, caixa degenerada descartada.
- **Wire:** `readPage` popula `page.nonText` **só quando não vazio** — página sem arte mantém JSON idêntico ao pré-E10; `columns.ts` só usa `nonText` em `regionSpanning` (não consumido) → colunas/baseline intocadas.
- **Testes:** `src/ingest/non-text.test.ts` (11, TDD) + `test/non-text-pdf.test.ts` (3, inclui heatmap da p3 do phobos); `minipdf.ts` ganhou `images` (`ImageSpec`).
- **Próximo:** T01b (`figures.ts` + intercalação em `buildBlockChunks`) — plano completo em `phases/E10-nontext.md` § "Notas de sessão".

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-11-06 — E10-T01a (nonText do RawPage) CONCLUÍDA E MESCLADA (PR #90, squash `9f19db0`) + CI CORRIGIDO (ADR-099), checks verdes.** Feito (T01a): `ingest/non-text.ts` + 11 testes TDD; wire no `readPage` (chave omitida quando vazia); `minipdf.images` + 3 testes de integração; plano/calibração de T01b–T04 em `phases/E10-nontext.md` § "Notas de sessão". **CI (PO escolheu opção A, ADR-099):** 4 testes de OCR desenhavam `serif` e víam 0 pixels na imagem nova do runner (prova: teste temporário `54c6ad1`, removido `8b126cf`); agora usam a fonte **Source Serif 4** (SIL OFL 1.1, Adobe; Regular/Bold/Italic + licença em `packages/extractor/test/fonts/`, helper `registerTestSerif`/`TEST_SERIF` em `test/test-fonts.ts` — não Liberation/GPL, ADR-020) nos 3 arquivos: `ocr-tesseract.test.ts`, `ocr-style-n5.test.ts`, `index.test.ts`. ADR-099 registrada, BACKLOG 2026-11-06 concluído. `pnpm verify` local verde (1143 testes), `pnpm eval` sem regressão, schema/baseline intocados. **Próximo:** E10-T01b (`figures.ts` + intercalação em `buildBlockChunks`). **Armadilhas:** ordem das matrizes é `compose(ctm, novaMatriz)`; args de repeat são números planos; sonda em `%TEMP%\opencode\probe-e10.mts`; branch `ci-baseline-check` (idêntica à main) sobrou no remoto, apagar só quando o PO autorizar. **Não mexer:** baseline do eval/bench; `packages/app` não existe (só doc).

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- [ ] Não apagar a entrega (Release) `corpus-public-v1`: o `corpus/manifest.yaml` aponta para ela (apagar = CI vermelho com 404).
- [ ] Autorizar apagar a branch `ci-baseline-check` no remoto (sobrou do diagnóstico; regra proíbe apagar sem permissão).

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
- 2026-11-06 · **E10-T01a (regiões não textuais) — CONCLUÍDO** · `ingest/non-text.ts` (`collectNonTextRegions` da operator list do pdf.js) + wire no `readPage` (`page.nonText` só quando não vazio), 14 testes novos (1143 totais), `minipdf.images`, plano de T01b–T04 na fase, verify/eval verdes, schema/baseline intocados. **Mesma sessão:** CI corrigido com fonte OFL própria (opção A do PO, ADR-099, ver Handoff); PR #90 mesclado (squash `9f19db0`).
- 2026-11-02 · **E9-T04 (fluxo escaneado) — CONCLUÍDO** · `isScannedPdf` (probe) + `ingestOcrFlow` (orquestrador portável com progresso) + CLI `extract --ocr/--tessdata` (render escala 2, modelos locais, cache), 15 testes novos (1129 totais), ADR-098, `docs/app/OCR-FLOW.md`, E9 fase fechada, verify/eval verdes.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088; E9-T02 = ADR-095/096).

Histórico completo: docs/extractor/archive/
