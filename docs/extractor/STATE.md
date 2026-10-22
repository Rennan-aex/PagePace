# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E7 CONCLUÍDA** (2026-10-21) — T01–T05 done (ADR-071/072/073/074/075/076/077). E6 CONCLUÍDA — T01 (PR #56); T02 (PR #57); T03, T04 (2026-10-19, ADR-070). E5 fechada (PRs #45–#54); E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37). Próxima fase: **E8** (`phases/` de E8 — descarta `font.data`).
- **Tarefa atual:** fila 3A (erros pequenos witt) concluída nesta sessão. Próxima sessão: restantes da fila 3A (casos n2/n4/sofia), ou primeira tarefa de **E8**.
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (966 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 (sem regressão — `text_cer` 0.0000 nos 12 medidos; **ADR-079**).
- **Última atualização:** 2026-10-22 (fila 3A witt: ornamento/hífen/tipos — ADR-079).

## Tarefa atual — BACKLOG fila 3A (P1): erros pequenos do wittgenstein
- **CONCLUÍDA** nesta sessão (branch `fix/backlog-3a-wittgenstein-small`, ADR-079): (a) glifo "`" (`stripOrnamentItems`), (b) hífen duplo (colapso p/ 1 hífen), (c) tipos witt (frente-mater → paragraph, "` 1" → heading). (d) dispensado — o espaço " Artigo" vinha do ornamento já removido em (a).
- **Restante da fila 3A (próxima sessão):** casos n2/n4/sofia (byline n2, subheads 2.1, capa n4, "Rom", "Goethe", "ABSTRACT", "líriosamarelos") — ver BACKLOG linha 22. Side-detection do witt (P2) continua pendente.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-22/2 — fila 3A (erros pequenos witt) — CONCLUÍDO** · branch `fix/backlog-3a-wittgenstein-small` (4 commits `fix:`). (a) `stripOrnamentItems` (accents.ts, chamado na ingestão pós-`composeAccentItems`): apaga texto de item de fonte-símbolo (Wingdings/Webdings/Symbol/Zapf/Marlett) que é espaço ou acento avulso — geometria intacta. (b) `hyphenSiteBetween`: sítio cuja próxima linha reabre com "-" → `keep`, colapsa p/ 1 hífen (hyphen.ts + espelho dropLeadingHyphen em runs.ts). (c) `detectQuotes`: rótulo (Keywords/E-mail/Abstract/…) nunca é citação; epígrafe de 1 linha exige atribuição ou pontuação; recuo sozinho só reclama bloco ≥2 linhas (e 1 linha sem forma de citação → paragraph). `detectHeadings`: face de display (bold/tamanho) dispensa o gate de recuo, salvo linha com marcador. (d) dispensado (0 blocos witt com espaço nas bordas após (a)). **Witt pág.1 agora:** heading "Artigo…", paragraph "Wittgenstein and skepticism"/"Daniel Temp ¯ºÖ"/afiliação/E-mail/Keywords, heading nível 2 "1 Considerações iniciais". "¯ºÖ"=ícone ORCID (Academicons, P2 side-detection). `pnpm verify` 966 verdes; `pnpm eval --ci` exit 0. Docs: ADR-079, BACKLOG, STATE. Próx.: restantes fila 3A ou E8.
- **Sessão 2026-10-22 — consertos da CLI + backlog da varredura — CONCLUÍDO** · branch `fix/cli-inspect-presentation`: `normalizeCliPath`, `--out` raiz recusado, faixa `páginas X-Y`, nota de OCR (**ADR-078**); BACKLOG com varredura (fila 3A); 950 testes; `pnpm eval --ci` exit 0.
- *(handoffs anteriores: ver Log de sessões e archive/)*

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
- 2026-10-22 · **Fila 3A (erros pequenos witt) — CONCLUÍDO** · ornamento "`" (`stripOrnamentItems`), hífen duplo (colapso 1 hífen), tipos witt (frente-mater→paragraph, "` 1"→heading); (d) dispensado; **ADR-079**; **966 testes** (+16); `pnpm eval --ci` exit 0.
- 2026-10-22 · **Consertos da CLI + backlog da varredura — CONCLUÍDO** · `normalizeCliPath`, `--out` raiz recusado, `páginas X-Y` no HTML/MD, nota de OCR no resumo (**ADR-078**); BACKLOG com os achados dos 5 relatórios inspect (fila 3A); **950 testes** (+6); `pnpm eval --ci` exit 0.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md` (E7-T02/T03; E7-T04 ver ADR-074/075).

Histórico completo: docs/extractor/archive/
