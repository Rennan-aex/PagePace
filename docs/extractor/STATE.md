# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E5 em andamento** — T01 concluída (PR #45); **T02 concluída (PR #46)**; **T03 concluída (PR #48)**; **T04 concluída (PR #50)**; **T05 concluída (PR #51)**; **T06 concluída (PR #52)**; **T07 concluída (PR #53)**; **T08 código pronto, PR a abrir**. E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E5-T08 — trechos em grego/latim** (detalhe em `phases/E5-notes-quotes.md`).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (773 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (eval antes/depois idêntico — nenhuma métrica mudou).
- **Última atualização:** 2026-10-18 (E5-T08 código + provas + docs prontos).

## Tarefa atual — E5-T08 · Trechos em grego/latim (cópia de `phases/E5-notes-quotes.md`)
- Preservar caracteres; marcar `lang` quando óbvio (bloco de caracteres gregos). **Aceite:** nenhum caractere perdido em PDF com grego.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-18 — E5-T08 (grego/latim) — CÓDIGO PRONTO, PR A ABRIR** · branch `e5-t08-greek-latin` (código `5220b04` + docs commitados).
- Feito: varredura do corpus (caracteres gregos já chegavam integros; `lang` nunca marcado); `greek.ts` (camada 5: `lang: "grc"` se todas as letras são grego e ≥ 3); wire no `book.ts`; `minipdf` + `/ToUnicode` para o sintético; aceitação E2E (Platão caractere a caractere + `n2-en-arxiv-phobos` público); ADR-066; fase + STATE.
- `Run.lang` já existia no esquema 1.0.0 — **sem mudança de esquema, golden nem métrica**.
- Próximo comando: `git push -u origin e5-t08-greek-latin` → abrir PR → checks → merge → limpar branch local → `report-to-po` (fim da E5, próximo marco = E6).

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
| E5 | in progress (T01 PR #45; T02 PR #46; T03 PR #48; T04 PR #50; T05 PR #51; T06 PR #52; T07 PR #53; T08 PR a abrir) |
| E6…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 30 documentos (15 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` 1,0000 em 11 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 11 de coluna única e 0,1429 em `syn-n2-en-columns` · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1`/`heading_level_acc` 1,0000 em 11 dos 12 e 0,0000 em `syn-n2-en-columns` (E4-T02) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` 1,0000 em 11 dos 12 e 0,0667 em `syn-n2-en-columns` (E5-T04/T05/T06/T07, ADR-062/063/064/065).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-18 · **E5-T07 (numeração marginal) — CONCLUÍDO** · **PR #53** · `marginrefs.ts` (forma + posição; `margin_ref` acima de tudo; `origin.bbox`) + sintético `syn-n2-en-marginrefs` (1,0000) + **ADR-065**; **769 testes**; `pnpm eval --ci` exit 0; REQ-19 → BACKLOG.
- 2026-10-17 · **E5-T06 (referências bibliográficas) — CONCLUÍDO** · **PR #52** · `references.ts` (título de seção en/pt + forma de entrada; `reference` acima de tudo) + sintético `syn-n2-en-references` (1,0000) + **ADR-064**; **754 testes**; `pnpm eval --ci` exit 0.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`.

Histórico completo: docs/extractor/archive/
