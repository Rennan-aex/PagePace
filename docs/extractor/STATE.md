# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E7 CONCLUÍDA** (2026-10-21) — T01–T05 done (ADR-071/072/073/074/075/076/077). E6 CONCLUÍDA — T01 (PR #56); T02 (PR #57); T03, T04 (2026-10-19, ADR-070). E5 fechada (PRs #45–#54); E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37). Próxima fase: **E8** (`phases/` de E8 — descarta `font.data`).
- **Tarefa atual:** **BACKLOG linha 26 (fila 3A por último) — spike antes de heurística:** "Fonte quebrada troca letra comum em vez de virar glifo não-mapeado" — no n1-sofia "fi"→"à" e "fl"→"á" (Soàa/àm/ànal) já no bruto do pdf.js, sem flag, conf 0.90 (`brokenFontSignal` só pega U+FFFD/PUA/astral); no n4 símbolos matemáticos viram "?" literal ("F (d) ? F (R)"). Spike: medir como Calibre/pdf.js emitem esses chars e se dá para sinalizar sem quebrar os 13 digitais do corpus (cópia de 2026-10-26; depois: fase E8).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (989 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0; BACKLOG linhas 19/22/23 concluídas (rodapés com capítulo, colunas + strip de mobília + side-detection; ADR-082/083); fechamento desta branch (PR + squash): ver git.
- **Última atualização:** 2026-10-26 (linha 23 concluída — colunas, rodapé-com-folio e faixas laterais).

## Tarefa atual — BACKLOG fila 3A (P1): erros pequenos do wittgenstein
- **CONCLUÍDA** (branch `fix/backlog-3a-wittgenstein-small`, ADR-079): (a) glifo "`" (`stripOrnamentItems`), (b) hífen duplo (colapso p/ 1 hífen), (c) tipos witt (frente-mater → paragraph, "` 1" → heading). (d) dispensado — o espaço " Artigo" vinha do ornamento já removido em (a).
- **CONCLUÍDA** (branch `fix/backlog-3a-remaining-small`, ADR-081): byline do n2 → paragraph; afiliação numerada → paragraph; "acariciou-as" (clíticos `as`/`os`); capa do n4 → "500"/"2020"/"aqui" fora do TOC. **Side-detection do witt CONCLUÍDA** (2026-10-26, ADR-082): strip do rodapé-com-folio + segmentação da faixa em blocos; ver BACKLOG linha 22.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-26 — BACKLOG linha 23 — CONCLUÍDO** · branch `fix/backlog-3a-columns-furniture`. **(1) Colunas (ADR-083):** `columns.ts` em duas passagens — o baseline roda primeiro (qualquer página ≥2 colunas volta intocada) e só uma página lida como1 passa de novo com o corte das faixas de largura total, aceito só se as linhas visíveis carregam vão interno na calha (`COLUMNS_LINE_GAP_MIN_*`; alvo 0,53 vs ≤0,25 nos FPs). **(2) Strip (ADR-082):** `repeated.ts` — rodapé com folio vira candidato (borda de baixo, dígito na ponta, vão ≥1 leading) e sai pela sequência de fólio; `labelOf` escolhe o dígito mais próximo de `page+1`; witt `pageLabels`=1..11. **(3) Sidebars (ADR-082):** `sidebars.ts` — faixa cortada em blocos contíguos, cota de coluna por bloco; witt p1 reivindica painel ×6 + caixa ×10 como `sidebar` (caixa sai do RESUMO), climatejustice p1 também. A/B do corpus só com ganhos (rodapés: rebus −34, climatejustice −20, witt −11; lados: witt/climatejustice p1); testes novos 4 (journal-foot, guarda "See Table", clusters, corpus witt); **989 testes**; `pnpm eval --ci` exit 0; BACKLOG 19/22/23 marcados.
- **Sessão 2026-10-23 — fila 3A restante — CONCLUÍDO** · branch `fix/backlog-3a-remaining-small`. 4 fixes com teste vermelho antes (6 novos): `HYPHEN_CLITICS_PT` +`as`/`os`; `HEADING_BYLINE_MARK`; `QUOTE_AFFILIATION_LINE`; `HEADING_DIGITS_ONLY`+`HEADING_STAMP_WORD` (n4 TOC 327→320). **983 testes** (+7); `pnpm eval` idêntico. Docs: ADR-081, BACKLOG, STATE. *(handoffs de 2026-10-22: `archive/STATE-handoff-2026-10-22.md`; ver também Log de sessões.)*

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
- 2026-10-26 · **Linha 23 (colunas + mobília + side-detection) — CONCLUÍDO** · colunas2 em `astrofisica`/`phobos` p1 (ADR-083); rodapé-com-folio stripado em rebus/climatejustice/witt (ADR-082); witt p1 vira blocos `sidebar` fora do RESUMO; **989 testes** (+4), `pnpm eval --ci` exit 0; BACKLOG 19/22/23 marcados; próx.: spike da fonte quebrada (linha 26).
- 2026-10-23 · **Fila 3A restante — CONCLUÍDO** · clíticos `as`/`os` ("acariciou-as"), byline n2→paragraph, afiliação n2→paragraph, capa do n4 sem "500"/"2020"/"aqui" no TOC (327→320); witt adiado (rodapé com folio escapa do strip → faixa única); **ADR-081**; **983 testes** (+7); `pnpm eval` idêntico.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67).

Histórico completo: docs/extractor/archive/
