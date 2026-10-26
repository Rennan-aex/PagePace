# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E7 CONCLUÍDA** (2026-10-21) — T01–T05 done (ADR-071/072/073/074/075/076/077). E6 CONCLUÍDA — T01 (PR #56); T02 (PR #57); T03, T04 (2026-10-19, ADR-070). E5 fechada (PRs #45–#54); E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37). Próxima fase: **E8** (`phases/` de E8 — descarta `font.data`).
- **Tarefa atual:** **SPIKE da BACKLOG linha 26 CONCLUÍDO (2026-10-26)** — fonte quebrada em letras comuns: causa medida no n1-pt-sofia (ToUnicode do Calibre incompleto/trocado + fallback de codificação do pdf.js; render correto, texto errado na origem) e o caso "?" do n4 descartado como má-diagnóstico (30 "?" = perguntas legítimas; "F (d) ? F (R)" não existe em PDFs nem relatórios). Sinal medido para virar tarefa: "à" interno por bloco, piso ≥ 3 **sem** share (44 blocos no sofia, 0 FP em 17 digitais + 12 sintéticos; o `brokenFontSignal` atual pega 0). Docs: ADR-084 + `spikes/S6-broken-font.md` (8 probes commitados). Depois: fase E8.
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (989 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0; BACKLOG linhas 19/22/23 concluídas (colunas, rodapé-com-folio, faixas laterais; ADR-082/083); **linha 26: spike S6 concluído** (sem código de heurística, ADR-084); fechamento desta branch (PR + squash): ver git.
- **Última atualização:** 2026-10-26 (spike da fonte quebrada concluído — BACKLOG linha 26).

## Tarefa atual — BACKLOG fila 3A (P1): erros pequenos do wittgenstein
- **CONCLUÍDA** (branch `fix/backlog-3a-wittgenstein-small`, ADR-079): (a) glifo "`" (`stripOrnamentItems`), (b) hífen duplo (colapso p/ 1 hífen), (c) tipos witt (frente-mater → paragraph, "` 1" → heading). (d) dispensado — o espaço " Artigo" vinha do ornamento já removido em (a).
- **CONCLUÍDA** (branch `fix/backlog-3a-remaining-small`, ADR-081): byline do n2 → paragraph; afiliação numerada → paragraph; "acariciou-as" (clíticos `as`/`os`); capa do n4 → "500"/"2020"/"aqui" fora do TOC. **Side-detection do witt CONCLUÍDA** (2026-10-26, ADR-082): strip do rodapé-com-folio + segmentação da faixa em blocos; ver BACKLOG linha 22.
- **SPIKE CONCLUÍDO** (2026-10-26, branch `spike/broken-font-common-letters`, ADR-084): fonte quebrada (BACKLOG linha 26) medida de ponta a ponta — heurística nova **não** foi criada; o sinal com parâmetros medidos fica planejado na BACKLOG + `spikes/S6-broken-font.md`.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-26 — spike BACKLOG linha 26 (fonte quebrada) — CONCLUÍDO** · branch `spike/broken-font-common-letters`, **sem heurística nova** (só medição). **(1) Mecanismo (n1-pt-sofia):** render p4 mostra a ligadura fi/fl **certa**; o ToUnicode gravado pelo Calibre 1.26.0 está incompleto/trocado (U+00C6→"à", U+0020→"?", só 24/128 códigos em 0x80–0xFF) e os códigos sem entrada (0xE0/0xE1) caem na codificação padrão do pdf.js → "à"/"á" — o erro está no PDF e é irrecuperável por extração. **(2) n4 descartado:** os 30 "?" avulsos são perguntas legítimas (renders p22/p66/p190, formato "…? Solução:") e a citação "F (d) ? F (R)" não existe em nenhum PDF nem nos 5 relatórios inspect → sinal por "?" quebraria ~30 blocos. **(3) Sinal medido:** "à" interno (letra+à+letra) por bloco — sofia: 925 chars, 686 blocos ≥1, **44 blocos ≥3**; curinga: 1 digitação (morre no piso ≥3); outros 15 digitais + 12 sintéticos: **0**; share 5% da regra atual nunca dispara aqui (não reutilizar); `brokenFontSignal` atual pega 0 no sofia. **Docs:** ADR-084, `spikes/S6-broken-font.md`, BACKLOG 26 reescrita, 8 probes commitados em `packages/extractor/spikes/`. **Próx.:** virar tarefa com skill `add-heuristic` (P2, parâmetros acima) ou seguir para a E8 — ordem é do PO/roadmap.

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
- 2026-10-26 · **Spike fonte quebrada (BACKLOG 26) — CONCLUÍDO** · causa medida no PDF do sofia (ToUnicode do Calibre trocado + fallback de codificação do pdf.js); n4 "?" = má-diagnóstico (perguntas legítimas); sinal "à" interno medido: 44 blocos no sofia, **0 FP** em 17 digitais + 12 sintéticos; **ADR-084**, `spikes/S6-broken-font.md`, 8 probes; `pnpm verify` verde; sem heurística nova (resultado vira planejamento na BACKLOG 26).
- 2026-10-26 · **Linha 23 (colunas + mobília + side-detection) — CONCLUÍDO** · colunas2 em `astrofisica`/`phobos` p1 (ADR-083); rodapé-com-folio stripado em rebus/climatejustice/witt (ADR-082); witt p1 vira blocos `sidebar` fora do RESUMO; **989 testes** (+4), `pnpm eval --ci` exit 0; BACKLOG 19/22/23 marcados.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md`, `archive/STATE-handoff-2026-10-22.md` (E7-T02/T03; E7-T04 ver ADR-074/075; fila 3A sofia/n2/n4 = PR #67).

Histórico completo: docs/extractor/archive/
