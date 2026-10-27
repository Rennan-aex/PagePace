# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E8 EM ANDAMENTO** (plano em `phases/E8-performance.md`). **E8-T01 CONCLUÍDA (2026-10-27, ADR-088; 3 fatias)**; seguem da E8: T02 (cache), T03 fatia 3 (limite de memória) e T04 (benchmarks). E7 CONCLUÍDA (2026-10-21, ADR-071–077); E6 (ADR-070); E5/E4/E3 fechadas.
- **Tarefa atual:** **E8-T02 — cache** (plano em `phases/E8-performance.md`): chave `(sha256, extractorVersion, schemaVersion)`; armazenamento atrás de uma interface (arquivo no CLI, IndexedDB/SQLite no app). **Aceite:** segunda abertura não reprocessa; mudança de versão invalida. **Fora de escopo:** heurística, esquema.
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (1021 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (baseline intacto).
- **Última atualização:** 2026-10-27 (E8-T01 fatia 3 fechada; fase E8-T01 completa).

## Tarefa fechada nesta sessão — E8-T01 fatia 3: progresso na CLI
- `pagepace extract` consome `extractStream`: evento `page` imprime `Página N lida` no **stderr**; o `book` final sai no stdout **byte-idêntico** ao caminho lote (teste compara com `buildBook(ingestPdfjs(bytes))`).
- Erros mantêm mensagens e códigos de saída (`ScannedPdfError`→3, `RangeError`→2, `BookError`/`SchemaValidationError`/`StatsError`→1, senha/inválido→1); scan não emite progresso (detector antes da 1ª página).
- Docs: HELP do `extract` e checklist manual avisam que o progresso vai para o stderr (vermelho no PowerShell 5.1 é artefato do shell).
- Gates: `pnpm verify` verde (**1021 testes**, +1), `pnpm eval --ci` exit 0 (31 docs).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-27e — E8-T01 fatia 3 (progresso na CLI) — CONCLUÍDA** · branch `e8-t01c-cli-progress`, protocolo da **ADR-088**. **(1) Código:** `packages/cli/src/index.ts` — `extract()` consome `extractStream(bytes, { fileName })`; `page` → `Página N lida` no stderr; `book` → stdout byte-idêntico ao lote; catch mapeia `ScannedPdfError`(3)/`RangeError`(2)/`BookError`/`SchemaValidationError`/`StatsError`(1)/demais (describeIngestError). HELP do `extract` + nota no checklist manual. **(2) Testes:** 1 novo + 1 atualizado em `packages/cli/src/index.test.ts` (progresso na ordem; stdout === `JSON.stringify(buildBook(ingestPdfjs(bytes)), null, 2)`) → **1021**. **(3) Gates:** `pnpm verify` verde, `pnpm eval --ci` exit 0 (31 docs). **E8-T01 completa (3 fatias). Próx.: E8-T02 (cache — chave `(sha256, extractorVersion, schemaVersion)`, interface de armazenamento; segunda abertura não reprocessa, mudança de versão invalida).**

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
| E8 | em andamento (T01 done 2026-10-27, ADR-088; resto: T02, T03 fatia 3, T04) |
| E9, E10, SEG | todo (E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-27 · **E8-T01 fatia 3: progresso na CLI — CONCLUÍDO** · `extract` via `extractStream` (progresso por página no stderr, stdout byte-idêntico ao lote); **1021 testes** (+1), `pnpm eval --ci` exit 0; E8-T01 completa.
- 2026-10-27 · **E8-T01 fatia 2: `ingestPages` + `extractStream` — CONCLUÍDO** · gerador de páginas + API pública de streaming (`page` → `blocks` → `book`, ADR-088); **1020 testes** (+8), `pnpm eval --ci` exit 0.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088).

Histórico completo: docs/extractor/archive/
