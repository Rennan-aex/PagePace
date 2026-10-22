# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E7 CONCLUÍDA** (2026-10-21) — T01–T05 done (ADR-071/072/073/074/075/076/077). E6 CONCLUÍDA — T01 (PR #56); T02 (PR #57); T03, T04 (2026-10-19, ADR-070). E5 fechada (PRs #45–#54); E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37). Próxima fase: **E8** (`phases/` de E8 — descarta `font.data`).
- **Tarefa atual:** nenhuma em andamento — E7-T05 concluída. Próxima sessão: primeira tarefa de **E8**.
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (950 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (baseline intacta — a sessão de 2026-10-22 mudou só a apresentação da CLI, nenhuma heurística).
- **Última atualização:** 2026-10-22 (consertos da CLI: ADR-078; varredura de 5 relatórios inspect no BACKLOG).

## Tarefa atual — nenhuma (E7 fechada; próxima: E8)
- Ver **Fase atual** acima e o arquivo da fase de E8 em `phases/`.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-22 — consertos da CLI + backlog da varredura — CONCLUÍDO** · branch `fix/cli-inspect-presentation` (de `main` `8be8fd8` + docs). Entregue: `normalizeCliPath` (barras duplicadas do pnpm, UNC preservado), `--out` raiz recusado com erro claro, faixa `páginas X-Y` no HTML/MD, resumo com nota de OCR (**ADR-078**); BACKLOG com a varredura dos 5 relatórios inspect (fila 3A: pequenos → embaralhamento/rodapé → spike fi/à); relatórios do PO em `<CORPUS_PRIVATE_DIR>\Relatórios`. **950 testes** (+6), `pnpm eval --ci` exit 0. Próxima: primeira tarefa de **E8** (ou BACKLOG P1 da fila 3A, se o PO escolher).
- *(handoffs anteriores: ver Log de sessões e archive/)*

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
| E8…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-22 · **Consertos da CLI + backlog da varredura — CONCLUÍDO** · `normalizeCliPath`, `--out` raiz recusado, `páginas X-Y` no HTML/MD, nota de OCR no resumo (**ADR-078**); BACKLOG com os achados dos 5 relatórios inspect (fila 3A); **950 testes** (+6); `pnpm eval --ci` exit 0.
- 2026-10-21 · **E7-T05 (CLI completa) — CONCLUÍDO** · `explain.ts` no extractor (pipeline real + `Book` final, ADR-077) + CLI `inspect` text/md/html (render `@napi-rs/canvas`, ADR-076), `explain-page`, `eval` delegado; README do pacote + checklist (6)/(7); **944 testes** (+15); `pnpm eval --ci` exit 0; **ADR-076/077**; **E7 fechada**.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md` (E7-T02/T03; E7-T04 ver ADR-074/075).

Histórico completo: docs/extractor/archive/
