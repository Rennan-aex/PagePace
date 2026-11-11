# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E10 FECHADA (2026-11-11)** — T01 (figuras), T02 (tabelas), T03 (equações) e T04 (recortes) prontas. E9/E8/E7/E6/E5/E4/E3/E2/E1/E0 fechadas.
- **Próxima tarefa:** trilha **SEG** — `phases/SEG-segmenter.md` (frases e palavras pt/en; pode começar a qualquer momento depois do E1 e é obrigatória antes do M2 do app). Abrir o arquivo da fase na próxima sessão.
- **Ação pendente do PO:** nenhuma — a entrega `corpus-public-v1` foi apagada em 2026-11-11, depois do CI verde da `main` (ADR-103).
- **Status:** **PR #102 MESCLADO** (squash `91a49c7`, CI `verify` verde na `main`) — manutenção "eliminar a entrega `corpus-public-v1`" concluída (ADR-103): os 2 PDFs do SciELO são versionados em `corpus/vendored/` (byte a byte, SHA-256 inalterados), o `corpus:fetch` copia sem rede, o `pnpm check:no-pdf` virou TS com exceção testada, e a entrega + tag foram apagadas. `pnpm verify` verde (1206 testes); `pnpm eval --ci` exit 0; baseline/goldens intocados.
- **Última atualização:** 2026-11-11 (manutenção corpus-public-v1 concluída; entrega apagada).

## Tarefa atual — SEG (próxima; abrir `phases/SEG-segmenter.md` na próxima sessão)
- **Da fase:** frases e palavras pt/en; suíte de casos pt/en passando (ver `phases/SEG-segmenter.md` para tarefas e aceites).
- **Por que agora:** E0–E10 concluídas; SEG é a última trilha do extrator antes do M2 do app (ROADMAP).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão concluída: manutenção `corpus-public-v1` (ADR-103) — PR #102 mesclado (squash `91a49c7`); entrega e tag apagadas depois do CI verde da `main`.** Feito: `corpus/vendored/` com os 2 PDFs byte a byte + `README.md` de licenças (CC BY 4.0 re-verificadas em 2026-11-11); `vendored:` no manifest (sem `source_url`/`fallback_urls`); `corpus:fetch` copia sem rede; `check:no-pdf` = `packages/eval/src/check-no-pdf.ts` + teste (2 passam, 3º PDF reprova, digest errado reprova); `scripts/check-no-pdf.sh` removido; docs (`corpus/README.md`, `CORPUS.md`, `E1-foundation.md`, `ci.yml`, `AGENTS.md`, skill `add-corpus-pdf`) + ADR-103 e nota na ADR-034. CI na `main`: `copied ... (596315/694609 bytes)`, `2 vendored`, `check:no-pdf` OK.
- **Próximo passo:** trilha **SEG** — `phases/SEG-segmenter.md`, branch nova a partir da `main` atualizada (`91a49c7`).

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- Nenhum aberto.

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
| E8 | **done** (T01–T04 — fase fechada 2026-10-29; ADR-088/089/090/091/092; medições Android 3/3) |
| E9 | **done** (T01–T04 done 2026-10-30/11-02, ADR-093–098 — fase fechada 2026-11-02; E9 = OCR da ADR-018) |
| E10 | **done** (T01a/T01b/T02/T03/T04 — fase fechada 2026-11-11; ADR-100/101/102; recorte = ADR-016 + ADR-075) |
| SEG | todo (segmentador pt/en, `phases/SEG-segmenter.md`) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-11-11 · **manutenção `corpus-public-v1` — CONCLUÍDO** · 2 PDFs do SciELO versionados byte a byte em `corpus/vendored/` (ADR-103, licenças CC BY 4.0 re-verificadas) + `vendored:` no manifest (cópia sem rede no `corpus:fetch`) + `check:no-pdf` em TypeScript com exceção testada por caminho e SHA-256 (`scripts/check-no-pdf.sh` removido) + docs/ADR-103 e nota na ADR-034. `pnpm verify` 1206 testes, `pnpm eval --ci` exit 0, baseline/goldens intocados. **PR #102 (squash `91a49c7`); CI da `main` verde (2 vendored, 0 requisições para o SciELO); entrega e tag `corpus-public-v1` apagadas. Próxima: SEG.**
- 2026-11-11 · **E10-T04 (recortes) — CONCLUÍDO** · `test/figure-clip.test.ts` (2 integração: bbox do `figure` → `renderPageRegion` → >0 pixels não-brancos; controle: região em branco da mesma página → 0 — o recorte segue a área do bloco, nunca a página inteira; regra ADR-016, gate de modo normal×dinâmico é do app/A-015). Sem código novo (API ADR-075 e decisão ADR-016 já existiam; OPEN-QUESTIONS #1 respondida 2026-10-04). `pnpm verify` 1198 testes, `pnpm eval --ci` exit 0, schema/baseline intocados. **PR #100 (squash `8c549d1`). E10 fechada; próxima: SEG.**
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md`, `archive/STATE-log-2026-11-02-e9t04.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088; E9-T02 = ADR-095/096; E9-T04 = ADR-098; E10-T03 equações = ADR-102, PR #98).

Histórico completo: docs/extractor/archive/
