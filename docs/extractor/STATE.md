# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E5 CONCLUÍDA** — T01 (PR #45); T02 (PR #46); T03 (PR #48); T04 (PR #50); T05 (PR #51); T06 (PR #52); T07 (PR #53); T08 (PR #54). **E6 em andamento** — T01 (PR #56, 2026-10-19); T02 é a próxima. E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E6-T02 — ordem de leitura (XY-cut ou equivalente)** (detalhe em `phases/E6-columns.md`).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (807 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (nenhuma métrica mudou com a E6-T01 — a detecção ainda não altera a extração).
- **Última atualização:** 2026-10-19 (E6-T01 concluída).

## Tarefa atual — E6-T02 · Ordem de leitura de colunas (cópia de `phases/E6-columns.md`)
- Ordenar regiões com `detectColumns` (E6-T01): XY-cut ou equivalente; pontos de quebra entre colunas e páginas. **Aceite:** `reading_order` ≥ meta em N2 (`syn-n2-en-columns` hoje 0,1429); teste de regressão em N1 (não piora).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-19 — E6-T01 (detecção de colunas) — CONCLUÍDA (PR #56)** · `columns.ts` (camada 3, puro): projeção de **itens brutos** no eixo x — voto = centro no bin **ou** item cruzando o bin inteiro (bordas fechadas); gate relativo ao **pico** da projeção (não ao nº de itens: equações do arXiv têm ~600 itens/página que raspam bandas); guarda de largura mínima por coluna (0,2 da área) mata falso positivo de fio solto; teto `COLUMNS_MAX = 3`; `spanningItems`/`regionSpanning` marcam título/resumo/figura que atravessam. **ADR-067**. Sem mudança de esquema, sem métrica nova, **sem plug no `buildBook`**.
- Provas: 17 unit + 2 sintéticos pdf.js (1/2 colunas + título atravessando) + 2 corpus `skipIf` (arXiv 7/10 páginas 2 col; rebus+SciLO 130/130 páginas 1 col — 4 falsos positivos do rebus sumiram). `pnpm eval --ci` exit 0, baseline intocada.
- Próxima sessão: `pnpm verify` verde antes de mexer em algo → branch `e6-t02-reading-order` a partir de `main` → skill `add-heuristic`; consumir `detectColumns` no `buildBook` (reordenar blocos por coluna); alvo: `syn-n2-en-columns` `reading_order` ≥ 0,99 sem regressão em N1.
- Armadilha: o `groupLines` continua intercalando colunas (usado pelas passes de semântica) — a ordenação da E6-T02 deve partir dos itens/colunas, não das linhas atuais.

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
| E6 | in progress (T01 PR #56 done 2026-10-19; T02 next) |
| E7…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 30 documentos (15 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` 1,0000 em 11 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 11 de coluna única e 0,1429 em `syn-n2-en-columns` · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1`/`heading_level_acc` 1,0000 em 11 dos 12 e 0,0000 em `syn-n2-en-columns` (E4-T02) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` 1,0000 em 11 dos 12 e 0,0667 em `syn-n2-en-columns` (E5-T04/T05/T06/T07, ADR-062/063/064/065).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-19 · **E6-T01 (detecção de colunas) — CONCLUÍDO** · **PR #56** · `columns.ts` (projeção de itens, voto centro-ou-cruzamento, gate pelo pico, guarda de largura, teto 3, `spanningItems`/`regionSpanning`) + aceitação sintética e de corpus + **ADR-067**; **807 testes**; `pnpm eval --ci` exit 0 (sem mudança de métrica — detecção fora do `buildBook` até a E6-T02).
- 2026-10-18 · **E5-T08 (trechos em grego/latim) — CONCLUÍDO** · **PR #54** · `greek.ts` (lang "grc" por bloco óbvio de letras gregas; latim não marcado) + aceitação E2E (sintético `/ToUnicode` + `n2-en-arxiv-phobos` público) + **ADR-066**; **773 testes**; `pnpm eval --ci` exit 0 (sem mudança de métrica); **E5 fechada**.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`.

Histórico completo: docs/extractor/archive/
