# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E8 EM ANDAMENTO** (plano em `phases/E8-performance.md`). **E8-T01 CONCLUÍDA (2026-10-27, ADR-088; 3 fatias)**; **E8-T02 CONCLUÍDA (2026-10-27, ADR-089)**; **E8-T03 CONCLUÍDA (2026-10-28, ADR-090; 3 fatias)**; **E8-T04 — parte do PC CONCLUÍDA (2026-10-29, PR #80, ADR-091)**; falta só a medição em aparelho (condição da ADR-005). E7 CONCLUÍDA (2026-10-21, ADR-071–077); E6 (ADR-070); E5/E4/E3 fechadas.
- **Próxima tarefa:** **E8-T04 (fechamento): medições Android** — o PO roda `tests/manual/android-performance-checklist.md` (condições a/b/c da ADR-005) e cola os números; com eles: registrar o resultado (ADR-005 segue fechada ou é reaberta), atualizar fase/STATE e fechar a E8. A OPEN-QUESTIONS 3 (orçamento de 300 MB) se decide junto.
- **Ação pendente do PO:** medições Android pelo checklist (passo a passo na mensagem do report-to-po); não apagar a entrega (Release) `corpus-public-v1`; git desde 2026-10-14 (**ADR-054**) o agente faz sozinho com o `gh`.
- **Status:** `pnpm verify` verde (1083 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0; baseline do bench no ar (16 docs, calibrada no CI).
- **Última atualização:** 2026-10-29 (E8-T04 parte do PC fechada, PR #80).

## Tarefa fechada nesta sessão — E8-T04 (parte do PC): benchmarks reproduzíveis
- `pnpm bench` (`packages/eval/src/bench.ts` + `bench-baseline.ts`): worker novo por documento (partida fria, como o app), RSS natural (timer 5 ms + 1 amostra por evento do pipeline), mediana de `--runs 1..10`; baseline `packages/eval/bench-baseline.json` informativa; `--ci` **avisa e nunca falha** com piora > 25% (ms/página só acima de 5000 ms de baseline — medido: runner compartilhado variou +78,6% no mesmo commit); `--diff`, `--update-baseline`.
- CI: step `Bench (speed and memory)` (`--runs 3`) + artefato `out/bench.json`; baseline calibrada a partir do artefato do run de ubuntu-latest (16 docs públicos; 2 runs de CI confirmaram o gate estável em `peak_mb`).
- Roteiro Android `tests/manual/android-performance-checklist.md` (condições a/b/c da ADR-005; memória real via `adb dumpsys meminfo`, não `performance.memory`).
- ADR-091 (metodologia oficial; números do bench **não comparáveis** com os da ADR-090/S4); OPEN-QUESTIONS 3 (orçamento de 300 MB — decisão do PO no fechamento da E8).
- Gates: `pnpm verify` verde (**1083 testes**, +38), `pnpm eval --ci` exit 0 (31 docs); PR #80 mesclado.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-29 — E8-T04 (benchmarks) — PARTE DO PC CONCLUÍDA** (PR #80 mesclado, main `b280a39`). **Feito:** `pnpm bench` completo (runner, baseline CI-calibrada, gate `--ci`, step no ci.yml, 38 testes), roteiro Android, ADR-091. **Bloqueio:** fechar a E8-T04 depende das medições no aparelho do PO (`tests/manual/android-performance-checklist.md`; condições a/b/c da ADR-005 — se alguma falhar, reabrir a ADR-005 com o PO). **Próx. sessão (com os números do PO):** se as 3 passaram → marcar E8-T04 [x] e fechar a E8 (fase + STATE + log); se alguma falhou → abrir decisão com o PO sobre o pior caso. OPEN-QUESTIONS 3 (orçamento 300 MB) responder no fechamento. **Armadilhas:** a baseline do bench é de ubuntu-latest — não regravá-la com números locais sem justificativa; o `--ci` do bench nunca pode virar falha (aceite da tarefa); medições antigas (ADR-090/S4) não são comparáveis com as do bench (ADR-091).

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- [ ] Medições Android (E8-T04 / condição da ADR-005): rodar `tests/manual/android-performance-checklist.md` e colar os números (fotos só das telas de números, nunca de página de livro).
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
| E8 | em andamento (T01 done 2026-10-27 ADR-088; T02 done 2026-10-27 ADR-089; T03 done 2026-10-28 ADR-090; T04 parte do PC done 2026-10-29 PR #80 ADR-091 — falta medições Android) |
| E9, E10, SEG | todo (E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-29 · **E8-T04 (parte do PC): benchmarks reproduzíveis — CONCLUÍDO** · `pnpm bench` (worker novo por documento, RSS natural, baseline calibrada no CI, gate `--ci` avisa > 25%), roteiro Android, ADR-091; **1083 testes** (+38), `pnpm eval --ci` exit 0; PR #80 mesclado; falta medições do PO.
- 2026-10-28 · **E8-T03 fatia 3: orçamento de memória — CONCLUÍDO** · governador de 2 fronteiras + `MemoryLimitError`, default da varredura 0, validação incremental (página/bloco), `--memory-limit-mb` na CLI; **1045 testes** (+12), `pnpm eval --ci` exit 0; ADR-090.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088).

Histórico completo: docs/extractor/archive/
