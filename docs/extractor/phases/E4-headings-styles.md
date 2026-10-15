# E4 · Títulos, estilos e sumário

**Requisitos:** REQ-EXT-04, 05. **Depende de:** E3. **Saída:** metas `heading_f1`, `heading_level_acc`, `style_f1` em N1–N3; sumário gerado.

## Tarefas
### E4-T01 · Estilos inline (negrito, itálico, sup, sub) — **concluída 2026-10-13**
- A partir do resultado do spike S2: nome da fonte + flags; casos de sobrescrito por tamanho/posição; produzir `runs`.
- **Aceite:** `style_f1` ≥ meta em N1; `runs` adjacentes com o mesmo estilo são fundidos; testes de fronteiras (estilo no meio da palavra).
- **Feito (branch `e4-t01-inline-styles`, ADR-053):** `fontstyle.ts` (nome → bold/italic), `runs.ts` (runs por item + sup/sub por tamanho/posição + fusão de vizinhos iguais + item só-espaço neutro), `style_f1` no eval (F1 por caractere de negrito/itálico). `pnpm verify` verde (532 testes); `style_f1` = 1,0000 nos 7 documentos, nenhum outro regrediu.
### E4-T02 · Detecção de títulos e níveis — **concluída 2026-10-14**
- Clusters de tamanho/peso/espaçamento relativos ao corpo; centralização; linhas curtas isoladas; numeração (`1.2`, `Capítulo`); evitar legendas e epígrafes.
- **Aceite:** `heading_f1` e `heading_level_acc` ≥ meta; relatório de falsos positivos.
- **Feito (branch `e4-t02-detect-headings`, ADR-055):** `headings.ts` (porta + sinais de exibição, nível por cluster de tamanho com fallback na ordem de leitura), `buildBook` emite `kind: "heading"` com `level`, `headingDetection` + `blockHeadingDetection` no eval (coluna, seção de falsos positivos e `METRIC_DIRECTIONS`). `pnpm verify` verde (565 testes); `heading_f1`/`heading_level_acc` = 1,0000 em 6 dos 7 medidos e 0,0000 em `syn-n2-en-columns` (colunas = alvo da E6; nenhum falso positivo em nenhum documento); baseline atualizado, nenhum outro regrediu.
### E4-T03 · Sumário — **concluída 2026-10-14**
- Usar bookmarks do PDF quando existirem e conferir com títulos detectados; fallback: derivar dos títulos. Cada entrada aponta para `blockId`.
- **Aceite:** teste com PDF com e sem bookmarks; discrepâncias viram `warnings`.
- **Feito (branch `e4-t03-build-toc`, ADR-056):** `toc.ts` (`flattenOutline` pré-ordem + `buildToc(blocks, outline?)` — título/nível do bookmark quando ele casa com um título detectado, título da página ou primeiro bloco como *fallback*, entrada descartada quando não há destino; sem outline o toc é a lista dos títulos detectados) + integração em `buildBook` (nível do bookmark substitui o nível detectado nos casados) + `toc.test.ts` (18 casos) e `test/toc-pdf.test.ts` (PDF gerado por `minipdf` **com, sem e com bookmark discrepante**). Único warning `toc-outline-unmatched`; `toc-heading-unlisted` medido e removido (dispara em 7 dos 8 documentos com bookmarks — o outline é legitimamente um subconjunto dos títulos, ADR-056).
### E4-T04 · Metadados — **concluída 2026-10-15**
- Título, autores, idioma (`pt|en|mixed|unknown`) por detecção simples (léxico de stopwords) + metadados do PDF.
- **Aceite:** idioma correto em 100% dos documentos do corpus com idioma conhecido.
- **Feito (branch `e4-t04-detect-metadata`, ADR-057, schema 1.2.0):** `metadata.ts` (léxico pt/en dobrado sem acentos e disjunto, `detectLanguage` com dominância/`mixed`/hint `/Lang`+`por`/`eng`/`unknown`, `sanitizePdfTitle` e `splitPdfAuthors`), `RawDocument.source` ganhou `title?`/`author?`/`lang?` lidos do `getMetadata()` na ingestão, `buildBook` aplica `buildMetadata`, `minipdf` emite `/Info`+`/Lang`, `metadata.test.ts` (18 casos) e `test/metadata-pdf.test.ts` (3 PDFs). Sonda `probe-t04.ts`: **idioma correto em 24/24 documentos com `Book`** (os 2 escaneados são recusados pela ADR-018 e não têm `Book`); `n3-pt-scielo-wittgenstein` declara `/Lang en-US` e o léxico acerta `pt` — o texto decide sobre o hint.
### E4-T05 · Estilo vs texto original em títulos
- Títulos não herdam negrito do estilo de título como `bold` de run (evita duplicar a semântica); decidir e registrar ADR.
