# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **SEG em andamento (2026-11-11)** — T01 (API + testes) e T02 (frases) prontas; T03–T05 abertas. E10/E9/E8/E7/E6/E5/E4/E3/E2/E1/E0 fechadas.
- **Próxima tarefa:** **SEG-T03 (palavras)** — hífens compostos, apóstrofos, números com separadores, travessão, URLs/emails como um token (texto completo copiado abaixo).
- **Ação pendente do PO:** nenhuma.
- **Status:** **SEG-T02 concluída em 2026-11-11** — `packages/segmenter/src/abbreviations/{pt,en}.ts` (listas lowercase sem ponto, 30 + 32 entradas) e `sentences.ts` sem mudar a API: ponto isolado depois de abreviação conhecida nunca quebra, inicial maiúscula sozinha não quebra antes de palavra maiúscula, `! ? …`/runs e decimais como antes. 73 testes no arquivo (68 casos tabelados, 28 novos; + cobertura por categoria e formato das listas), ADR-105. `pnpm verify` verde; `pnpm eval --ci` exit 0 (baseline intocado).
- **Última atualização:** 2026-11-11 (SEG-T02).

## Tarefa atual — SEG-T03 (copiada de `phases/SEG-segmenter.md` em 2026-11-11)
- **SEG-T03 · Palavras:** hifens compostos como uma palavra (`guarda-chuva`), apóstrofos (`don't`, `d'água`), números com separadores, travessão `—` como separador, URLs/emails como um token. **Aceite:** testes.
- **Por que agora:** E0–E10, SEG-T01 e SEG-T02 concluídas; SEG é a última trilha do extrator antes do M2 do app (ROADMAP).

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão concluída: SEG-T02 (frases) — código + testes + ADR-105 prontos.** Feito: listas `abbreviations/pt.ts` e `en.ts`; `sentences.ts` ganhou `abbreviationBefore`/`isInitialBefore` e só aplica a regra quando o terminador é um ponto isolado (runs de `...` e `! ?` seguem a regra anterior); decimais já cobertos por "sem espaço depois do ponto" e agora testados.
- **Próximo passo:** **SEG-T03** em branch nova `seg-t03-words` a partir da `main` — estender `words.ts` (hífen composto, apóstrofo, número com separador, travessão como separador, URL/email), mantendo `splitWords(text)`; não mexer na assinatura da API.

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
| SEG | **em andamento** (T01/T02 done 2026-11-11; T03–T05 abertas) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 31 documentos (16 públicos + 15 privados); 12 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 12 · `para_boundary_f1` **1,0000 nos 12** · `reading_order` **1,0000 nos 12** (E6-T02 leu as colunas na ordem; era 0,1429) · `header_footer_f1` 1,0000 nos 12 · `hyphen_join_acc` 1,0000 nos 12 (ADR-047) · `style_f1` 1,0000 nos 12 (E4-T01/T05) · `heading_f1` **1,0000 nos 12** · `heading_level_acc` **1,0000 nos 12** (E6-T04 corrigiu o spec do sintético de colunas, ADR-070) · `footnote_link_acc` 1,0000 nos 12 (E5-T02/E5-T03, ADR-060/061) · `block_kind_f1` **1,0000 nos 12** (E6-T04: medida por banda; era 0,5556 em `syn-n2-en-columns`) · `confidence_calibration` **1,0000 nos 12** (E7-T01, ADR-071; sem bloco errado nos sintéticos).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-11-11 · **SEG-T02 (frases) — CONCLUÍDO** · `abbreviations/{pt,en}.ts` (30+32 entradas lowercase sem ponto) + `sentences.ts` (sem mudar a API): ponto isolado após abreviação conhecida nunca quebra; inicial maiúscula sozinha (`J. S. Mill`) não quebra antes de palavra maiúscula; `3.14`/`1.000,50`, `! ? …` e runs seguem a regra anterior; 68 casos tabelados (28 novos, cada categoria pt/en) + checagem de cobertura e de formato das listas (73 testes no arquivo), ADR-105; `pnpm verify` verde, `eval --ci` exit 0. Próxima: SEG-T03.
- 2026-11-11 · **SEG-T01 (API do segmentador) — CONCLUÍDO** · `packages/segmenter/src/{types,sentences,words}.ts` + ADR-104: `splitSentences(text, { lang })` → spans aparados (`{start,end}`) e `splitWords(text)` → `{text,start,end}`, determinísticos e sem dependência de Node; 43 casos de frase + 32 de palavra (70 tabelados pt/en, escritos antes da implementação), invariantes de offset e determinismo; 75 testes no pacote, `pnpm verify` verde; eval sem mudança de baseline. Próxima: SEG-T02.
- Sessões anteriores: `archive/STATE-log-2026-11-11-corpus-vendored.md` (manutenção corpus vendored), `archive/STATE-log-2026-11-11-e10t04.md` (E10-T04 recortes), `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md`, `archive/STATE-log-2026-10-27-e8t03.md`, `archive/STATE-log-2026-10-28-e8t02.md`, `archive/STATE-log-2026-10-28-e8t03-fatia3.md`, `archive/STATE-log-2026-11-02-e9t04.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67; E8-T01 fatia 1 = ADR-088; E9-T02 = ADR-095/096; E9-T04 = ADR-098; E10-T03 equações = ADR-102, PR #98).

Histórico completo: docs/extractor/archive/
