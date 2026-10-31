# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E8 CONCLUÍDA (2026-10-29)**; **E9 em andamento — E9-T01 e E9-T02 CONCLUÍDAS (2026-10-30/31)**. E7/E6/E5/E4/E3 fechadas.
- **Próxima tarefa:** **E9-T03 · Estilo a partir da imagem** (heurística visual para itálico/negrito/tamanho, opcional; cair para "sem estilo" com baixa confiança; aceite: `style_f1` medido separadamente para N5).
- **Ação pendente do PO:** não apagar a entrega (Release) `corpus-public-v1`; git desde 2026-10-14 (**ADR-054**) o agente faz sozinho com o `gh`.
- **Status:** `pnpm verify` verde (1099 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0; baseline do bench no ar (16 docs, calibrada no CI).
- **Última atualização:** 2026-10-31 (E9-T02 fechada: adaptador OCR, ADR-095/096).

## Tarefa fechada nesta sessão — E9-T02 (adaptador OCR → RawDocument)
- **`packages/extractor/src/ingest/ocr.ts`** (núcleo portável, sem import de engine/plataforma — regra 6): tipos `OcrWord`/`OcrLine`/`OcrPageInput`/`OcrEngine`, `ocrPageToRawPage` (bbox pixels ÷ escala 2 → pontos, fonte `"unknown"`, `fontSize` da altura do box, sem `fontFlags`, `hasEOL` na última palavra de cada linha, words vazias/degeneradas caem fora) e `ingestOcr` (documento com `ingest.adapter = "ocr"`, `source.ocrTextLayer = true`, `tagged: false`, validação por página + envelope E8-T03). **`ingest/ocr-tesseract.ts`:** `createTesseractOcrEngine` — worker único reutilizado, OEM LSTM_ONLY, `langPath` obrigatório (sem CDN), versão `TESSERACT_JS_VERSION` gravada no `adapterVersion`.
- **Decisões:** **ADR-095** (`tesseract.js` vira production dependency do extractor, atrás da interface `OcrEngine`; `@tesseract.js-data/*`/`@napi-rs/canvas` só em devDependencies) e **ADR-096** (adaptador seta `ocrTextLayer = true` → pipeline inalterado: confiança 0,5, warning `ocr-text-layer`, runs sem estilo). **Testes:** 12 unitários (`src/ingest/ocr.test.ts`, fake engine + `buildBook` inalterado) + 4 integração (`test/ocr-tesseract.test.ts`, PNG sintético napi-canvas, guardados pela presença dos modelos); 1099 totais, verify/eval verdes.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-31 — E9-T02 (adaptador OCR) FECHADA.** Feito: `ingest/ocr.ts` + `ingest/ocr-tesseract.ts` + exports + 16 testes, `tesseract.js` production dependency do extractor, ADR-095/096, fase E9-T02 `done` com Resultado, STATE atualizado. **Próxima tarefa:** E9-T03 (estilo visual a partir da imagem — heurística opcional, cai para "sem estilo" com baixa confiança; aceite: `style_f1` medido para N5; o adaptador de hoje emite palavras sem `fontFlags` e a E9-T03 é quem decide se reabilita bold/italic via OCR). **Armadilhas desta tarefa:** napi-canvas `encode("png")` é async (retorna Promise); o worker tesseract.js em Node só lê `Buffer`/path (não `Uint8Array` cru); **sem `cachePath` o worker grava `*.traineddata` no cwd** (apontar o cache para o mesmo dir do `langPath`); `@` em nomes de pacote no PowerShell exige aspas; modelos vêm de `@tesseract.js-data/*` descompactados com `gzip: false` (receita S7 `prep`); testes de integração são guardados por `existsSync` dos `.traineddata.gz` — não quebrar CI sem os devDeps. **Não mexer:** baseline do eval/bench intocados; `ingest/ocr.ts` não pode importar tesseract.js (regra 6).

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
| E9 | **em curso** (T01/T02 done 2026-10-30/31, ADR-093/094/095/096; T03–T04 todo; E9 = OCR da ADR-018) |
| E10, SEG | todo (E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-31 · **E9-T02 (adaptador OCR) — CONCLUÍDO** · `ingest/ocr.ts` + `ingest/ocr-tesseract.ts`, `ingest.adapter = "ocr"`, pipeline inalterado, 16 testes novos (1099 totais), ADR-095/096, `pnpm verify`/`eval --ci` verdes.
- 2026-10-30 · **E9-T01 (spike OCR) — CONCLUÍDO** · relatório S7 + probe s7-ocr-probe.ts; CER 1–2% vs gold humano (pt/en), tjs ≈ nativo, 1,5–2,9 s/pág WASM no PC; ADR-093/094; ML Kit documentado como opcional; `pnpm verify` verde.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088).

Histórico completo: docs/extractor/archive/
