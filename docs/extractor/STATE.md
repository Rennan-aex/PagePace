# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E5 em andamento** — T01 concluída (2026-10-16); próxima **E5-T02**. E4 fechada (PRs #38, #40, #42, #43 e #44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E5-T01 concluída** (branch `e5-t01-detect-footnotes`, **PR #45**; cópia abaixo virou E5-T02).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh` instalado na máquina.
- **Status:** `pnpm verify` verde (647 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 sem regressão (nenhuma métrica depende de `kind`).
- **Última atualização:** 2026-10-16 (E5-T01 concluída).

## Tarefa atual — E5-T02 · Notas: ligação à chamada (cópia de `phases/E5-notes-quotes.md`)
- Encontrar a chamada (sobrescrito/número no texto), ligar `noteRef` no `run` e `anchor` na nota; tratar nota que continua na página seguinte.
- **Aceite:** `footnote_link_acc` ≥ meta; chamadas sem nota e notas sem chamada viram `flags` e baixam confiança.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-16 — E5-T01 (notas de rodapé: detecção) — CONCLUÍDA:** `packages/extractor/src/footnotes.ts` (camada 4, pura) + integração em `buildBook` (`kind: "footnote"`, `origin`; nota vence título) + 21 testes em `footnotes.test.ts` (sinais, negativos, **numeração reiniciando por página e por capítulo**).
- Heurística (por página, nunca comparando vizinhos): região inferior (≥ `FOOTNOTE_REGION_TOP_SHARE` 0,5 da altura de texto), fonte < `FOOTNOTE_MAX_SIZE_FACTOR` 0,95 × body, marcador `FOOTNOTE_MARKER` (`1.`/`1)`/`(1)`/`[4]`/`*`/`††`) **ou número cru do estilo SciELO** com 3 guarda-chuvas que só recusam (prosa após o número, capitulares = rótulo impresso, mobiliário repetido em ≥ 3 páginas na mesma baseline) — **ADR-059**; régua impressa sem marcador → flag `uncertain-footnote` + confiança 0,7.
- Verificações: `pnpm verify` verde (647 testes, 46 arquivos) e `pnpm eval --ci` exit 0 (baseline intacta — nenhuma métrica lê `kind`).
- Sondas: `.pagepace-cache/tmp/audit-notes.ts` (antes/depois em `audit-before.txt`/`audit-after2.txt`) e `debug-footnotes.ts` (recorte por página); corpus: **218 blocos `footnote`** (eram 76) em 10 documentos.
- FP residuais (lista numerada com fonte quase-do-corpo, linha de referência `641 [arXiv:…]`, linha de catálogo da p. 4 de `n4-pt-astrofisica`) → **BACKLOG 2026-10-16 (P2)**; rodapés com palavras que mudam por capítulo sobrevivem ao strip da E3-T02 → **BACKLOG 2026-10-16 (P3)**.
- Contexto herdado: `buildToc` só considera `kind === "heading"`; `footnote_link_acc` e `block_kind_f1` ainda não existem (E5-T02/E5-T04); gabarito sintético `syn-n3-en-footnotes` tem 1 nota (página 2, `size` 9).
- Próximo passo: **E5-T02** — chamada↔nota, `noteRef`/`anchor`, flag de nota órfã, nota que continua na página seguinte (hoje é join de parágrafo, recusado pela regra de página única).

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- [x] Checklist manual da fase E2 (`phases/E2-lines-paragraphs.md`) — **feito (2026-10-11):** parágrafos corretos em `n1-pt-sofia` e `n1-en-curinga`; defeito à parte registrado no **BACKLOG 2026-10-11** (quebra no meio da palavra em `n1-en-curinga`, 1.303 ocorrências, P1).
- [x] Checklist manual da fase E3 (`phases/E3-cleanup.md`) — **feito (2026-10-11):** repetições e hifenização aprovadas; conferência visual da p. 41 de `n1-en-sofia` sem conteúdo perdido (trecho em bloco que cruza página, `p39-b7`); **`n1-pt-curinga` reprovou** com 297 números de página (BACKLOG 2026-10-11, P1).
- [x] Abrir o PR da branch `docs-dieta-contexto` e dar Squash and merge — **feito (PRs #35 e #36 na `main`)**.
- [x] Escolher a próxima sessão: **consertos P1** — **feito (2026-10-12): os 2 defeitos P1 foram corrigidos** (ADR-052); falta só o merge do PR `fix-p1-inline-eol-folio`.
- [x] Abrir o PR da branch `fix-p1-inline-eol-folio` e dar Squash and merge — **feito (PR #37 na `main`, 2026-10-13)**.
- [x] Abrir o PR da branch `e4-t01-inline-styles` e dar Squash and merge — **feito (PR #38 na `main`, 2026-10-14)**.
- [x] Abrir o PR da branch `e4-t02-detect-headings` e dar Squash and merge — **feito (PR #40 na `main`, 2026-10-14)**.
- [x] Confirmar os títulos reais dos 15 PDFs privados — **feito (2026-10-11)**: gravados em `$CORPUS_PRIVATE_DIR/manifest.yaml` (campo `title`, fora do git); `pnpm corpus:fetch` valida `15 private entries merged`; ids não mudam.
- [ ] Não apagar a entrega (Release) `corpus-public-v1`: o `corpus/manifest.yaml` aponta para ela (apagar = CI vermelho com 404).

## Progresso por marco
| Marco | Status |
|---|---|
| E0 | done (2026-10-05, PR #11) |
| E1 | done (2026-10-07, PR #22) |
| E2 | done (2026-10-08, PR #28; checklist manual concluído 2026-10-11) |
| E3 | done (2026-10-11, PRs #29–#34; checklist manual concluído 2026-10-11) |
| E4 | done (T01 PR #38, T02 PR #40, T03 PR #42, T04 PR #43, T05 PR #44) |
| E5 | in progress (T01 concluída 2026-10-16, **PR #45**) |
| E6…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 26 documentos (11 públicos + 15 privados); 7 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 7 · `para_boundary_f1` 1,0000 em 6 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 6 de coluna única e 0,1429 em `syn-n2-en-columns` (duas colunas = alvo da E6) · `header_footer_f1` 1,0000 nos 7 · `hyphen_join_acc` 1,0000 nos 7 (ADR-047) · `style_f1` 1,0000 nos 7 (E4-T01/T05) · `heading_f1`/`heading_level_acc` 1,0000 em 6 dos 7 e 0,0000 em `syn-n2-en-columns` (E4-T02; nenhum falso positivo).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-16 · **E5-T01 (notas de rodapé: detecção) — CONCLUÍDO** · **PR #45** (branch `e5-t01-detect-footnotes`) · `footnotes.ts` (`detectFootnotes` puro na camada 4: região inferior + fonte menor + marcador pontuado/símbolo **ou número cru com guarda-chuvas — ADR-059**; régua = nota incerta) + `buildBook` (`kind: "footnote"`, `origin`) + 21 testes; **647 testes**; `pnpm eval --ci` exit 0; sondas `audit-notes.ts`/`debug-footnotes.ts`: **218 notas no corpus (eram 76)**; FP residuais → BACKLOG 2026-10-16 (P2/P3).
- 2026-10-15 · **E4-T05 (estilo do título) — CONCLUÍDO** · **PR #44** (branch `e4-t05-heading-run-styles`) · `headingRuns` em `runs.ts` (negrito-majoritário = estilo de título some das runs; negrito palavra-a-palavra fica — **ADR-058**) + integração em `buildBook` + convenção de gabarito na skill `write-golden-test`; **626 testes**; `pnpm eval --ci` exit 0; sonda `probe-t05.ts`: 155 negritos de estilo-título removidos, 4 ênfases preservadas, em 1.151 títulos.
- Sessões anteriores: `docs/extractor/archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md` e `archive/STATE-log-2026-10-14.md` (seções "Handoff" e "Log de sessões").

Histórico completo: docs/extractor/archive/
