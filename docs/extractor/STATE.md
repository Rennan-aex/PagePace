# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E8 EM ANDAMENTO** (plano em `phases/E8-performance.md`). **E8-T01 CONCLUÍDA (2026-10-27, ADR-088; 3 fatias)**; **E8-T02 CONCLUÍDA (2026-10-27, ADR-089)**; **E8-T03 CONCLUÍDA (2026-10-28, ADR-090; 3 fatias)**; segue da E8: T04 (benchmarks). E7 CONCLUÍDA (2026-10-21, ADR-071–077); E6 (ADR-070); E5/E4/E3 fechadas.
- **Próxima tarefa:** **E8-T04 — benchmarks reproduzíveis** — em andamento: runner `pnpm bench`, testes, CI, roteiro Android e ADR-091 prontos; falta baseline calibrada no CI + medições no aparelho real (condição da ADR-005 — se falharem, a ADR-005 é reaberta).
- **Ação pendente do PO:** medições Android pelo checklist `tests/manual/android-performance-checklist.md` (fim da E8-T04); git desde 2026-10-14 (**ADR-054**) o agente faz sozinho com o `gh`.
- **Status:** `pnpm verify` verde (1045 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (baseline intacto).
- **Última atualização:** 2026-10-29 (E8-T04 em andamento — runner + CI + roteiro + ADR-091).

## Tarefa fechada nesta sessão — E8-T03 fatia 3: orçamento de memória
- `ingest/memory.ts`: `MemoryGovernor` (fronteira de página; 1ª amostra acima do orçamento = "over" e segue, 2ª consecutiva = `MemoryLimitError` com limite/observado/páginas); sonda injetada (regra 6); sem degradação em voo (medida contraproducente, ADR-090).
- `DEFAULT_CLEANUP_EVERY_PAGES` 32 → **0** (varredura documental piora pico e tempo em todos os docs medidos; `page.cleanup()` por página já roda); `cleanupEveryPages` positivo continua opcional.
- Validação incremental: `rawPageSchema` por página no loop de `ingestPages`; `Book` final por envelope + `blockSchema` por bloco em `finalizeBook`; `repeated.ts` constrói linhas por página. Saída byte-idêntica (suíte + eval).
- CLI: `extract --memory-limit-mb <n>` plumba `process.memoryUsage()`; erro tipado, saída 1; HELP/USAGE.
- Medições (sofia 494 p): pico 291–316 MB (mediana ~303; vivo 287/269 assentado), ~6,0 s (era ~7,0); lostworld 348–356, astrofisica 344, filosofia2 233 — os 2 primeiros acima de 300 e o orçamento é o que os controla.
- Gates: `pnpm verify` verde (**1045 testes**, +12), `pnpm eval --ci` exit 0 (31 docs). ADR-090; fase E8-performance.md marcada.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-29 — E8-T04 (benchmarks reproduzíveis) — EM ANDAMENTO** · branch `e8-t04-benchmarks` (commits `c79848d` runner+testes, `d53d428` step de CI). **Feito:** `pnpm bench` (`packages/eval/src/bench.ts` + `bench-baseline.ts`): worker novo por documento, RSS natural (timer 5 ms + evento), mediana de `--runs 1..10`, baseline informativa, `--ci` **avisa** (exit 0) com piora > 25% (`ms_per_page` só acima de 5000 ms de baseline — ruído de runner compartilhado, medido +78,6% entre dois runs), `--diff`, `--update-baseline`; 38 testes novos (inclui worker real com spawn); step `Bench (speed and memory)` no ci.yml + artefato `out/bench.json`; roteiro `tests/manual/android-performance-checklist.md` (condições a/b/c da ADR-005); ADR-091 + índice (com a linha faltante da ADR-090); OPEN-QUESTIONS 3 (orçamento 300 MB vs metodologia — não bloqueia). **Próx.:** `pnpm verify` → commit docs → push → PR → CI → `gh run download` do artefato → commitar `packages/eval/bench-baseline.json` (calibrada no CI) → checks → merge → report-to-po (medições Android = ação do PO).

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
