# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E8 CONCLUÍDA (2026-10-29)**; **E9 em andamento — E9-T01 CONCLUÍDA (2026-10-30, spike S7-OCR, ADR-093/094)**. E7/E6/E5/E4/E3 fechadas.
- **Próxima tarefa:** **E9-T02 · Adaptador OCR → `RawDocument`** (produz itens com bbox e texto, `ingest.adapter = "ocr"`, sem estilo; valida no esquema; pipeline roda inalterado) — engine escolhido: **tesseract.js** (ADR-094).
- **Ação pendente do PO:** não apagar a entrega (Release) `corpus-public-v1`; git desde 2026-10-14 (**ADR-054**) o agente faz sozinho com o `gh`.
- **Status:** `pnpm verify` verde (1083 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0; baseline do bench no ar (16 docs, calibrada no CI).
- **Última atualização:** 2026-10-30 (E9-T01 fechada: spike OCR, ADR-093/094, relatório S7).

## Tarefa fechada nesta sessão — E9-T01 (spike OCR)
- **Relatório `docs/extractor/spikes/S7-ocr.md`** (S6 estava ocupado pelo spike de fonte quebrada) + probe `packages/extractor/spikes/s7-ocr-probe.ts` (render pdf.js + tjs + nativo + CER). **Medições (páginas reais):** CER 1–2% vs transcrição humana (pt `n5-pt-astrofisica`, en antigo `n5-en-newton`), 0,25–0,8% vs camada OCR embutida do `n1-en-lostworld`; tjs ≈ nativo (mesmo motor/modelo `best_int`); tjs 1,5–2,9 s/pág no PC; payload ~10–12 MB 1ª carga; ML Kit: pesquisa (licença Google não-OSI, +4MB bundled, bbox+conf nativos), não medido em aparelho.
- **Decisões:** ADR-093 (`tesseract.js` devDependency do spike, Apache-2.0) e **ADR-094 (engine = tesseract.js; nativo = CLI de conferência; ML Kit = acelerador Android opcional, reabre com medição em aparelho + PO)**. **Achado:** scans JBIG2/JPX exigem `wasmUrl` do pdf.js, senão o render sai em branco silencioso.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-30 — E9-T01 (spike OCR) FECHADA.** Feito: probe `s7-ocr-probe.ts` (render + tjs + nativo + CER, receita S1 com `wasmUrl`), medições pt/en reais, golds manuais só em `.pagepace-cache` (gitignored), relatório `spikes/S7-ocr.md`, ADR-093/094, fase E9-T01 `done` com Resultado, STATE atualizado. **Próxima tarefa:** E9-T02 (adaptador OCR → `RawDocument`, engine = tesseract.js pela ADR-094 — antes dela, tesseract.js é só devDependency de spike; a E9-T02 decide onde a dependência de produção mora, atrás de interface, sem Node APIs no núcleo — regra 6). **Armadilhas desta tarefa:** PowerShell trata `@` de pacote npm como splatting (usar aspas); `render` sobrescreve PNG por (id,página) — escala não entra no nome; páginas JBIG2/JPX em branco sem `wasmUrl` do pdf.js (silencioso); `n5-pt-astrofisica` tem páginas genuinamente em branco (cheque o tamanho do PNG antes de medir); winget do Tesseract já instalado na máquina (`C:\Program Files\Tesseract-OCR`), não reinstalar. **Não mexer:** baseline do eval/bench intocados (spike não altera heurística).

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
| E9 | **em curso** (T01 done 2026-10-30, ADR-093/094; T02–T04 todo; E9 = OCR da ADR-018) |
| E10, SEG | todo (E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-30 · **E9-T01 (spike OCR) — CONCLUÍDO** · relatório S7 + probe s7-ocr-probe.ts; CER 1–2% vs gold humano (pt/en), tjs ≈ nativo, 1,5–2,9 s/pág WASM no PC; ADR-093/094; ML Kit documentado como opcional; `pnpm verify` verde.
- 2026-10-29 · **E8-T04 (fechamento) — CONCLUÍDO** · medições Android 3/3 (lostworld 667 ms/pág; astrofisica p95 3.133 ms; memória pico 282 MB via adb), ADR-092, fase E8 fechada; parte do PC: `pnpm bench` (PR #80, ADR-091), 1083 testes.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088).

Histórico completo: docs/extractor/archive/
