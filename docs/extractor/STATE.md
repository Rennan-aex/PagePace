# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** E3 (Limpeza) — T01…T05 `done`, na `main` (PRs #29–#34) e **checklist manual concluído em 2026-10-11**.
- **Tarefa atual:** **consertos P1 dos checklists (ADR-051) — CONCLUÍDOS em 2026-10-12** na branch `fix-p1-inline-eol-folio` (2 commits, ADR-052). A próxima sessão é **E4-T01 — Estilos inline** (definição abaixo, copiada em 2026-10-11).
- **Ação pendente do PO:** abrir o PR da branch `fix-p1-inline-eol-folio` e dar Squash and merge (`gh` não está instalado — passo a passo na mensagem do chat).
- **Status:** `pnpm verify` verde (498 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` sem regressão; branch `fix-p1-inline-eol-folio` (parte de `origin/main` `d7233f6`, 2 commits à frente).
- **Última atualização:** 2026-10-12.

## Tarefa atual — E4-T01 · Estilos inline (negrito, itálico, sup, sub) (cópia de `phases/E4-headings-styles.md`; copiada em 2026-10-11)
- A partir do resultado do spike S2: nome da fonte + flags; casos de sobrescrito por tamanho/posição; produzir `runs`.
- **Aceite:** `style_f1` ≥ meta em N1; `runs` adjacentes com o mesmo estilo são fundidos; testes de fronteiras (estilo no meio da palavra).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- Sessão encerrada (2026-10-12) — **consertos P1 CONCLUÍDOS** (branch `fix-p1-inline-eol-folio`, commits `74ede26` e `8febe0c`, **ADR-052**); `pnpm verify` verde (498 testes) e `pnpm eval --ci` sem regressão (baseline não mudou).
- **Defeito 1 (`\n` mid-run):** marcador `hasEOL` entre runs da mesma linha não quebra mais — `itemsText` (página) decide pela caixa da linha com `joinsLineBox` (regra do `groupLines`); `lineText` (linha) nunca quebra e passou a ser usado em `paragraphHyphenText`, `pagejoin`, `repeated` e no `headerFooterRemoval` do eval. Medição: **0 `\n` dentro de parágrafo nos 13 digitais** (antes 8.635 parágrafos).
- **Defeito 2 (folio mid-flow):** banda `flow` em `repeated.ts` — linha numerada ≤ 1,05 × corpo, linha em branco de ≥ 1 lado (`FLOW_FOLIO_ISOLATION_FACTOR` 1,0), valores crescentes passo ≤ `FLOW_FOLIO_MAX_STEP` (5) em ≥ `minimum` páginas; bordas numeradas não agrupadas entram na prova; página de 1 linha nunca perde a única linha. Medição: `n1-pt-curinga` **297 → 0** blocos só-número, 1.927 `pageLabels`; nenhum efeito colateral nos outros 12.
- **Próximo:** (1) PO abre o PR da branch `fix-p1-inline-eol-folio` e dá Squash and merge (passo a passo na mensagem do chat); (2) próxima sessão = **E4-T01 — Estilos inline** (definição abaixo).
- Restam blocos só-número que **não são folio** (números de corpo/verso): `n3-pt-filosofia2` 145 e `n3-en-filosofia` 85 (inalterados pela banda `flow`); se um golden real reprovar algum, abrir P2 no BACKLOG.

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- [x] Checklist manual da fase E2 (`phases/E2-lines-paragraphs.md`) — **feito (2026-10-11):** parágrafos corretos em `n1-pt-sofia` e `n1-en-curinga`; defeito à parte registrado no **BACKLOG 2026-10-11** (quebra no meio da palavra em `n1-en-curinga`, 1.303 ocorrências, P1).
- [x] Checklist manual da fase E3 (`phases/E3-cleanup.md`) — **feito (2026-10-11):** repetições e hifenização aprovadas; conferência visual da p. 41 de `n1-en-sofia` sem conteúdo perdido (trecho em bloco que cruza página, `p39-b7`); **`n1-pt-curinga` reprovou** com 297 números de página (BACKLOG 2026-10-11, P1).
- [x] Abrir o PR da branch `docs-dieta-contexto` e dar Squash and merge — **feito (PRs #35 e #36 na `main`)**.
- [x] Escolher a próxima sessão: **consertos P1** — **feito (2026-10-12): os 2 defeitos P1 foram corrigidos** (ADR-052); falta só o merge do PR `fix-p1-inline-eol-folio`.
- [ ] Abrir o PR da branch `fix-p1-inline-eol-folio` e dar Squash and merge (consertos P1; push feito pela IA; `gh` não instalado — passo a passo no chat).
- [x] Confirmar os títulos reais dos 15 PDFs privados — **feito (2026-10-11)**: gravados em `$CORPUS_PRIVATE_DIR/manifest.yaml` (campo `title`, fora do git); `pnpm corpus:fetch` valida `15 private entries merged`; ids não mudam.
- [ ] Não apagar a entrega (Release) `corpus-public-v1`: o `corpus/manifest.yaml` aponta para ela (apagar = CI vermelho com 404).

## Progresso por marco
| Marco | Status |
|---|---|
| E0 | done (2026-10-05, PR #11) |
| E1 | done (2026-10-07, PR #22) |
| E2 | done (2026-10-08, PR #28; checklist manual concluído 2026-10-11) |
| E3 | done (2026-10-11, PRs #29–#34; checklist manual concluído 2026-10-11) |
| E4…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 26 documentos (11 públicos + 15 privados); 7 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 7 · `para_boundary_f1` 1,0000 em 6 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 6 de coluna única e 0,1429 em `syn-n2-en-columns` (duas colunas = alvo da E6) · `header_footer_f1` 1,0000 nos 7 · `hyphen_join_acc` 1,0000 nos 7 (ADR-047).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-12 · **Consertos P1 (ADR-051) — CONCLUÍDOS** · `\n` mid-run (linha `itemsText`/`lineText`, **ADR-052**) e folio mid-flow (banda `flow`): corpus digital com 0 `\n` em parágrafo; `n1-pt-curinga` 297 → 0 só-número; `pnpm verify` 498 testes e `pnpm eval --ci` sem regressão; BACKLOG 2026-10-11 marcado concluído; branch `fix-p1-inline-eol-folio` (2 commits) pronta para o PR.
- 2026-10-11 · **Checklists manuais E2/E3 com o PO — CONCLUÍDOS** · comandos PowerShell testados e salvos em `tests/manual/extractor-visual-checklist.md`; títulos dos 15 PDFs gravados no manifest privado (fora do git); branch `docs-dieta-contexto` sincronizada com a `main` (merge `1a46836`); achados → 2 itens P1 no BACKLOG + **ADR-051** (consertos numa rodada só, depois dos checklists); `pnpm verify` verde.
- Sessões anteriores: `docs/extractor/archive/STATE-full-2026-10-10.md` (seções "Handoff" e "Log de sessões").

Histórico completo: docs/extractor/archive/
