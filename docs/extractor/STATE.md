# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E7 CONCLUÍDA** (2026-10-21) — T01–T05 done (ADR-071/072/073/074/075/076/077). E6 CONCLUÍDA — T01 (PR #56); T02 (PR #57); T03, T04 (2026-10-19, ADR-070). E5 fechada (PRs #45–#54); E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37). Próxima fase: **E8** (`phases/` de E8 — descarta `font.data`).
- **Tarefa atual:** **Heurística da BACKLOG linha 26 CONCLUÍDA (2026-10-26, ADR-085)** — o sinal medido pelo spike S6 virou código: predicado `brokenFontText` (`packages/extractor/src/brokenfont.ts`) que une o FFFD/PUA (E3-T05) a 3+ "à" interno por bloco (sem share), reaproveitando flag/warning/confidence de E3-T05; A/B no corpus: sofia 0→49 blocos marcados, 0 falsos positivos em 16 digitais + 12 sintéticos. Depois: fase E8 (`phases/` de E8 — descarta `font.data`).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (993 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (baseline intacto — nenhum sintético tem "à" interno); BACKLOG linhas 19/22/23/26 concluídas (ADR-082/083/084/085); fechamento desta branch (PR + squash): ver git.
- **Última atualização:** 2026-10-26 (heurística de "à" interno — BACKLOG linha 26, ADR-085).

## Tarefa atual — BACKLOG fila 3A (P1): erros pequenos do wittgenstein
- **CONCLUÍDA** (branch `fix/backlog-3a-wittgenstein-small`, ADR-079): (a) glifo "`" (`stripOrnamentItems`), (b) hífen duplo (colapso p/ 1 hífen), (c) tipos witt (frente-mater → paragraph, "` 1" → heading). (d) dispensado — o espaço " Artigo" vinha do ornamento já removido em (a).
- **CONCLUÍDA** (branch `fix/backlog-3a-remaining-small`, ADR-081): byline do n2 → paragraph; afiliação numerada → paragraph; "acariciou-as" (clíticos `as`/`os`); capa do n4 → "500"/"2020"/"aqui" fora do TOC. **Side-detection do witt CONCLUÍDA** (2026-10-26, ADR-082): strip do rodapé-com-folio + segmentação da faixa em blocos; ver BACKLOG linha 22.
- **CONCLUÍDA** (2026-10-26, ADR-085, branch `fix/backlog-26-broken-font-accents`): o spike da linha 26 virou heurística — `brokenFontText` sinaliza blocos com 3+ "à" interno (mesma flag/warning/confidence do broken-font-mapping); A/B: sofia 0→49, resto do corpus intacto.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-26 — heurística BACKLOG 26 ("à" interno) — CONCLUÍDA** · branch `fix/backlog-26-broken-font-accents`, **ADR-085**. **(1) Código:** `brokenfont.ts` ganhou `internalAccentSwaps` (conta `\p{L}à\p{L}`, piso `BROKEN_FONT_MIN_INTERNAL_ACCENTS = 3`, sem share) e o predicado `brokenFontText` (FFFD/PUA **ou** piso de "à"); `book.ts`/`explain.ts` passam a perguntar `brokenFontText`; flag/warning/confidence são os mesmos de E3-T05 (sem mudança de esquema). **(2) Testes:** vermelho antes (11 falhas), verde depois — 6+4 its em `brokenfont.test.ts`, 2 em `book.test.ts` (bloco marcado + bloco abaixo do piso). **(3) A/B corpus (`spikes/s6-ab-impl.ts`):** sofia `flagged=49` (antes 0; 44 por parágrafo medidos no spike, diferença do join), n4 mantém os 2 PUA antigos, **0 FP** nos outros 16 digitais; `pnpm eval --ci` exit 0 (baseline intacto). **Próx.:** fase E8 (descartar `font.data`).

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
- 2026-10-26 · **Heurística fonte quebrada (BACKLOG 26) — CONCLUÍDO** · `brokenFontText` = FFFD/PUA ou 3+ "à" interno (sem share), mesma flag/warning/confidence de E3-T05; **ADR-085**; A/B: sofia 0→49 blocos, 0 FP em 16 digitais + 12 sintéticos; **1001 testes** (+12), `pnpm eval --ci` exit 0; BACKLOG 26 marcada.
- 2026-10-26 · **Spike fonte quebrada (BACKLOG 26) — CONCLUÍDO** · causa medida no PDF do sofia (ToUnicode do Calibre trocado + fallback de codificação do pdf.js); n4 "?" = má-diagnóstico (perguntas legítimas); sinal "à" interno medido: 44 blocos no sofia, **0 FP** em 17 digitais + 12 sintéticos; **ADR-084**, `spikes/S6-broken-font.md`, 8 probes; `pnpm verify` verde; sem heurística nova (resultado vira planejamento na BACKLOG 26).
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67).

Histórico completo: docs/extractor/archive/
