# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E5 em andamento** — T01 concluída (PR #45); **T02 concluída (PR #46)**; próxima **E5-T03**. E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E5-T03 — notas de fim (endnotes)** (cópia abaixo; detalhe em `phases/E5-notes-quotes.md`).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (621 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (`footnote_link_acc` = 1,0000 nos 7 medidos).
- **Última atualização:** 2026-10-16 (E5-T02 concluída, PR #46).

## Tarefa atual — E5-T03 · Notas de fim (endnotes) (cópia de `phases/E5-notes-quotes.md`)
- Seção de notas ao fim de capítulo/livro ligada às chamadas por número. **Aceite:** teste em fixture sintética.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-16 — E5-T02 (ligação nota↔chamada) — CONCLUÍDA** (PR #46, branch `e5-t02-link-footnotes`, squash na `main`).
- O que ficou: `notelinks.ts` (`linkFootnoteCalls` por (página, label); `noteRef` na chamada, `anchor` na nota; flags `note-without-call`/`call-without-note` + conf 0,7; nota sem marcador não liga nem flaga; OCR pula); guarda cross-page removida em `footnotes.ts`; métrica **`footnote_link_acc`** (F1 por (página, label)) no eval + baseline (1,0000 nos 7); golden **1.1.0** com `noteRef` (label, **ADR-060**); sintético `syn-n3-en-footnotes` com run `style: "sup"` (`rise`/`size` no minipdf, y top-down); 621 testes.
- Próximo passo: **E5-T03** — endnotes; decidir sinal (seção "Notes/Endnotes" no fim × lista de notas sem chamada na página); reutilizar `notelinks` casando por número; fixture sintética nova (provável spec `syn-n*-endnotes`).

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
| E5 | in progress (T01 PR #45; T02 PR #46; T03 é a próxima) |
| E6…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 26 documentos (11 públicos + 15 privados); 7 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 7 · `para_boundary_f1` 1,0000 em 6 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 6 de coluna única e 0,1429 em `syn-n2-en-columns` (duas colunas = alvo da E6) · `header_footer_f1` 1,0000 nos 7 · `hyphen_join_acc` 1,0000 nos 7 (ADR-047) · `style_f1` 1,0000 nos 7 (E4-T01/T05) · `heading_f1`/`heading_level_acc` 1,0000 em 6 dos 7 e 0,0000 em `syn-n2-en-columns` (E4-T02) · `footnote_link_acc` 1,0000 nos 7 (E5-T02, ADR-060).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-16 · **E5-T02 (ligação nota↔chamada) — CONCLUÍDO** · **PR #46** · `notelinks.ts` + `footnote_link_acc` (F1 por (página, label)) + golden 1.1.0 (`noteRef`, **ADR-060**) + sintético sup; **621 testes**; `pnpm eval --ci` exit 0 (baseline: 1,0000 nos 7).
- 2026-10-16 · **E5-T01 (notas de rodapé: detecção) — CONCLUÍDO** · **PR #45** · `footnotes.ts` + 21 testes; 218 notas no corpus (eram 76); FP residuais → BACKLOG.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`.

Histórico completo: docs/extractor/archive/
