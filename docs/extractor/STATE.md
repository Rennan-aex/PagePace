# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E9 CONCLUÍDA (2026-11-02)** — T01–T04 todas `done` (ADR-093–098). E8/E7/E6/E5/E4/E3 fechadas.
- **Próxima tarefa:** **E10 · Não textual** (`phases/E10-nontext.md`: tabelas, equações, figuras) ou **SEG** (`phases/SEG-segmenter.md`, pode rodar a qualquer momento depois do E1 e é exigida antes do M2 do app) — ordem a confirmar com o PO/ROADMAP.
- **Ação pendente do PO:** não apagar a entrega (Release) `corpus-public-v1`; git desde 2026-10-14 (**ADR-054**) o agente faz sozinho com o `gh`.
- **Status:** `pnpm verify` verde (1129 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0; baseline do bench no ar (16 docs, calibrada no CI).
- **Última atualização:** 2026-11-02 (E9-T04 fechada: fluxo escaneado completo, ADR-098).

## Tarefa fechada nesta sessão — E9-T04 (pré-processamento e fluxo de uso)
- **Detector (aceite):** `isScannedPdf(bytes, {assets?})` em `ingest/pdfjs.ts` — probe barato que reusa `documentHasText` (mesmo veredito do `ScannedPdfError`), `RangeError` em bytes vazios, `task.destroy()` em `finally`; 4 testes em `test/scanned-ocr.test.ts`.
- **Orquestrador:** `ingest/ocr-flow.ts` (núcleo portável, regra 6/7) — sequência `renderPage` injetado → `OcrEngine` → `ingestOcr`, `onProgress({page,total})` por página, engine **não** fechada (quem chamou fecha, ADR-095); 6 testes com engine/render fake.
- **CLI (plumbing de produção):** `extract --ocr [--tessdata]` em `runOcrFlow` (`packages/cli/src/index.ts:576`) — no `ScannedPdfError` prepara modelos (`prepareOcrLangs` → cache `.pagepace-cache/ocr-lang/`, ou `tessdataSetup` com pasta própria), `createOcrRenderer` (`packages/cli/src/ocr.ts`) renderiza escala 2 com assets pdf.js (wasm/cmaps), imprime `OCR: página N de M reconhecida` no stderr, grava no mesmo `--cache-dir`; sem `--ocr` o exit 3 ganha a dica `SCANNED_OCR_HINT`. 5 testes novos + 3 atualizados + e2e com PDF-imagem sintético (guardado pela presença dos modelos).
- **Documentação (aceite):** **`docs/app/OCR-FLOW.md`** (detectar → perguntar → segundo plano com progresso; tabela de responsabilidades app×orquestrador×engine; cache; limites) linkada no `docs/app/PROJECT.md`. **Decisão: ADR-098.**

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-11-02 — E9-T04 (fluxo escaneado) CONCLUÍDA** na branch `e9-t04-scanned-flow`. Feito tudo: (1) `isScannedPdf` + 4 testes; (2) `ingestOcrFlow` + 6 testes; (3) CLI `extract --ocr/--tessdata` (`runOcrFlow` + `packages/cli/src/ocr.ts`) com progresso no stderr, 5 testes novos + e2e de PDF-imagem; (4) **ADR-098** (+ `pnpm decisions:index`) e **`docs/app/OCR-FLOW.md`** linkado no PROJECT.md; fase fechada em `phases/E9-ocr.md`. `pnpm verify` verde (1129 testes) e `pnpm eval --ci` exit 0 (baseline intocada), schema intocado. **Próximo:** commit final (inclui fix de formatação de `ocr-flow.test.ts`), push, PR, merge, `report-to-po`. **Depois (nova sessão):** E10 (`phases/E10-nontext.md`) ou SEG — confirmar ordem. **Armadilhas:** `@` no PowerShell exige aspas; testes de OCR guardados por `existsSync` dos `.traineddata.gz`; `node scripts/check-docs-budget.mjs` antes de commitar docs. **Não mexer:** baseline do eval/bench; `packages/app` não existe (só doc).

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
- 2026-11-02 · **E9-T04 (fluxo escaneado) — CONCLUÍDO** · `isScannedPdf` (probe) + `ingestOcrFlow` (orquestrador portável com progresso) + CLI `extract --ocr/--tessdata` (render escala 2, modelos locais, cache), 15 testes novos (1129 totais), ADR-098, `docs/app/OCR-FLOW.md`, E9 fase fechada, verify/eval verdes.
- 2026-11-01 · **E9-T03 (estilo visual) — CONCLUÍDO** · `ingest/ocr-style.ts` (stroke/shear/x-height puros) + `fontFlags` no adaptador OCR + OR em `runs.ts` + `styleFromImage` em `book.ts` (ADR-097, esquema intocado), style_f1 por nível no eval, E2E N5 = 0,9089, 15 testes novos (1114 totais), verify/eval verdes.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088; E9-T02 = ADR-095/096).

Histórico completo: docs/extractor/archive/
