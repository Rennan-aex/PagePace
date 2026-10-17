# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E5 em andamento** — T01 concluída (PR #45); **T02 em curso** (branch `e5-t02-link-footnotes`). E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E5-T02 — ligação nota↔chamada** (ver cópia acima e `phases/E5-notes-quotes.md`).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** código + testes da T02 verdes (621 testes no run de eval+extractor); falta: `pnpm eval` + baseline, docs (ADR-060, EVALUATION, fase, skill `write-golden-test`), commit/PR.
- **Última atualização:** 2026-10-16 (E5-T02 em curso).

## Tarefa atual — E5-T02 · Notas: ligação à chamada (cópia de `phases/E5-notes-quotes.md`)
- Encontrar a chamada (sobrescrito/número no texto), ligar `noteRef` no `run` e `anchor` na nota; tratar nota que continua na página seguinte.
- **Aceite:** `footnote_link_acc` ≥ meta; chamadas sem nota e notas sem chamada viram `flags` e baixam confiança.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-16 — E5-T02 (notas: ligação à chamada) — EM CURSO:** branch `e5-t02-link-footnotes`.
- Feito: `notelinks.ts` (novo: `noteMarkerLabel`, `linkFootnoteCalls`, flags `note-without-call`/`call-without-note`, conf 0,7); `footnotes.ts` (guarda cross-page removida); `book.ts` (passada `if (!fromOcr)`; `avgConfidence` dos blocks); `minipdf.ts` (`size`/`rise` → `Ts`); `golden.ts` 1.1.0 + `noteRef` (label); `synthetic.ts`/`specs.ts` (run `style: "sup"`, `SUP_*` shares); `metrics.ts` `footnoteLinkAcc`; `eval.ts` wiring completo; `baseline.ts` direção.
- Testes: `notelinks.test.ts` (15) · `footnotes.test.ts` (22) · `golden.test.ts` · `footnote-links.test.ts` (aceitação N3 ≥ 0,9 + sintético === 1) · `metrics.test.ts` · `baseline.test.ts` · `eval.test.ts` (fixture baseline). `pnpm corpus:synthetic` ok (sha do `syn-n3-en-footnotes` atualizado no manifest: `e72a170a…`).
- Descobertas: y top-down (sup = baseline MENOR, rise ≥ 0,25×size); `anchor` vai no decision da NOTA; nota sem marcador parseável não liga nem flaga; OCR pula a passada.
- Próximo: `pnpm eval` → comparar → `--update-baseline` (métrica nova entra no baseline.json) → docs (ADR-060, EVALUATION.md, fase, skill) → `pnpm verify` → commit + PR.

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
| E5 | in progress (T01 PR #45; T02 em curso) |
| E6…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 26 documentos (11 públicos + 15 privados); 7 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 7 · `para_boundary_f1` 1,0000 em 6 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 6 de coluna única e 0,1429 em `syn-n2-en-columns` (duas colunas = alvo da E6) · `header_footer_f1` 1,0000 nos 7 · `hyphen_join_acc` 1,0000 nos 7 (ADR-047) · `style_f1` 1,0000 nos 7 (E4-T01/T05) · `heading_f1`/`heading_level_acc` 1,0000 em 6 dos 7 e 0,0000 em `syn-n2-en-columns` (E4-T02). **T02:** `footnote_link_acc` entra no baseline desta sessão (sintético deve dar 1,0000).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-16 · **E5-T02 (ligação nota↔chamada) — EM CURSO** · `notelinks.ts` + wiring eval/synthetic/golden 1.1.0 + testes; `pnpm corpus:synthetic` ok; falta eval/baseline/docs/PR.
- 2026-10-16 · **E5-T01 (notas de rodapé: detecção) — CONCLUÍDO** · **PR #45** · `footnotes.ts` + 21 testes; 218 notas no corpus (eram 76); FP residuais → BACKLOG.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`.

Histórico completo: docs/extractor/archive/
