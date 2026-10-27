# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E8 EM ANDAMENTO** (plano em `phases/E8-performance.md`). **E8-T01 fatias 1–2 DONE (2026-10-27, ADR-088)**; falta da E8-T01: fatia 3 (progresso na CLI); depois E8-T02 (cache), E8-T03 fatia 3 (limite de memória) e E8-T04 (benchmarks). E7 CONCLUÍDA (2026-10-21, ADR-071–077); E6 (ADR-070); E5/E4/E3 fechadas.
- **Tarefa atual:** **E8-T01 fatia 3 — progresso na CLI + fechamento** (copiada de `phases/E8-performance.md` em 2026-10-27): `pagepace extract` passa a consumir `extractStream` para imprimir progresso por página no **stderr** (stdout byte-idêntico ao de hoje); docs de estado e PR. **Aceite:** testes da CLI verdes (JSON do stdout inalterado), progresso visível no stderr, `pnpm verify` + `pnpm eval --ci` verdes, PR aberto. **Fora de escopo:** heurística, esquema, cache.
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (1020 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (baseline intacto — o streaming mudou o caminho, não o resultado).
- **Última atualização:** 2026-10-27 (E8-T01 fatia 2 fechada).

## Tarefa fechada nesta sessão — E8-T01 fatia 2: `ingestPages` + `extractStream`
- O laço de leitura do `ingestPdfjs` virou o gerador assíncrono `ingestPages` (`ingest/pdfjs.ts`): rende cada `RawPage` assim que lida e retorna o `RawDocument` montado; `ingestPdfjs` é a fachada que drena o stream (byte-idêntico).
- `src/pipeline.ts` traz `extractStream(bytes, options)`: eventos `page` (leitura), `blocks` (cópia estável por página — a finalização anota os blocos vivos, ADR-088) e `book` final profundo igual a `buildBook(ingestPdfjs(bytes))`; erros propagam na iteração; saída antecipada derruba o pdf.js. Exportado no `index.ts` com os tipos do evento.
- Testes: 8 novos (7 em `test/pipeline.test.ts` — identidade sintético/corpus, ordem espiando `getPage`, snapshots, erros; 1 em `test/pdfjs-ingest.test.ts`); `pnpm eval --ci` exit 0 (31 docs).
- Gates: `pnpm verify` verde (**1020 testes**, +8), `pnpm eval --ci` exit 0.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-27d — E8-T01 fatia 2 (`ingestPages` + `extractStream`) — CONCLUÍDA** · branch `e8-t01b-ingest-pages-stream`, protocolo da **ADR-088**. **(1) Código:** `ingestPages` (gerador em `ingest/pdfjs.ts`, rende página e retorna o `RawDocument`; `ingestPdfjs` drena) + `src/pipeline.ts` (`extractStream`: `page` → `blocks` em cópia estável → `book` idêntico ao lote; erros propagam; saída antecipada derruba o pdf.js) + exports no `index.ts`. **(2) Testes:** 8 novos (7 `test/pipeline.test.ts`, 1 `test/pdfjs-ingest.test.ts`) → **1020**. **(3) Gates:** `pnpm verify` verde, `pnpm eval --ci` exit 0 (31 docs). **Próx.:** fatia 3 — CLI consumindo `extractStream` (progresso por página no stderr, stdout byte-idêntico), docs finais e PR da E8-T01.

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
| E8 | em andamento (T01 fatias 1–2 done 2026-10-27, ADR-088; resto: T01 fatia 3, T02, T03 fatia 3, T04) |
| E9, E10, SEG | todo (E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-27 · **E8-T01 fatia 2: `ingestPages` + `extractStream` — CONCLUÍDO** · gerador de páginas + API pública de streaming (`page` → `blocks` → `book`, ADR-088); **1020 testes** (+8), `pnpm eval --ci` exit 0.
- 2026-10-27 · **E8-T01 fatia 1: `buildBook` em estágios — CONCLUÍDO** · `analyzeDocument` + `buildBlockChunks` + `finalizeBook` com `buildBook` como composição; **ADR-088** (protocolo do `extractStream`) e E8-T01 detalhada em 3 fatias; **1012 testes** (+3), `pnpm eval --ci` exit 0.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67).

Histórico completo: docs/extractor/archive/
