# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** **E7 CONCLUÍDA** (2026-10-21) — T01–T05 done (ADR-071/072/073/074/075/076/077). E6 CONCLUÍDA — T01 (PR #56); T02 (PR #57); T03, T04 (2026-10-19, ADR-070). E5 fechada (PRs #45–#54); E4 fechada (PRs #38–#44); E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37). Próxima fase: **E8** (`phases/` de E8 — descarta `font.data`).
- **Tarefa atual:** fila 3A (restante) CONCLUÍDA (2026-10-23, ADR-081, 4 dos 5 itens): clíticos "as"/"os", byline n2→paragraph, afiliação n2→paragraph, capa do n4 sem "500"/"2020"/"aqui" no TOC. Adiada: side-detection do witt (depende do strip de mobília, BACKLOG linha 23). Próxima: E8 ou a fila "depois dos pequenos" (BACKLOG linhas 23–26).
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh`.
- **Status:** `pnpm verify` verde (983 testes + `check:no-pdf` + `check:docs`); `pnpm eval` idêntico antes/depois (nenhuma métrica medida mudou; **ADR-081**).
- **Última atualização:** 2026-10-23 (fila 3A restante — ADR-081).

## Tarefa atual — BACKLOG fila 3A (P1): erros pequenos do wittgenstein
- **CONCLUÍDA** (branch `fix/backlog-3a-wittgenstein-small`, ADR-079): (a) glifo "`" (`stripOrnamentItems`), (b) hífen duplo (colapso p/ 1 hífen), (c) tipos witt (frente-mater → paragraph, "` 1" → heading). (d) dispensado — o espaço " Artigo" vinha do ornamento já removido em (a).
- **CONCLUÍDA** (branch `fix/backlog-3a-remaining-small`, ADR-081): byline do n2 → paragraph; afiliação numerada → paragraph; "acariciou-as" (clíticos `as`/`os`); capa do n4 → "500"/"2020"/"aqui" fora do TOC. **Adiada:** side-detection do witt (P2) — causa raiz medida, exige o strip de mobília (BACKLOG linha 23) + segmentação de faixas; ver ADR-081 e BACKLOG linha 22.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **Sessão 2026-10-23 — fila 3A restante — CONCLUÍDO** · branch `fix/backlog-3a-remaining-small`. 4 fixes com teste vermelho antes (6 novos): `HYPHEN_CLITICS_PT` +`as`/`os` (sofia "acariciou-as"); `HEADING_BYLINE_MARK` ≥2 marcas+≥3 vírgulas (n2 byline→paragraph); `QUOTE_AFFILIATION_LINE` todas as linhas (n2 afiliação→paragraph); `HEADING_DIGITS_ONLY`+`HEADING_STAMP_WORD` (n4 TOC 327→320). Limites: "txto" fica (item único do produtor); witt adiado (rodapé com folio escapa do strip → faixa única → gates de sidebar não rodam). **983 testes** (+7); `pnpm eval` idêntico (baseline intacta). Docs: ADR-081, BACKLOG, STATE. **Próx.: E8 ou BACKLOG linhas 23–26.**
- **Sessão 2026-10-22/4 — fila 3A sofia/n2/n4 — CONCLUÍDO** · PR #67 mesclado em `main` (squash, branch remota e local removidas). Mudanças: `LIST_MARKER` sem `–—`; `QUOTE_DIALOGUE_DASH`/`followsLabel` em quotes.ts; `HEADING_SECTION_TITLE` (exceção itálico p/ `2.1.` etc.); `HEADING_SIZE_CLUSTER_FACTOR` 0,05→0,06 (capa n4 1/2/2/3); lexicon pt +17 compostos ("lírios-amarelos"). 9 testes vermelhos antes (stash check), 976 verdes depois; `pnpm eval --ci` exit 0. Docs: ADR-080, BACKLOG, STATE.
- **Sessão 2026-10-22/2 — fila 3A (erros pequenos witt) — CONCLUÍDO** · branch `fix/backlog-3a-wittgenstein-small` (4 commits `fix:`). (a) `stripOrnamentItems` (accents.ts, chamado na ingestão pós-`composeAccentItems`): apaga texto de item de fonte-símbolo (Wingdings/Webdings/Symbol/Zapf/Marlett) que é espaço ou acento avulso — geometria intacta. (b) `hyphenSiteBetween`: sítio cuja próxima linha reabre com "-" → `keep`, colapsa p/ 1 hífen (hyphen.ts + espelho dropLeadingHyphen em runs.ts). (c) `detectQuotes`: rótulo (Keywords/E-mail/Abstract/…) nunca é citação; epígrafe de 1 linha exige atribuição ou pontuação; recuo sozinho só reclama bloco ≥2 linhas (e 1 linha sem forma de citação → paragraph). `detectHeadings`: face de display (bold/tamanho) dispensa o gate de recuo, salvo linha com marcador. (d) dispensado (0 blocos witt com espaço nas bordas após (a)). `pnpm verify` 966 verdes; `pnpm eval --ci` exit 0. Docs: ADR-079, BACKLOG, STATE. Próx.: restantes fila 3A ou E8.
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
- 2026-10-23 · **Fila 3A restante — CONCLUÍDO** · clíticos `as`/`os` ("acariciou-as"), byline n2→paragraph, afiliação n2→paragraph, capa do n4 sem "500"/"2020"/"aqui" no TOC (327→320); witt adiado (rodapé com folio escapa do strip → faixa única); **ADR-081**; **983 testes** (+7); `pnpm eval` idêntico.
- 2026-10-22 · **Fila 3A sofia/n2/n4 — CONCLUÍDO (PR #67)** · "— Rom…"→paragraph (LIST_MARKER sem `–—` + guarda de diálogo em quotes), "ABSTRACT"/resumo→paragraph (`followsLabel`), subheads 2.1→heading nível 2 (`HEADING_SECTION_TITLE`), capa n4 níveis 1/2/2/3 (cluster 0,06), "lírios-amarelos" no lexicon (+17); **ADR-080**; **976 testes** (+10); `pnpm eval --ci` exit 0.
- Sessões anteriores: `archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md`, `archive/STATE-log-2026-10-14.md`, `archive/STATE-log-2026-10-17.md`, `archive/STATE-log-2026-10-19.md`, `archive/STATE-log-2026-10-20.md` (E7-T02/T03; E7-T04 ver ADR-074/075).

Histórico completo: docs/extractor/archive/
