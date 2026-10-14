# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** E4 (Títulos/estilos/sumário) — T01 `done` (PR #38) e T02 `done` nesta branch (`e4-t02-detect-headings`, PR aberto); T03…T05 `todo`. E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E4-T02** concluída 2026-10-14 (cópia abaixo); a próxima sessão começa a **E4-T03**.
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh` instalado na máquina.
- **Status:** `pnpm verify` verde (565 testes + `check:no-pdf` + `check:docs`); `pnpm eval` sem regressão (`heading_f1`/`heading_level_acc` 1,0000 em 6 dos 7 medidos, 0,0000 só em `syn-n2-en-columns` = alvo da E6; nenhum falso positivo; baseline atualizado).
- **Última atualização:** 2026-10-14 (E4-T02, detecção de títulos).

## Tarefa atual — E4-T02 · Detecção de títulos e níveis (cópia de `phases/E4-headings-styles.md`)
- **Concluída 2026-10-14** (branch `e4-t02-detect-headings`, ADR-055): `headings.ts` (porta + sinais de exibição; nível por cluster de tamanho, sem evidência → ordem de leitura), `buildBook` emite `kind: "heading"` com `level`, `headingDetection`/`blockHeadingDetection` no eval (coluna, seção de falsos positivos, baseline).
- Clusters de tamanho/peso/espaçamento relativos ao corpo; centralização; linhas curtas isoladas; numeração (`1.2`, `Capítulo`); evitar legendas e epígrafes.
- **Aceite:** `heading_f1` e `heading_level_acc` ≥ meta; relatório de falsos positivos. **Atendido:** ≥ 0,95 nos 4 N1 com golden (`headings.test.ts`, com guardião); seção `Heading detection (false positives / missed / wrong level)` sempre no `pnpm eval`.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- Sessão encerrada (2026-10-14) — **E4-T02 (títulos e níveis) CONCLUÍDO** na branch `e4-t02-detect-headings` (PR aberto, link no Bloqueios): `packages/extractor/src/headings.ts` — **porta** (≤ 3 linhas, nunca menor que o corpo, colado na margem, não itálico-majoritário, não legenda) **+ 1 sinal de exibição** (fonte ≥ 1,2×corpo, negrito ≥ 0,6, centralizado ≤ 0,03 da medida, numeração `1.2`/`Capítulo`, ou linha curta isolada ≥ 1,5×entrelinha dos dois lados que não termina frase; item de lista `1.`/`•` precisa de tamanho/peso); **nível** = cluster de tamanhos de fonte (maior = 1, teto 6), sem evidência → ordem de leitura (**ADR-055**); `buildBook` emite `kind: "heading"` + `level`. Eval: `headingDetection` (F1 por texto normalizado + acerto de nível, casamento multiset), `blockHeadingDetection` (a mesma função que o teste de aceite chama), coluna `heading_f1`, seção de falsos positivos, `METRIC_DIRECTIONS`.
- **Provas:** `pnpm verify` **565 testes** (+33: 18 em `headings.test.ts`, 9 em `metrics.test.ts`, 6 do aceite); aceite N1 ≥ 0,95 nos 4 N1 com golden + guardião; **`pnpm eval`**: 1,0000 em 6 dos 7 (inclusive `syn-n3-en-footnotes` no nível 2 do gabarito), **0,0000 só em `syn-n2-en-columns`** (título em duas colunas — alvo da E6), **nenhum falso positivo**; baseline só com as 2 chaves novas (regra de ouro).
- **Próximo:** próxima sessão = **E4-T03 — Sumário** (bookmarks do PDF × títulos detectados, entrada aponta para `blockId`; definição em `phases/E4-headings-styles.md`), que deve substituir o fallback por ordem de leitura da ADR-055 quando houver outline.
- Limitações E4-T02 (no módulo/EVALUATION.md): todos os títulos no mesmo corpo → nível por ordem de aparição; `1. Introduction` no corpo é item de lista; título no pé de página pode ser engolido pela junção E3-T04; medida de coluna única (E6).

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- [x] Checklist manual da fase E2 (`phases/E2-lines-paragraphs.md`) — **feito (2026-10-11):** parágrafos corretos em `n1-pt-sofia` e `n1-en-curinga`; defeito à parte registrado no **BACKLOG 2026-10-11** (quebra no meio da palavra em `n1-en-curinga`, 1.303 ocorrências, P1).
- [x] Checklist manual da fase E3 (`phases/E3-cleanup.md`) — **feito (2026-10-11):** repetições e hifenização aprovadas; conferência visual da p. 41 de `n1-en-sofia` sem conteúdo perdido (trecho em bloco que cruza página, `p39-b7`); **`n1-pt-curinga` reprovou** com 297 números de página (BACKLOG 2026-10-11, P1).
- [x] Abrir o PR da branch `docs-dieta-contexto` e dar Squash and merge — **feito (PRs #35 e #36 na `main`)**.
- [x] Escolher a próxima sessão: **consertos P1** — **feito (2026-10-12): os 2 defeitos P1 foram corrigidos** (ADR-052); falta só o merge do PR `fix-p1-inline-eol-folio`.
- [x] Abrir o PR da branch `fix-p1-inline-eol-folio` e dar Squash and merge — **feito (PR #37 na `main`, 2026-10-13)**.
- [x] Abrir o PR da branch `e4-t01-inline-styles` e dar Squash and merge — **feito (PR #38 na `main`, 2026-10-14)**.
- [x] Confirmar os títulos reais dos 15 PDFs privados — **feito (2026-10-11)**: gravados em `$CORPUS_PRIVATE_DIR/manifest.yaml` (campo `title`, fora do git); `pnpm corpus:fetch` valida `15 private entries merged`; ids não mudam.
- [ ] Não apagar a entrega (Release) `corpus-public-v1`: o `corpus/manifest.yaml` aponta para ela (apagar = CI vermelho com 404).

## Progresso por marco
| Marco | Status |
|---|---|
| E0 | done (2026-10-05, PR #11) |
| E1 | done (2026-10-07, PR #22) |
| E2 | done (2026-10-08, PR #28; checklist manual concluído 2026-10-11) |
| E3 | done (2026-10-11, PRs #29–#34; checklist manual concluído 2026-10-11) |
| E4 | in progress (T01 merged PR #38; T02 done nesta branch 2026-10-14; T03…T05 todo) |
| E5…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 26 documentos (11 públicos + 15 privados); 7 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 7 · `para_boundary_f1` 1,0000 em 6 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 6 de coluna única e 0,1429 em `syn-n2-en-columns` (duas colunas = alvo da E6) · `header_footer_f1` 1,0000 nos 7 · `hyphen_join_acc` 1,0000 nos 7 (ADR-047) · `style_f1` 1,0000 nos 7 (E4-T01) · `heading_f1`/`heading_level_acc` 1,0000 em 6 dos 7 e 0,0000 em `syn-n2-en-columns` (E4-T02; nenhum falso positivo).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-14 · **E4-T02 (títulos e níveis) — CONCLUÍDO** · branch `e4-t02-detect-headings` · `headings.ts` (porta + 5 sinais de exibição; nível por cluster de tamanhos de fonte, fallback na ordem de leitura — **ADR-055**) + `buildBook` emite `kind: "heading"`/`level` + `headingDetection`/`blockHeadingDetection` no eval (coluna `heading_f1` + seção de falsos positivos); **565 testes**; aceite N1 ≥ 0,95 nos 4 documentos; `heading_f1` = 1,0000 em 6 dos 7 e 0,0000 só em `syn-n2-en-columns` (alvo da E6), nenhum falso positivo; baseline só com as 2 chaves novas (regra de ouro).
- 2026-10-13 · **E4-T01 (estilos inline) — CONCLUÍDO** · `fontstyle.ts` (nome da fonte → bold/italic, spike S2) + `runs.ts` (runs por item, sup/sub por tamanho/posição, fusão de vizinhos iguais, item só-espaço neutro — **ADR-053**) + `style_f1` no eval (F1 por caractere de negrito/itálico, `METRIC_DIRECTIONS` + tabela do relatório); `style_f1` = 1,0000 nos 7 documentos (antes 0,9737 em `syn-n2-pt-estilos`), nenhum outro regrediu; `pnpm verify` 532 testes; **mesclado como PR #38 (2026-10-14)**.
- Sessões anteriores: `docs/extractor/archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md` e `archive/STATE-log-2026-10-14.md` (seções "Handoff" e "Log de sessões").

Histórico completo: docs/extractor/archive/
