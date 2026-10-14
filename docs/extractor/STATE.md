# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** E4 (Títulos/estilos/sumário) — T01 `done` e mesclada (PR #38); T02…T05 `todo`. E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E4-T02 — Detecção de títulos e níveis** (cópia abaixo). E4-T01 concluído e mesclado como **PR #38** (2026-10-14).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh` instalado na máquina.
- **Status:** `pnpm verify` verde (532 testes + `check:no-pdf` + `check:docs`); `pnpm eval` sem regressão (`style_f1` 1,0000 nos 7 documentos, baseline atualizado).
- **Última atualização:** 2026-10-14 (DOCS-T03, autonomia de git — ADR-054).

## Tarefa atual — E4-T02 · Detecção de títulos e níveis (cópia de `phases/E4-headings-styles.md`)
- Clusters de tamanho/peso/espaçamento relativos ao corpo; centralização; linhas curtas isoladas; numeração (`1.2`, `Capítulo`); evitar legendas e epígrafes.
- **Aceite:** `heading_f1` e `heading_level_acc` ≥ meta; relatório de falsos positivos.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- Sessão encerrada (2026-10-14) — **DOCS-T03 (autonomia de git) CONCLUÍDO** na branch `docs-autonomia-git`: AGENTS.md ganhou a seção "Branches, PR e merge" (regra 8 virou só Conventional Commits); `start-session` agora roda `git fetch --prune` + `git branch -vv` (branch `[gone]` → tarefa já mesclada, limpar e seguir; PR aberto → `gh pr checks` → merge se verde / corrigir se falhou / esperar se pendente; working tree sujo → avisar o PO); `end-session` abre o PR com `gh pr create --body-file` e mescla na mesma sessão se os checks já estiverem verdes. **ADR-054**. Nenhum código de produto mudou.
- **E4-T01 mesclado na `main` como PR #38** (2026-10-14); a branch local `e4-t01-inline-styles` já pode ser removida (`git branch -D`).
- **Próximo:** próxima sessão = **E4-T02 — Detecção de títulos e níveis** (definição na seção "Tarefa atual").
- Limitação E4-T01: itálico por tesoura (~107 letras no corpus) ainda não detectado (spike S2 §4).
- Blocos só-número que **não são folio**: `n3-pt-filosofia2` 145 e `n3-en-filosofia` 85 (inalterados); se um golden real reprovar, abrir P2 no BACKLOG.

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
| E4 | in progress (T01 merged PR #38 2026-10-14; T02…T05 todo) |
| E5…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 26 documentos (11 públicos + 15 privados); 7 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 7 · `para_boundary_f1` 1,0000 em 6 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 6 de coluna única e 0,1429 em `syn-n2-en-columns` (duas colunas = alvo da E6) · `header_footer_f1` 1,0000 nos 7 · `hyphen_join_acc` 1,0000 nos 7 (ADR-047) · `style_f1` 1,0000 nos 7 (E4-T01; F1 por caractere de negrito/itálico).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-14 · **DOCS-T03 (autonomia de git) — CONCLUÍDO** · AGENTS.md ganhou a seção "Branches, PR e merge" (regra 8 = só Conventional Commits), `start-session` ganhou `git fetch --prune` + `git branch -vv` (branch `[gone]` → limpar e seguir; PR aberto → `gh pr checks` → merge/corrigir/esperar), `end-session` agora abre PR com `gh pr create --body-file` e mescla se os checks estiverem verdes; **ADR-054**; nenhum código de produto mudou; branch `docs-autonomia-git`.
- 2026-10-13 · **E4-T01 (estilos inline) — CONCLUÍDO** · `fontstyle.ts` (nome da fonte → bold/italic, spike S2) + `runs.ts` (runs por item, sup/sub por tamanho/posição, fusão de vizinhos iguais, item só-espaço neutro — **ADR-053**) + `style_f1` no eval (F1 por caractere de negrito/itálico, `METRIC_DIRECTIONS` + tabela do relatório); `style_f1` = 1,0000 nos 7 documentos (antes 0,9737 em `syn-n2-pt-estilos`), nenhum outro regrediu; `pnpm verify` 532 testes; **mesclado como PR #38 (2026-10-14)**.
- Sessões anteriores: `docs/extractor/archive/STATE-full-2026-10-10.md` e `archive/STATE-log-2026-10-12.md` (seções "Handoff" e "Log de sessões").

Histórico completo: docs/extractor/archive/
