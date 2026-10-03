# Arquitetura do extrator

## Visão geral
```
 PDF ──► [1 Ingestão] ──► RawDocument ──► [2 Normalização] ──► [3 Layout] ──► [4 Semântica]
 (PDF.js)   (adaptador)   (itens posicionados)                                     │
 OCR (futuro) ──┘                                                                   ▼
                                  [7 Saída] ◄── [6 Junção entre páginas] ◄── [5 Estilos inline]
                                      │
                                      ▼
                         Book (modelo intermediário, versionado)  ──►  app / CLI / eval
```
Cada camada é uma função pura `entrada → saída` com tipos explícitos, testável isoladamente com fixtures pequenas. Uma IA pode trabalhar em uma camada sem conhecer as outras.

## Camadas e contratos
| # | Camada | Entrada | Saída | Faz |
|---|---|---|---|---|
| 1 | Ingestão | PDF (bytes) | `RawDocument` | Lê com PDF.js: itens de texto com fonte, tamanho, matriz de posição, flags da fonte; outlines; struct tree (PDF tagged); metadados. |
| 2 | Normalização | `RawDocument` | `RawDocument` normalizado | Unicode (NFC), ligaduras (ﬁ, ﬂ), soft hyphen, espaços inferidos por lacuna de posição, mapeamentos de fonte quebrados (detecta e marca). |
| 3 | Layout | itens por página | `LayoutPage` (linhas, colunas, regiões, ordem) | Agrupa em linhas (baseline), detecta colunas, ordem de leitura, regiões repetidas (cabeçalho/rodapé). |
| 4 | Semântica | `LayoutPage[]` | blocos tipados | Título, parágrafo, citação, lista, nota de rodapé, legenda, referência, figura/tabela/equação (placeholder). |
| 5 | Estilos inline | blocos com itens | blocos com `runs` | Negrito/itálico/sup/sub a partir de nome e flags da fonte (+ heurística visual quando simulado). |
| 6 | Junção | blocos por página | blocos do livro | Une parágrafos e palavras hifenizadas que cruzam páginas; liga notas às chamadas. |
| 7 | Saída | blocos | `Book` | Atribui IDs estáveis, origem, confiança, sumário, metadados. Valida contra o esquema. |

Se existir **struct tree** (PDF tagged), ele entra como sinal forte nas camadas 3–4, nunca como verdade absoluta (muitos são ruins).

## Pacotes (monorepo)
- `schema`: tipos + validação do `RawDocument`, `Book`, `Overlay`. Sem dependências.
- `extractor`: camadas 1–7. Núcleo portável; leitura de arquivo só em adaptadores/CLI.
- `segmenter`: frases e palavras pt/en. Puro.
- `eval`: runner do corpus, métricas, comparação com baseline.
- `cli`: `pagepace extract|inspect|eval|explain-page`.

## Decisões estruturais
1. **PDF.js como base de ingestão** (Apache-2.0, roda em navegador/Node/WebView). Entrega itens de texto com fonte, tamanho e transformação. Confirmação via spike E0. MuPDF/Poppler: só estudo (AGPL/GPL).
2. **Palavras não fazem parte do `Book`.** O modelo guarda blocos com `runs`; a tokenização em palavras é feita pelo `segmenter` de forma determinística. Posição de leitura = `(blockId, wordIndex)`.
3. **Overlay de correções fora do modelo.** Correções do usuário (juntar/separar, mudar tipo) ficam em arquivo próprio ancorado por `blockId` + trecho de texto, e são reaplicadas após reprocessar.
4. **IDs estáveis.** `blockId` derivado de (página de origem, ordinal na página, hash do início do texto normalizado). Âncoras de anotação do app guardam também `quote/prefix/suffix` para reancorar quando a extração mudar.
5. **Processamento por página em streaming.** O app começa a ler enquanto o resto processa; resultado vai para cache em disco/IndexedDB.
6. **Confiança em vez de silêncio.** Cada heurística pode rebaixar a confiança do bloco com um motivo (`flags`). Isso alimenta a tela de correção.
7. **OCR é só outro adaptador de ingestão.** Produz `RawDocument`; o restante do pipeline é reaproveitado. Estilo vindo de OCR é pior, e a confiança reflete isso.
8. **Orçamento de desempenho.** Metas provisórias (confirmadas no E0): ≤ 150 ms/página em celular de entrada, pico de memória ≤ 300 MB num livro de 500 páginas, primeira página legível em ≤ 2 s.

## Estrutura interna do pacote `extractor` (alvo)
```
src/
  ingest/        pdfjs adapter, tagged-structure reader
  normalize/
  layout/        lines, columns, reading-order, repeated-regions
  semantic/      headings, paragraphs, notes, quotes, lists, refs, figures
  style/
  join/          cross-page joins, note linking
  output/        ids, confidence, toc, validation
  pipeline.ts    composes the layers (async iterator per page)
  index.ts
```
Cada heurística é um módulo com: função pura, parâmetros nomeados (sem números mágicos soltos), testes e referência à métrica que ela melhora.
