# STATE: extrator

> Arquivo de passagem de bastão. **Leia primeiro, atualize em checkpoints.** Orçamento: ≤ 8 KB / ≤ 90 linhas (`pnpm check:docs`). Excedente vai para `docs/extractor/archive/`.

## Situação
- **Fase atual:** E4 (Títulos/estilos/sumário) — T01…T04 `done` (PRs #38, #40, #42 e o da E4-T04); T05 `todo`. E3 fechada (PRs #29–#34); consertos P1 na `main` (PR #37).
- **Tarefa atual:** **E4-T05 — Estilo vs texto original em títulos** (cópia abaixo, 2026-10-15). A E4-T04 (metadados) está concluída no **PR #43**.
- **Ação pendente do PO:** nenhuma de git — desde 2026-10-14 (**ADR-054**) o agente abre PR, confere os checks e mescla sozinho com o `gh` instalado na máquina.
- **Status:** `pnpm verify` verde (616 testes + `check:no-pdf` + `check:docs`); `pnpm eval --ci` exit 0 sem regressão (nenhuma métrica mudou — idioma/título/autores não são métricas; baseline intocada).
- **Última atualização:** 2026-10-15 (E4-T04 concluída).

## Tarefa atual — E4-T05 · Estilo vs texto original em títulos (cópia de `phases/E4-headings-styles.md`, 2026-10-15)
- Títulos não herdam negrito do estilo de título como `bold` de run (evita duplicar a semântica); decidir e registrar ADR.

## Handoff (atualizar a cada checkpoint; ≤ 15 linhas)
- **E4-T04 — Metadados — CONCLUÍDA** (2026-10-15, **PR #43**, branch `e4-t04-detect-metadata`): `metadata.ts` (léxico stopwords pt/en dobrado sem acentos e **disjunto**: 126/152; `detectLanguage` — texto decide com dominância, ambos fortes e próximos = `mixed`, amostra fraca cai no hint `/Lang` do PDF, aceitando subtag primária + `por`/`eng`, senão `unknown`; `sanitizePdfTitle` descarta URL/nome-de-arquivo/vazio; `splitPdfAuthors` por `;`) + schema **1.2.0** (`RawDocument.source.title/author/lang`, ADR-057) + `minipdf` com `/Info`+`/Lang`; `metadata.test.ts` (18) e `test/metadata-pdf.test.ts` (3).
- **Aceite medido:** sonda `.pagepace-cache/tmp/probe-t04.ts` — **idioma correto em 24/24 documentos com `Book`**; os 2 escaneados (`n5-*`) são recusados pela ADR-018 e não têm `Book`. Prova de robustez: `n3-pt-scielo-wittgenstein` declara `/Lang en-US` e sai `pt`.
- **Próxima tarefa: E4-T05 — Estilo vs texto original em títulos** (cópia acima). Comece pela skill `start-session`.
- **Para mexer no idioma depois:** constantes `LANGUAGE_*` e os sets `LANGUAGE_STOPWORDS_PT/EN` em `metadata.ts`; calibre com a sonda `probe-t04.ts` (compara com o campo `lang` dos manifests). `Book.metadata` é preenchido por `buildMetadata(blocks, document.source)` no fim do `buildBook`.
- **Cuidado com o schema:** `schemaVersionSchema` é `z.literal(SCHEMA_VERSION)` — bump exige atualizar fixtures/testes que citam a versão (feito: 1.1.0 → 1.2.0 em 8 arquivos). Tag `schema-v1.2.0` criar após o merge.
- Contexto herdado (E4-T03, PR #42): `buildToc(blocks, outline?)` (ADR-056); níveis de título por cluster de fonte (ADR-055); limitações anotadas no `headings.ts` e no `EVALUATION.md` (coluna única = E6).
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
| E4 | in progress (T01 PR #38, T02 PR #40, T03 PR #42, T04 PR #43; T05 todo) |
| E5…E10, SEG | todo (E8 descarta `font.data`; E9 = OCR da ADR-018; E10 = recortes da ADR-016) |

## Métricas atuais (baseline: `packages/eval/baseline.json`, format v1, tolerance 0,002)
- `pnpm eval`: 26 documentos (11 públicos + 15 privados); 7 com gabarito (sintéticos `syn-*`); nenhum PDF real com gabarito ainda.
- `text_cer` 0,0000 nos 7 · `para_boundary_f1` 1,0000 em 6 e 0,0000 em `syn-n2-en-columns` · `reading_order` 1,0000 nos 6 de coluna única e 0,1429 em `syn-n2-en-columns` (duas colunas = alvo da E6) · `header_footer_f1` 1,0000 nos 7 · `hyphen_join_acc` 1,0000 nos 7 (ADR-047) · `style_f1` 1,0000 nos 7 (E4-T01) · `heading_f1`/`heading_level_acc` 1,0000 em 6 dos 7 e 0,0000 em `syn-n2-en-columns` (E4-T02; nenhum falso positivo).
- Gate: `pnpm eval --ci` falha (exit 1) se piorar mais que 0,002 por documento; `--update-baseline` regrava; `--diff` compara.

## Log de sessões (mais recente em cima; só as 2 últimas; anteriores: archive/)
- 2026-10-15 · **E4-T04 (metadados) — CONCLUÍDO** · **PR #43** (branch `e4-t04-detect-metadata`) · `metadata.ts` (stopwords pt/en disjuntas + `detectLanguage` com hint `/Lang` + saneação de título/autores) + schema **1.2.0** (`source.title/author/lang`, **ADR-057**) + `minipdf` com `/Info`+`/Lang` + 22 testes novos; **616 testes**; `pnpm eval --ci` exit 0; sonda `probe-t04.ts`: **24/24 idiomas corretos** (2 escaneados sem `Book`, ADR-018).
- 2026-10-14 · **E4-T03 (sumário) — CONCLUÍDO** · **PR #42** (branch `e4-t03-build-toc`) · `toc.ts` (`flattenOutline` pré-ordem + `buildToc(blocks, outline?)`: bookmarks do PDF conferidos contra os títulos detectados, 4 passos de resolução, nível do bookmark substitui o detectado — **ADR-056**) + integração em `buildBook` + `toc.test.ts` (18) e `test/toc-pdf.test.ts` (3, PDF por `minipdf`); **586 testes**; `pnpm eval --ci` exit 0 sem regressão; `toc-heading-unlisted` medido e removido (disparava em 7 dos 8 documentos com bookmarks).
- Sessões anteriores: `docs/extractor/archive/STATE-full-2026-10-10.md`, `archive/STATE-log-2026-10-12.md` e `archive/STATE-log-2026-10-14.md` (seções "Handoff" e "Log de sessões").

Histórico completo: docs/extractor/archive/
