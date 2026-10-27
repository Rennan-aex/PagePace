# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E8 EM ANDAMENTO** (plano em `phases/E8-performance.md`). **E8-T01 CONCLUÍDA (2026-10-27, ADR-088; 3 fatias)**; **E8-T02 CONCLUÍDA (2026-10-27, ADR-089)**; seguem da E8: T03 fatia 3 (limite de memória) e T04 (benchmarks). E7 CONCLUÍDA (2026-10-21, ADR-071–077); E6 (ADR-070); E5/E4/E3 fechadas.
- **Tarefa atual:** **E8-T03 fatia 3 — limite de memória** (plano em `phases/E8-performance.md`): janela do streaming destravada (E8-T01/ADR-088) + limite/degradação controlada; documentos de estresse `n2-en-astrofisica`, `n3-pt-filosofia2`, `n1-en-lostworld`. **Aceite:** pico ≤ meta em livro de 500 páginas **e** limite/degradação nos 3. **Fora de escopo:** heurística, esquema.
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (1033 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (baseline intacto).
- **Última atualização:** 2026-10-27 (E8-T02 cache fechada, ADR-089).

## Tarefa fechada nesta sessão — E8-T02: cache por (sha256, versões)
- Núcleo portátil `packages/extractor/src/cache.ts`: chave `sha256-extractorVersion-schemaVersion`, interface `ExtractionCacheStore`, `MemoryExtractionCache`, `readCachedBook` (entrada corrompida = miss, nunca crash), `writeCachedBook`, `extractCached` (hit não abre o PDF).
- CLI: `FileExtractionCache` (`cache-file.ts`, escrita atômica tmp+rename) + opt-in `--cache-dir <pasta>` no `extract`; miss mantém progresso no stderr e grava; hit imprime só a chave no stderr, stdout byte-idêntico. HELP atualizado.
- Aceite medido: 2º run sem `Página` e stdout idêntico; chave de versão `9.9.9-9.9.9` força reprocesso; bytes envenenados no hit nunca tocam a ingestão; bump extrator/esquema/ambos invalida (3 casos no teste).
- Gates: `pnpm verify` verde (**1033 testes**, +12), `pnpm eval --ci` exit 0 (31 docs). ADR-089; fase E8-performance.md marcada.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-27f — E8-T02 (cache) — CONCLUÍDA** · branch `e8-t02-cache`, ADR-089. **(1) Núcleo:** `extractor/src/cache.ts` — `extractionCacheKey(For)`, `ExtractionCacheStore`, `MemoryExtractionCache`, `readCachedBook`/`writeCachedBook`/`extractCached`; exports no `index.ts`. **(2) CLI:** `cli/src/cache-file.ts` (`FileExtractionCache`), `extract --cache-dir` (opt-in; hit = stderr com a chave + stdout byte-idêntico; erro de cache = aviso e reprocessa); HELP/USAGE. **(3) Testes:** 5 em `src/cache.test.ts` + 3 em `test/cache.test.ts` + 4 na CLI → **1033**. **(4) Gates:** `pnpm verify` verde, `pnpm eval --ci` exit 0. **Próx.: E8-T03 fatia 3 (limite de memória — janela do streaming + limite nos 3 docs de estresse) → depois E8-T04 (benchmarks).**

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
| E8 | em andamento (T01 done 2026-10-27 ADR-088; T02 done 2026-10-27 ADR-089; resto: T03 fatia 3, T04) |
| E9, E10, SEG | todo (E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-27 · **E8-T02: cache por (sha256, versões) — CONCLUÍDO** · núcleo `cache.ts` + `FileExtractionCache` na CLI (`--cache-dir`; 2ª abertura não reprocessa, mudança de versão invalida, ADR-089); **1033 testes** (+12), `pnpm eval --ci` exit 0.
- 2026-10-27 · **E8-T01 fatia 3: progresso na CLI — CONCLUÍDO** · `extract` via `extractStream` (progresso por página no stderr, stdout byte-idêntico ao lote); **1021 testes** (+1), `pnpm eval --ci` exit 0; E8-T01 completa.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088).

Histórico completo: docs/extractor/archive/
