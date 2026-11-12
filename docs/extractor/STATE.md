# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **SEG em andamento (2026-11-11)** — T01 (API + testes), T02 (frases) e T03 (palavras) prontas; T04–T05 abertas. E10/E9/E8/E7/E6/E5/E4/E3/E2/E1/E0 fechadas.
- **Próxima tarefa:** **SEG-T04 (idioma misto e robustez)** — texto completo copiado abaixo.
- **Ação pendente do PO:** nenhuma.
- **Status:** **SEG-T03 concluída em 2026-11-11 (PR #109)** — `packages/segmenter/src/words.ts` quebra em `—` (U+2014, travessão como token próprio mesmo colado); hífen composto, apóstrofo (reto e `’`), separadores numéricos e URLs/e-mails nunca quebram; pontuação final anexada (ADR-104). 56 casos tabelados (26 novos) + cobertura por categoria (≥ 2) e mínimo de 50 (59 testes no arquivo), ADR-106. `pnpm verify` verde; `pnpm eval --ci` exit 0 (baseline intocado).
- **Última atualização:** 2026-11-11 (SEG-T03).

## Tarefa atual — SEG-T04 (copiada de `phases/SEG-segmenter.md` em 2026-11-11)
- **SEG-T04 · Idioma misto e robustez:** Frases com trechos em grego/latim; texto vazio; só pontuação; textos muito longos sem pontuação (limite máximo de trecho configurável). **Aceite:** testes de propriedade simples (tokens cobrem o texto sem sobreposição, offsets monotônicos).
- **Por que agora:** E0–E10, SEG-T01, SEG-T02 e SEG-T03 concluídas; SEG é a última trilha do extrator antes do M2 do app (ROADMAP).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão concluída: SEG-T03 (palavras) — código + testes + ADR-106 prontos.** Feito: `words.ts` quebra em `—` e emite cada travessão como token (API inalterada); casos novos de hífen, apóstrofo, número, travessão colado e URL/email; meta de cobertura por categoria.
- **Próximo passo:** **SEG-T04** em branch nova `seg-t04-robustness` a partir da `main` (PR #109 do T03 já mesclado) — testes de propriedade (cobertura sem sobreposição, offsets monotônicos) + casos grego/latim, vazio, só pontuação e trecho longo sem pontuação (limite configurável).

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
| SEG | **em andamento** (T01/T02/T03 done 2026-11-11; T04/T05 abertas) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-11-11 · **SEG-T03 (palavras) — CONCLUÍDO** · `words.ts` quebra em `—` (U+2014) e emite cada travessão como token próprio mesmo colado (`ele—disse`); hífen composto, apóstrofo (reto e `’`), separadores numéricos e URLs/e-mails nunca quebram, pontuação final anexada (ADR-104); 26 casos novos → 56 tabelados + 3 meta (59 testes), cobertura ≥ 2 por categoria e mínimo de 50, ADR-106; `pnpm verify` verde, `eval --ci` exit 0. Próxima: SEG-T04.
- 2026-11-11 · **SEG-T02 (frases) — CONCLUÍDO** · `abbreviations/{pt,en}.ts` (30+32 entradas lowercase sem ponto) + `sentences.ts` (sem mudar a API): ponto isolado após abreviação conhecida nunca quebra; inicial maiúscula sozinha (`J. S. Mill`) não quebra antes de palavra maiúscula; `3.14`/`1.000,50`, `! ? …` e runs seguem a regra anterior; 68 casos tabelados (28 novos, cada categoria pt/en) + checagem de cobertura e de formato das listas (73 testes no arquivo), ADR-105; `pnpm verify` verde, `eval --ci` exit 0. Próxima: SEG-T03.
- Sessões anteriores: `archive/STATE-log-2026-11-11-corpus-vendored.md` (manutenção corpus vendored), `archive/STATE-log-2026-11-11-e10t04.md` (E10-T04 recortes), `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md`, `archive/STATE-log-2026-11-02-e9t04.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088; E9-T02 = ADR-095/096; E9-T04 = ADR-098; E10-T03 equações = ADR-102, PR #98; SEG-T01 API = ADR-104).

Histórico completo: docs/extractor/archive/
