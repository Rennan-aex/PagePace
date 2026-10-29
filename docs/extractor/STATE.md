# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E8 EM ANDAMENTO** (plano em `phases/E8-performance.md`). **E8-T01 CONCLUÍDA (2026-10-27, ADR-088; 3 fatias)**; **E8-T02 CONCLUÍDA (2026-10-27, ADR-089)**; **E8-T03 CONCLUÍDA (2026-10-28, ADR-090; 3 fatias)**; segue da E8: T04 (benchmarks). E7 CONCLUÍDA (2026-10-21, ADR-071–077); E6 (ADR-070); E5/E4/E3 fechadas.
- **Próxima tarefa:** **E8-T04 — benchmarks reproduzíveis** (fase `phases/E8-performance.md`): `pnpm bench` por documento (ms/página, MB) + roteiro Android; medições em aparelho real obrigatórias (condição da ADR-005 — se falharem, a ADR-005 é reaberta).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (1045 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (baseline intacto).
- **Última atualização:** 2026-10-28 (E8-T03 fatia 3 fechada, ADR-090).

## Tarefa fechada nesta sessão — E8-T03 fatia 3: orçamento de memória
- `ingest/memory.ts`: `MemoryGovernor` (fronteira de página; 1ª amostra acima do orçamento = "over" e segue, 2ª consecutiva = `MemoryLimitError` com limite/observado/páginas); sonda injetada (regra 6); sem degradação em voo (medida contraproducente, ADR-090).
- `DEFAULT_CLEANUP_EVERY_PAGES` 32 → **0** (varredura documental piora pico e tempo em todos os docs medidos; `page.cleanup()` por página já roda); `cleanupEveryPages` positivo continua opcional.
- Validação incremental: `rawPageSchema` por página no loop de `ingestPages`; `Book` final por envelope + `blockSchema` por bloco em `finalizeBook`; `repeated.ts` constrói linhas por página. Saída byte-idêntica (suíte + eval).
- CLI: `extract --memory-limit-mb <n>` plumba `process.memoryUsage()`; erro tipado, saída 1; HELP/USAGE.
- Medições (sofia 494 p): pico 291–316 MB (mediana ~303; vivo 287/269 assentado), ~6,0 s (era ~7,0); lostworld 348–356, astrofisica 344, filosofia2 233 — os 2 primeiros acima de 300 e o orçamento é o que os controla.
- Gates: `pnpm verify` verde (**1045 testes**, +12), `pnpm eval --ci` exit 0 (31 docs). ADR-090; fase E8-performance.md marcada.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-28a — E8-T03 fatia 3 (orçamento de memória) — CONCLUÍDA** · branch `e8-t03-memory-limit`, ADR-090. **(1) Núcleo:** `ingest/memory.ts` (governor de 2 fronteiras, `MemoryLimitError`) + `pdfjs.ts` (validação incremental de página, default da varredura 0, opções `memoryLimitBytes`/`memoryUsage`) + `book.ts` (envelope + `blockSchema` por bloco) + `repeated.ts` (linhas por página). **(2) CLI:** `--memory-limit-mb` no `extract` (`process.memoryUsage`); HELP/USAGE. **(3) Testes:** 9 novos `test/memory-limit.test.ts` + default 0 em `pdfjs-ingest` + 3 na CLI → **1045**. **(4) Gates:** `pnpm verify` verde, `pnpm eval --ci` exit 0. **Próx.: E8-T04 (benchmarks reproduzíveis + roteiro Android; definir ali a metodologia oficial de medir "pico").**

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
| E8 | em andamento (T01 done 2026-10-27 ADR-088; T02 done 2026-10-27 ADR-089; T03 done 2026-10-28 ADR-090; resto: T04) |
| E9, E10, SEG | todo (E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-28 · **E8-T03 fatia 3: orçamento de memória — CONCLUÍDO** · governador de 2 fronteiras + `MemoryLimitError`, default da varredura 0, validação incremental (página/bloco), `--memory-limit-mb` na CLI; **1045 testes** (+12), `pnpm eval --ci` exit 0; ADR-090.
- 2026-10-27 · **E8-T02: cache por (sha256, versões) — CONCLUÍDO** · núcleo `cache.ts` + `FileExtractionCache` na CLI (`--cache-dir`; 2ª abertura não reprocessa, mudança de versão invalida, ADR-089); **1033 testes** (+12), `pnpm eval --ci` exit 0.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088).

Histórico completo: docs/extractor/archive/
