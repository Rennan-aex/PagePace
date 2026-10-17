# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E5 em andamento** — T01 concluída (PR #45); **T02 concluída (PR #46)**; **T03 concluída (2026-10-17)**; próxima **E5-T04**. E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E5-T04 — citações em bloco e epígrafes** (cópia abaixo; detalhe em `phases/E5-notes-quotes.md`).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (690 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (`footnote_link_acc` = 1,0000 nos 8 medidos).
- **Última atualização:** 2026-10-17 (E5-T03 concluída — detecção + ligação + sintético).

## Tarefa atual — E5-T04 · Citações em bloco e epígrafes (cópia de `phases/E5-notes-quotes.md`)
- Recuo duplo, fonte menor/itálico, entrelinha diferente. **Aceite:** `block_kind_f1` por tipo no nível 3.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-17 — E5-T03 (notas de fim / endnotes) — CONCLUÍDO** na branch `e5-t03-endnotes` (commits `2f5ac12`→`e0c7ae7`; PR aberto pelo agente — número no log abaixo).
- Entrega: `endnotes.ts` (`detectEndnotes`, `ENDNOTE_SECTION_TITLES` en/pt com igualdade exata normalizada, para em `heading`/não-marcador, título nunca é nota) · `opensWithNoteMarker` compartilhado em `footnotes.ts` · `notelinks.ts` (`NoteCallBlock.endnote?` + fallback `endnoteAfter`; página de endnotes fora de `pagesWithNotes`) · `book.ts` (união footnotes ∪ endnotes) · exports `index.ts`.
- Sintético **`syn-n3-en-endnotes`** (spec + manifest + golden; chamadas `sup` p.1, seção "Notes" de corpo p.2) com **todas as métricas 1,0000**; baseline 8 × 1,0000; aceite `footnote_link_acc === 1` nos dois sintéticos de notas.
- Testes: 12 em `endnotes.test.ts`; `pnpm verify` EXIT 0 (690 testes); `pnpm eval --ci` exit 0; **sem mudança de esquema** (**ADR-061** registrada e no índice).
- Próximo: **E5-T04 (citações em bloco e epígrafes)** — recuo duplo/itálico/entrelinha; meta `block_kind_f1`; ver `phases/E5-notes-quotes.md` e BACKLOG (FP de lista/referência da ADR-059 estão em E5-T05/E5-T06).

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
| E5 | in progress (T01 PR #45; T02 PR #46; T03 concluída 2026-10-17; T04 é a próxima) |
| E6…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 26 documentos (11 públicos + 15 privados); 8 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 8 · `para_boundary_f1` 1,0000 em 7 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 7 de coluna única e 0,1429 em `syn-n2-en-columns` (duas colunas = alvo da E6) · `header_footer_f1` 1,0000 nos 8 · `hyphen_join_acc` 1,0000 nos 8 (ADR-047) · `style_f1` 1,0000 nos 8 (E4-T01/T05) · `heading_f1`/`heading_level_acc` 1,0000 em 7 dos 8 e 0,0000 em `syn-n2-en-columns` (E4-T02) · `footnote_link_acc` 1,0000 nos 8 (E5-T02/E5-T03, ADR-060/061).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-17 · **E5-T03 (notas de fim / endnotes) — CONCLUÍDO** · branch `e5-t03-endnotes` · `endnotes.ts` + fallback de label em `notelinks.ts` + sintético `syn-n3-en-endnotes` (1,0000 em tudo) + **ADR-061** (sem mudança de esquema); **690 testes**; `pnpm eval --ci` exit 0 (baseline 8 × 1,0000).
- 2026-10-16 · **E5-T02 (ligação nota↔chamada) — CONCLUÍDO** · **PR #46** · `notelinks.ts` + `footnote_link_acc` (F1 por (página, label)) + golden 1.1.0 (`noteRef`, **ADR-060**) + sintético sup; **621 testes**; `pnpm eval --ci` exit 0 (baseline: 1,0000 nos 7).
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`.

Histórico completo: docs/extractor/archive/
