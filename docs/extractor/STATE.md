# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E8 EM ANDAMENTO** (plano em `phases/E8-performance.md`). **E8-T03 fatia 1 (descartar `font.data`) DONE (2026-10-27, ADR-086)**; faltam da E8-T03: liberar páginas do PDF.js, limite de memória e docs de estresse; depois E8-T01 (streaming), E8-T02 (cache), E8-T04 (benchmarks). E7 CONCLUÍDA (2026-10-21, ADR-071–077); E6 (ADR-070); E5/E4/E3 fechadas.
- **Tarefa atual:** **nenhuma em curso** — próxima sessão continua E8 (provável E8-T03 fatia 2 ou E8-T01). Branch `e8-t03-discard-font-data` mesclada nesta sessão.
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (1004 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (baseline intacto — descarte de `font.data` não muda a saída).
- **Última atualização:** 2026-10-27 (E8-T03 fatia 1 fechada, ADR-086).

## Tarefa fechada nesta sessão — E8-T03 fatia 1: descartar `font.data`
- `discardFontData(page, Object.keys(styles))` em `readPage` chama `font.clearData()` (API do pdf.js 6) depois de ler nome/métricas — `data` é getter, `delete` não funciona (**ADR-086**).
- Medição corrigida: bytes de `data` = 0,4 MB (n4-pt) · 6,4 MB (n2-astrofisica) · 0,8 MB (lostworld); os "308 MB"/"+35 MB" antigos eram o custo total da flag `fontExtraProperties` (inclui `extra`), não só `data` — a E8-T03 não planejar em cima de 308 MB.
- Testes: integração com pdf.js real (bytes somem, `name`/`ascent` ficam, páginas seguintes resolvem o nome) + unitário; BACKLOG linha 7 marcada; `pnpm eval --ci` exit 0.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-27 — E8-T03 fatia 1 (descartar `font.data`) — CONCLUÍDA** · branch `e8-t03-discard-font-data`, **ADR-086**. **(1) Código:** `ingest/pdfjs.ts` ganhou `discardFontData` (exportado no índice) chamado em `readPage` após resolver os nomes — `font.clearData()` libera os bytes; `delete` não funciona (`data` é getter do `FontFaceObject`). **(2) Testes:** vermelho antes, verde depois — 3 novos em `pdfjs-ingest.test.ts` (integração pdf.js real + páginas seguintes + unitário). **(3) Medição:** `data` = 0,4 MB n4-pt / 6,4 MB n2-astro / 0,8 MB lostworld (os 308 MB antigos eram o custo total da flag, inclui `extra`). **(4) Gates:** `pnpm verify` verde (**1004 testes**), `pnpm eval --ci` exit 0. **Próx.:** E8 — fatia 2 da E8-T03 (liberar páginas/limite de memória) ou E8-T01 (streaming `AsyncIterable`); planejar a E8 inteira se a sessão for de planejamento.

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
| E8 | em andamento (T03 fatia 1 done 2026-10-27, ADR-086; resto: T03 fatias 2+, T01, T02, T04) |
| E9, E10, SEG | todo (E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-27 · **E8-T03 fatia 1: descartar `font.data` — CONCLUÍDO** · `discardFontData` (`clearData()` do pdf.js por página em `readPage`); **ADR-086**; medição corrigida (0,4–6,4 MB de `data`; "308 MB" era o custo total da flag); **1004 testes** (+3), `pnpm eval --ci` exit 0; BACKLOG linha 7 marcada.
- 2026-10-26 · **Heurística fonte quebrada (BACKLOG 26) — CONCLUÍDO** · `brokenFontText` = FFFD/PUA ou 3+ "à" interno (sem share), mesma flag/warning/confidence de E3-T05; **ADR-085**; A/B: sofia 0→49 blocos, 0 FP em 16 digitais + 12 sintéticos; **1001 testes** (+12), `pnpm eval --ci` exit 0; BACKLOG 26 marcada.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67).

Histórico completo: docs/extractor/archive/
