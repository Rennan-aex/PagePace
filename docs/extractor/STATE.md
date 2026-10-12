# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** E3 (Limpeza) — T01…T05 `done`, na `main` (PRs #29–#34) e **checklist manual concluído em 2026-10-11**.
- **Tarefa atual:** E4-T01 — Estilos inline (definição abaixo, copiada em 2026-10-11). A anterior, DOCS-T01 "dieta de contexto", está concluída (definição: `archive/TASK-DOCS-T01-2026-10-11.md`).
- **Ação pendente do PO:** abrir o PR da branch `docs-dieta-contexto` e dar Squash and merge (push já feito, conflito resolvido em 2026-10-11, merge `1a46836`; `gh` não está instalado), e escolher a próxima sessão: **consertos P1** (recomendado, ADR-051) ou E4-T01.
- **Status:** `pnpm verify` verde (481 testes + `check:docs`); branch `docs-dieta-contexto` (contém `origin/main` `23a9b80`).
- **Última atualização:** 2026-10-11.

## Tarefa atual — E4-T01 · Estilos inline (negrito, itálico, sup, sub) (cópia de `phases/E4-headings-styles.md`; copiada em 2026-10-11)
- A partir do resultado do spike S2: nome da fonte + flags; casos de sobrescrito por tamanho/posição; produzir `runs`.
- **Aceite:** `style_f1` ≥ meta em N1; `runs` adjacentes com o mesmo estilo são fundidos; testes de fronteiras (estilo no meio da palavra).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- Sessão encerrada (2026-10-11) — **checklists manuais E2/E3 CONCLUÍDOS com o PO**; tudo anotado, `pnpm verify` verde (481 testes + `check:docs`), push na branch `docs-dieta-contexto` (conflito com a `main` resolvido, merge `1a46836`).
- **E2 ✓** parágrafos ok nos 2 livros (quebra de palavra no meio → BACKLOG P1) · **E3 ✓** repetições e hifenização aprovadas; conferência visual da p. 41 de `n1-en-sofia` **sem conteúdo perdido** (o trecho que parecia faltar está no bloco `p39-b7`, `pageFrom 39 → pageTo 40`, parágrafo que **cruza página** — só o filtro `pageFrom` da conferência não o mostrava).
- **2 defeitos P1 no BACKLOG:** `\n` no meio da palavra (~3,6 mil em 13 livros; piores `n4-pt-astrofisica` 1.829 e `n1-en-curinga` 1.303) e folio do `n1-pt-curinga` (297; `detectRepeatedRegions` acha 0 regiões porque o número está fora da 1ª/última linha da ADR-046) — consertar **juntos numa tarefa só** (**ADR-051**).
- Títulos reais dos 15 PDFs gravados em `$CORPUS_PRIVATE_DIR/manifest.yaml` (fora do git; `pnpm corpus:fetch` valida as 15 entradas); comandos PowerShell do checklist testados e salvos em `tests/manual/extractor-visual-checklist.md`.
- **Próximo:** (1) PO abre o PR e dá Squash and merge (passo a passo na mensagem do chat); (2) próxima sessão = **consertos P1** (recomendado) ou E4-T01, decisão do PO.

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- [x] Checklist manual da fase E2 (`phases/E2-lines-paragraphs.md`) — **feito (2026-10-11):** parágrafos corretos em `n1-pt-sofia` e `n1-en-curinga`; defeito à parte registrado no **BACKLOG 2026-10-11** (quebra no meio da palavra em `n1-en-curinga`, 1.303 ocorrências, P1).
- [x] Checklist manual da fase E3 (`phases/E3-cleanup.md`) — **feito (2026-10-11):** repetições e hifenização aprovadas; conferência visual da p. 41 de `n1-en-sofia` sem conteúdo perdido (trecho em bloco que cruza página, `p39-b7`); **`n1-pt-curinga` reprovou** com 297 números de página (BACKLOG 2026-10-11, P1).
- [ ] Abrir o PR da branch `docs-dieta-contexto` e dar Squash and merge (checklists concluídos; push e conflito resolvidos pela IA; `gh` não instalado — passo a passo no chat).
- [ ] Escolher a próxima sessão: **consertos P1** (recomendado, ADR-051) ou **E4-T01** (estilos inline).
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
- 2026-10-11 · **Checklists manuais E2/E3 com o PO — CONCLUÍDOS** · comandos PowerShell testados e salvos em `tests/manual/extractor-visual-checklist.md`; títulos dos 15 PDFs gravados no manifest privado (fora do git); branch `docs-dieta-contexto` sincronizada com a `main` (merge `1a46836`); achados → 2 itens P1 no BACKLOG + **ADR-051** (consertos numa rodada só, depois dos checklists); `pnpm verify` verde.
- 2026-10-11 · **DOCS-T01 (dieta de contexto) — CONCLUÍDA (push feito, falta só o PR)** · STATE 148,4 KB → 7,3 KB (histórico em `archive/STATE-full-2026-10-10.md`); índice de ADRs (`pnpm decisions:index`) + ADR-050; `check:docs` ligado ao `verify` e ao CI (STATE ≤ 8 KB/90 linhas, Handoff ≤ 15, log ≤ 2 sessões, AGENTS ≤ 10 KB); skills `start-session`/`end-session`/`record-decision` atualizadas; OPEN-QUESTIONS fatiado → `archive/OPEN-QUESTIONS-ANSWERED.md`.
- Sessões anteriores: `docs/extractor/archive/STATE-full-2026-10-10.md` (seções "Handoff" e "Log de sessões").

Histórico completo: docs/extractor/archive/
