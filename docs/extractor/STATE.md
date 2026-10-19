# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E5 CONCLUÍDA** — T01 (PR #45); T02 (PR #46); T03 (PR #48); T04 (PR #50); T05 (PR #51); T06 (PR #52); T07 (PR #53); T08 (PR #54). **E6 em andamento** — T01 (PR #56); T02 (PR #57); T03 concluída (2026-10-19); T04 é a próxima. E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E6-T04 — colunas + notas + cabeçalhos** (detalhe em `phases/E6-columns.md`).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (835 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (`syn-n2-en-columns`: `reading_order`/`para_boundary_f1`/`heading_f1` = 1,0000, `block_kind_f1` 0,5556 — nada piorou).
- **Última atualização:** 2026-10-19 (E6-T03 concluída).

## Tarefa atual — E6-T04 · Colunas + notas + cabeçalhos (cópia de `phases/E6-columns.md`)
- Integração com E3/E5 em artigos de duas colunas. **Aceite:** métricas de N2 completas sem regressão em N1/N3.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-19 — E6-T03 (regiões laterais/sidebars) — CONCLUÍDA** · branch `e6-t03-sidebars` · `sidebars.ts` (`splitSideRegions`: faixas por gap < 1 corpo; lateral precisa de largura 4–35%, share de itens **abaixo** de `COLUMNS_MIN_COLUMN_SHARE`, ≥ 3 linhas contíguas) rodando **antes** do `detectColumns` em `groupPageParagraphs`; linhas laterais com `side: true`; `buildBook` marca `flags: ["sidebar"]` sem baixar confiança, exclui essas linhas das medidas e a junção E3-T04 nunca cruza sidebars. **ADR-069**.
- Resultado: 15 testes novos (820→835), fixture pdf.js `test/sidebars-pdf.test.ts`; `pnpm eval --ci` exit 0, baseline intocada; sonda corpus público: 0 falsos positivos em 137 páginas.
- Próxima sessão: `pnpm verify` verde antes de mexer → branch `e6-t04-columns-integration` a partir de `main` → E6-T04 (medidas por coluna em `syn-n2-en-columns`: resolve `blockquote` indevido e `heading_level_acc` 0; integra notas/cabeçalhos em artigo de 2 colunas).
- Pendências da E6 (todas da E6-T04 agora): medida por coluna (resolve `blockquote` e `heading_level_acc` do sintético); bloco full-width no **rodapé** de página de 2 colunas ainda lê antes das colunas.

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
| E6 | in progress (T01 PR #56 done 2026-10-19; T02 PR #57 done 2026-10-19; T03 done 2026-10-19; T04 next) |
| E7…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 30 documentos (15 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12**; `heading_level_acc` 1,0000 em 11 e 0,0000 em `syn-n2-en-columns` (gabarito espera nível 2, extrator emite 1 — E6-T04) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` 1,0000 em 11 e **0,5556** em `syn-n2-en-columns` (coluna 2 ainda vira `blockquote` — E6-T04; era 0,0667).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-19 · **E6-T03 (regiões laterais/sidebars) — CONCLUÍDO** · `splitSideRegions` (`sidebars.ts`) antes do `detectColumns` no `groupPageParagraphs` (ADR-069) + `side: true` nas linhas + `flags: ["sidebar"]` sem baixar confiança + side fora das medidas + guarda E3-T04; **835 testes**; `pnpm eval --ci` exit 0, baseline intocada; 0 falsos positivos em 137 páginas do corpus público.
- 2026-10-19 · **E6-T02 (ordem de leitura de colunas) — CONCLUÍDO** · **PR #57** · `groupPageParagraphs` consome `detectColumns` (banda spanning própria, colunas esquerda→direita) + `groupItemLines` extraído de `groupLines` + gate N2 (`reading_order` ≥ 0,99) + **ADR-068**; **820 testes**; `syn-n2-en-columns`: `reading_order`/`para_boundary_f1`/`heading_f1` 0,1429/0/0 → 1,0000/1/1, `block_kind_f1` 0,0667→0,5556; nenhum documento piorou, baseline regravada, `pnpm eval --ci` exit 0.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`.

Histórico completo: docs/extractor/archive/
