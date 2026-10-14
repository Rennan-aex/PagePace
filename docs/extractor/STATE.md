# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** E4 (Títulos/estilos/sumário) — T01 e T02 `done` (PRs #38 e #40); T03 concluída no **PR #42** (branch `e4-t03-build-toc`); T04…T05 `todo`. E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E4-T04 — Metadados** (cópia abaixo, 2026-10-14). A E4-T03 (sumário) está concluída no **PR #42**.
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh` instalado na máquina.
- **Status:** `pnpm verify` verde (586 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 sem regressão (o sumário não é métrica; baseline intocada: `heading_f1`/`heading_level_acc` 1,0000 em 6 dos 7 medidos, 0,0000 só em `syn-n2-en-columns` = alvo da E6).
- **Última atualização:** 2026-10-14 (E4-T03 concluída — PR #42).

## Tarefa atual — E4-T04 · Metadados (cópia de `phases/E4-headings-styles.md`, 2026-10-14)
- Título, autores, idioma (`pt|en|mixed|unknown`) por detecção simples (léxico de stopwords) + metadados do PDF.
- **Aceite:** idioma correto em 100% dos documentos do corpus com idioma conhecido.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **E4-T03 — Sumário — CONCLUÍDA** (2026-10-14, PR #42, branch `e4-t03-build-toc`): `toc.ts` + `toc.test.ts` (18 casos) + `test/toc-pdf.test.ts` (3 PDFs por `minipdf`); `pnpm verify` 586 testes; `pnpm eval --ci` exit 0.
- **Próxima tarefa: E4-T04 — Metadados** (cópia acima). Comece pela skill `start-session`.
- **O que ficou:** `buildToc(blocks, outline?)` — outline não vazio vira o toc (walk pré-ordem; título e nível do bookmark, nível substitui o detectado nos casados); bloco resolvido por título que responde na página, depois por título depois do último casamento, depois pelo primeiro título da página, depois pelo primeiro bloco; sem outline o toc é a lista dos títulos detectados. `buildBook` aplica os níveis e empurra o warning `toc-outline-unmatched` (código do extrator, contrato intacto — ADR-049 d1).
- **O que decidiu o design (sonda `.pagepace-cache/tmp/probe-t03.ts`):** 8 dos 26 documentos têm bookmarks, 139 entradas — 73 casam com um título detectado, 13 caem em página com título diferente, 51 em página sem título detectado (limite da E4-T02/E6), 2 descartadas. `toc-heading-unlisted` disparava em 7 dos 8 (1.151 títulos contra 139 bookmarks) e foi **removido** (ADR-056).
- **Para mexer no sumário depois:** aceite em `test/toc-pdf.test.ts` (`minipdf` com/sem/bookmark discrepante), casos de comportamento em `src/toc.test.ts`, matching em `tocTitleKey`/`titlesAnswer`.
- Contexto herdado (E4-T02, PR #40): níveis por cluster de fonte com fallback na ordem de leitura (**ADR-055**); limitações anotadas no `headings.ts` e no `EVALUATION.md` (medida de coluna única = E6).
- `raw.outline` (`RawOutlineItem {title, pageIndex, children}`) vem da ingestão (E1-T01, `ingest/pdfjs.ts` → `buildOutline`).

## Bloqueios / ações do humano (PO) (só abertos; passo a passo na mensagem do report-to-po)
- [x] Checklist manual da fase E2 (`phases/E2-lines-paragraphs.md`) — **feito (2026-10-11):** parágrafos corretos em `n1-pt-sofia` e `n1-en-curinga`; defeito à parte registrado no **BACKLOG 2026-10-11** (quebra no meio da palavra em `n1-en-curinga`, 1.303 ocorrências, P1).
- [x] Checklist manual da fase E3 (`phases/E3-cleanup.md`) — **feito (2026-10-11):** repetições e hifenização aprovadas; conferência visual da p. 41 de `n1-en-sofia` sem conteúdo perdido (trecho em bloco que cruza página, `p39-b7`); **`n1-pt-curinga` reprovou** com 297 números de página (BACKLOG 2026-10-11, P1).
- [x] Abrir o PR da branch `docs-dieta-contexto` e dar Squash and merge — **feito (PRs #35 e #36 na `main`)**.
- [x] Escolher a próxima sessão: **consertos P1** — **feito (2026-10-12): os 2 defeitos P1 foram corrigidos** (ADR-052); falta só o merge do PR `fix-p1-inline-eol-folio`.
- [x] Abrir o PR da branch `fix-p1-inline-eol-folio` e dar Squash and merge — **feito (PR #37 na `main`, 2026-10-13)**.
- [x] Abrir o PR da branch `e4-t01-inline-styles` e dar Squash and merge — **feito (PR #38 na `main`, 2026-10-14)**.
- [x] Abrir o PR da branch `e4-t02-detect-headings` e dar Squash and merge — **feito (PR #40 na `main`, 2026-10-14)**.
- [x] Confirmar os títulos reais dos 15 PDFs privados — **feito (2026-10-11)**: gravados em `$CORPUS_PRIVATE_DIR/manifest.yaml` (campo `title`, fora do git); `pnpm corpus:fetch` valida `15 private entries merged`; ids não mudam.
- [ ] Não apagar a entrega (Release) `corpus-public-v1`: o `corpus/manifest.yaml` aponta para ela (apagar = CI vermelho com 404).

## Progresso por marco
| Marco | Status |
|---|---|
| E0 | done (2026-10-05, PR #11) |
| E1 | done (2026-10-07, PR #22) |
| E2 | done (2026-10-08, PR #28; checklist manual concluído 2026-10-11) |
| E3 | done (2026-10-11, PRs #29–#34; checklist manual concluído 2026-10-11) |
| E4 | in progress (T01 PR #38, T02 PR #40, T03 PR #42; T04…T05 todo) |
| E5…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 26 documentos (11 públicos + 15 privados); 7 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 7 · `para_boundary_f1` 1,0000 em 6 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 6 de coluna única e 0,1429 em `syn-n2-en-columns` (duas colunas = alvo da E6) · `header_footer_f1` 1,0000 nos 7 · `hyphen_join_acc` 1,0000 nos 7 (ADR-047) · `style_f1` 1,0000 nos 7 (E4-T01) · `heading_f1`/`heading_level_acc` 1,0000 em 6 dos 7 e 0,0000 em `syn-n2-en-columns` (E4-T02; nenhum falso positivo).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-14 · **E4-T03 (sumário) — CONCLUÍDO** · **PR #42** (branch `e4-t03-build-toc`) · `toc.ts` (`flattenOutline` pré-ordem + `buildToc(blocks, outline?)`: bookmarks do PDF conferidos contra os títulos detectados, 4 passos de resolução, nível do bookmark substitui o detectado — **ADR-056**) + integração em `buildBook` + `toc.test.ts` (18) e `test/toc-pdf.test.ts` (3, PDF por `minipdf`); **586 testes**; `pnpm eval --ci` exit 0 sem regressão; `toc-heading-unlisted` medido e removido (disparava em 7 dos 8 documentos com bookmarks).
- 2026-10-14 · **E4-T02 (títulos e níveis) — CONCLUÍDO** · **PR #40 na `main`** (branch `e4-t02-detect-headings`) · `headings.ts` (porta + 5 sinais de exibição; nível por cluster de tamanhos de fonte, fallback na ordem de leitura — **ADR-055**) + `buildBook` emite `kind: "heading"`/`level` + `headingDetection`/`blockHeadingDetection` no eval (coluna `heading_f1` + seção de falsos positivos); **565 testes**; aceite N1 ≥ 0,95 nos 4 documentos; `heading_f1` = 1,0000 em 6 dos 7 e 0,0000 só em `syn-n2-en-columns` (alvo da E6), nenhum falso positivo; baseline só com as 2 chaves novas (regra de ouro).
- Sessões anteriores: `docs/extractor/archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md` e `archive/STATE-log-2026-10-14.md` (seções "Handoff" e "Log de sessões").

Histórico completo: docs/extractor/archive/
