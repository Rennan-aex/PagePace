# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E8 CONCLUÍDA (2026-10-29)**; **E9 em andamento — E9-T01/T02/T03 CONCLUÍDAS (2026-10-30/11-01)**. E7/E6/E5/E4/E3 fechadas.
- **Próxima tarefa:** **E9-T04 · Pré-processamento e fluxo de uso** (detectar escaneado → perguntar ao usuário no app → processar em segundo plano com progresso; aceite: teste do detector + documentação do fluxo para `docs/app`). O plumbing render pdf.js → engine → raster (receita S7/`renderPagesPng`) ainda não existe em produção — E9-T02/T03 exportam as peças; a T04 plumba o fluxo.
- **Ação pendente do PO:** não apagar a entrega (Release) `corpus-public-v1`; git desde 2026-10-14 (**ADR-054**) o agente faz sozinho com o `gh`.
- **Status:** `pnpm verify` verde (1114 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0; baseline do bench no ar (16 docs, calibrada no CI).
- **Última atualização:** 2026-11-01 (E9-T03 fechada: heurística visual de estilo, ADR-097).

## Tarefa fechada nesta sessão — E9-T03 (estilo visual a partir da imagem)
- **`packages/extractor/src/ingest/ocr-style.ts`** (núcleo puro, regra 6/7): `OcrRaster` grayscale injetado; `estimatePageWordStyles` mede por palavra stroke (distância tinta→fundo ÷ mediana da página → bold), shear projection-profile (faixa 5–25° + margem → italic) e x-height/0,5 (fontSize); confiança da imagem **e** do engine (`OcrWord.confidence`) abaixo do piso → `{ styleConfidence: 0 }` (fallback "sem estilo"). **`ingest/ocr.ts`:** `OcrPageInput.image?` opcional; `ocrPageToRawPage` grava `fontFlags`/`fontSize` refinado só nas palavras confiáveis (÷ scale); `ingestOcr` valida dims/luminance do raster. **Pipeline:** `runs.ts:itemRunStyle` OR com `fontFlags` (padrão headings/quotes) + `book.ts` `styles: !fromOcr || styleFromImage` (`styleFromImage` = algum item com `fontFlags.bold/italic`, sinal único — ADR-097, esquema intocado).
- **Decisões:** **ADR-097** (heurística pura + sinal `fontFlags`, sem campo novo no esquema). **Testes:** 9 unitários da heurística (`ocr-style.test.ts`, rasters bitmap à mão) + 5 novos em `ocr.test.ts` (raster, fallback, RangeError, buildBook reabilitado) + E2E N5 no eval (`packages/eval/src/ocr-style-n5.test.ts`, canvas+tesseract+`blockStyleF1` = 0,9089); `LevelSummary` do eval ganhou `styleF1` (coluna por nível). 1114 testes, verify/eval verdes, baseline intocada (diff 0,0000).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-11-01 — E9-T03 (estilo visual) FECHADA** na branch `e9-t03-visual-style` (PR aberto). Feito: `ingest/ocr-style.ts` + integração `ocr.ts`/`runs.ts`/`book.ts` + ADR-097 + 15 testes novos (1114 totais) + E2E N5 (`style_f1` 0,9089) + `style_f1` por nível no relatório do eval; fase E9-T03 `done` com Resultado; verify/eval verdes, baseline intocada. **Próxima tarefa: E9-T04** (detector de escaneado + fluxo app: perguntar → segundo plano com progresso; aceite: teste do detector e doc do fluxo em `docs/app`). **Peças prontas da T04:** `ingestOcr`/`createTesseractOcrEngine`/`estimatePageWordStyles` exportados; render→PNG de página em `packages/cli/src/render-pdf.ts` (`renderPagesPng`, devDep napi-canvas); receita S7 (`spikes/s7-ocr-probe.ts`) tem `wasmUrl` para JBIG2/JPX e o `prep` dos modelos. **Armadilhas que continuam:** `encode("png")` async; worker lê Buffer/path; sem `cachePath` suja cwd; `@` no PowerShell exige aspas; testes de integração guardados por `existsSync` dos `.traineddata.gz`. **Não mexer:** schema intocado (sinal é a presença de `fontFlags` — ADR-097); baseline do eval/bench.

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
| E9 | **em curso** (T01/T02/T03 done 2026-10-30/11-01, ADR-093–097; T04 todo; E9 = OCR da ADR-018) |
| E10, SEG | todo (E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-11-01 · **E9-T03 (estilo visual) — CONCLUÍDO** · `ingest/ocr-style.ts` (stroke/shear/x-height puros) + `fontFlags` no adaptador OCR + OR em `runs.ts` + `styleFromImage` em `book.ts` (ADR-097, esquema intocado), style_f1 por nível no eval, E2E N5 = 0,9089, 15 testes novos (1114 totais), verify/eval verdes.
- 2026-10-31 · **E9-T02 (adaptador OCR) — CONCLUÍDO** · `ingest/ocr.ts` + `ingest/ocr-tesseract.ts`, `ingest.adapter = "ocr"`, pipeline inalterado, 16 testes novos (1099 totais), ADR-095/096, `pnpm verify`/`eval --ci` verdes.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088).

Histórico completo: docs/extractor/archive/
