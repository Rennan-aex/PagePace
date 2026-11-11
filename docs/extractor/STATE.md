# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E10 FECHADA (2026-11-11)** — T01 (figuras), T02 (tabelas), T03 (equações) e T04 (recortes) prontas. E9/E8/E7/E6/E5/E4/E3/E2/E1/E0 fechadas.
- **Próxima tarefa:** trilha **SEG** — `phases/SEG-segmenter.md` (frases e palavras pt/en; pode começar a qualquer momento depois do E1 e é obrigatória antes do M2 do app). Abrir o arquivo da fase na próxima sessão.
- **Ação pendente do PO:** não apagar a entrega (Release) `corpus-public-v1`; git desde 2026-10-14 (**ADR-054**) o agente faz sozinho com o `gh`. (Branch `ci-baseline-check` apagada em 2026-11-06 com autorização do PO.)
- **Status:** **PR #100 aberto** — E10-T04 (recortes) pronta: teste `test/figure-clip.test.ts` (bbox do `figure` → `renderPageRegion` → não-branco + controle em branco, regra ADR-016); `renderPageRegion` (ADR-075) e decisão de produto (ADR-016) já existiam, sem código novo. `pnpm verify` local verde (1198 testes); `pnpm eval --ci` exit 0; baseline/schema intocados.
- **Última atualização:** 2026-11-11 (E10-T04 recortes concluída; E10 fechada).

## Tarefa atual — SEG (próxima; abrir `phases/SEG-segmenter.md` na próxima sessão)
- **Da fase:** frases e palavras pt/en; suíte de casos pt/en passando (ver `phases/SEG-segmenter.md` para tarefas e aceites).
- **Por que agora:** E0–E10 concluídas; SEG é a última trilha do extrator antes do M2 do app (ROADMAP).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão: E10-T04 (recortes) — teste pronto, PR #100 em aberto.** Feito: `packages/extractor/test/figure-clip.test.ts` (2 integração: bbox do `figure` → `renderPageRegion` → >0 não-brancos; controle região em branco → 0; canvas `@napi-rs/canvas` já era devDep). Sem código novo — API (ADR-075) e decisão (ADR-016) já existiam; OPEN-QUESTIONS #1 respondida em 2026-10-04. Fase marcada `done`, E10 fechada na tabela, STATE atualizado. `pnpm verify` e `pnpm eval --ci` verdes (1198 testes).
- **Próximo passo:** merge do PR (checks verdes) e depois docs-PR "mark E10-T04 merged in STATE"; sessão seguinte = SEG (`phases/SEG-segmenter.md`).

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
| E8 | **done** (T01–T04 — fase fechada 2026-10-29; ADR-088/089/090/091/092; medições Android 3/3) |
| E9 | **done** (T01–T04 done 2026-10-30/11-02, ADR-093–098 — fase fechada 2026-11-02; E9 = OCR da ADR-018) |
| E10 | **done** (T01a/T01b/T02/T03/T04 — fase fechada 2026-11-11; ADR-100/101/102; recorte = ADR-016 + ADR-075) |
| SEG | todo (segmentador pt/en, `phases/SEG-segmenter.md`) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-11-11 · **E10-T04 (recortes) — CONCLUÍDO** · `test/figure-clip.test.ts` (2 integração: bbox do `figure` → `renderPageRegion` → >0 pixels não-brancos; controle: região em branco da mesma página → 0 — o recorte segue a área do bloco, nunca a página inteira; regra ADR-016, gate de modo normal×dinâmico é do app/A-015). Sem código novo (API ADR-075 e decisão ADR-016 já existiam; OPEN-QUESTIONS #1 respondida 2026-10-04). `pnpm verify` 1198 testes, `pnpm eval --ci` exit 0, schema/baseline intocados. **PR #100. E10 fechada; próxima: SEG.**
- 2026-11-10 · **E10-T03 (equações) — CONCLUÍDO** · `equations.ts` (`detectEquations`, gates da ADR-102: run máximo de linhas reivindicáveis + fragmento de fórmula, `PROSE_TAIL`, `symbols > 0`) + `claims.ts` (`splitParagraphsAtClaims`, T02 reusou) + bloco `equation` em `book.ts`, 22 testes novos (1196 totais), fase/STATE/DECISIONS/BACKLOG atualizados, verify/eval verdes (`eval --ci` exit 0; schema/baseline intocados; medido: phobos 20, n2-astro 30, n4-en-astro 62, n4-pt 2080). PR #98 (squash `d99cb2c`).
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md`, `archive/STATE-log-2026-11-02-e9t04.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088; E9-T02 = ADR-095/096; E9-T04 = ADR-098).

Histórico completo: docs/extractor/archive/
