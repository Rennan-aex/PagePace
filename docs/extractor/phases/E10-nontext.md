# E10 · Tabelas, equações e figuras

**Requisitos:** REQ-EXT-11. **Depende de:** E5/E6. **Saída:** blocos `figure|table|equation` corretos e fora do fluxo de leitura dinâmica.

## Tarefas
### E10-T01 · Figuras · `done`
- Detectar imagens/vetores relevantes (`nonText`) e criar `figure` com `origin.bbox` e `caption` ligada. **Aceite:** fixtures; legendas associadas.
- **Resultado (2026-11-06):** **`done` — T01a + T01b.** **T01a:** `ingest/non-text.ts` (`collectNonTextRegions` da operator list do pdf.js) + `page.nonText` no `readPage` (chave omitida quando vazia), 14 testes, PR #90 (squash `9f19db0`). **T01b:** `figures.ts` (área 1%–90% da página, merge com gap ≤ 1,2×body em ambos os eixos, legenda da E5-T05 a ≤ 3×body abaixo com sobreposição horizontal → texto em `placeholder.description`, Opção A) + intercalação `insertBefore` por banda em `buildBlockChunks` e chunk próprio para a página sem parágrafo (**ADR-100**); 11 unitários (`src/figures.test.ts`) + 3 de integração (`test/figure-pdf.test.ts`, inclui a p3 do phobos); `pnpm verify` 1157 testes, `pnpm eval --ci` exit 0, schema/baseline intocados.
### E10-T02 · Tabelas · `done`
- Detectar tabelas por alinhamento de colunas/linhas de grade; bloco `table` com `placeholder` e, se possível, células. **Aceite:** metade das tabelas simples do corpus N4 detectadas; nunca misturar células no texto corrido.
- **Resultado (2026-11-06):** **`done` — PR #96 (squash `39c697e`).** `src/tables.ts` (`detectTables` puro, constantes nomeadas exportadas) + wire em `book.ts` (`analysis.tables` → `splitParagraphsAtTables` mescla linhas consecutivas em UM bloco `table` com TSV em `placeholder.description`, prioridade `table > equation > list > quote` da ADR-100). Calibração final: âncora de gap = alnum nos dois lados OU sinal standalone (`CELL_ANCHOR`/`CELL_SIGN`); voto de família dominante só entre itens com alnum (`TABLE_ALNUM_FAMILY_SHARE` 0,35); `MATH_RELATION` com `≪≫` (sem `<`/`>` simples, p267); `DOT_LEADER` literal. Medição: `n4-en-fisica` 3 tabelas (p6–p8), `n4-en-astrofisica` 2 (p16+p18), `n4-pt` 40 (todas reais; p44/p288 mortos; p116/p331 novos), phobos 0. Testes: 10 unitários (`src/tables.test.ts`) + 7 de integração (`test/table-pdf.test.ts`, 3 sintéticos + 3 corpus + phobos); `pnpm verify` 1174 testes, `pnpm eval --ci` exit 0, schema/baseline intocados. **ADR-101**, limites em BACKLOG.
### E10-T03 · Equações
- Detectar linhas com fontes matemáticas/símbolos; bloco `equation` (placeholder com recorte de página). **Aceite:** equações não entram no texto do parágrafo como lixo.
### E10-T04 · Recortes de imagem (depende de OPEN-QUESTIONS #1)
- API para renderizar a região do bloco (PDF.js) para o app exibir em modo normal. **Aceite:** função com teste; decisão de produto registrada.

## Notas de sessão (2026-11-06) — T01a pronta, calibração e plano para as próximas sessões

### Feito na T01a (branch `e10-nontext`)
- `ingest/non-text.ts`: `collectNonTextRegions(ops, view)` — pilha CTM (save/restore/forms), pinturas de imagem (83/85/86 + repeats 88/89 + groups 84/87) viram `unit square` sob a matriz efetiva; `constructPath` (91) só com paint op, usando o `pathMinMax` do 3º argumento; dedupe + ordenação por (y,x,w,h,kind), arredondamento em `BBOX_DECIMALS`, caixa degenerada descartada. Mesmo espelho de y do `glyphBox` (top-left page coordinates).
- `readPage` (`ingest/pdfjs.ts`) popula `page.nonText` **só quando não vazio** — página sem arte mantém o JSON byte a byte igual ao pré-E10 (goldens/eval estáveis).
- Testes: `src/ingest/non-text.test.ts` (11 unitários, TDD) + `test/non-text-pdf.test.ts` (3 de integração, inclui o heatmap da p3 do phobos no corpus público). `minipdf.ts` ganhou `images` (`ImageSpec`) para desenhar XObjects.
- `pnpm verify` verde (1143 testes) · `pnpm eval` sem regressão · baseline intocada.

### Descobertas de calibração (pdf.js 6.4.299) — sonda salva em `C:\Users\<usuario>\AppData\Local\Temp\opencode\probe-e10.mts`
- **Ordem das matrizes:** worker faz `ctm = Util.transform(ctm, args)` → a matriz nova aplica **primeiro**: `ctm = compose(ctm, M)`. `compose(m1,m2)` = fórmula exata de `Util.transform` (aplica m2 antes).
- **Args reais:** `constructPath = [fn, [pathBuffer Float32Array], minMax]`; `paintImageXObjectRepeat = [objId, scaleX, scaleY, positions]`; `paintImageMaskXObjectRepeat = [img, scaleX, skewX, skewY, scaleY, positions]` (posições são números planos, não arrays); `paintFormXObjectBegin = [matrix|null, bbox]`.
- **Toda pintura de imagem ocupa o unit square** sob a matriz efetiva (`ctx.scale(1/w,-1/h)` no renderer; máscara idem).
- Códigos OPS úteis: save=10, restore=11, transform=12, formBegin=74, formEnd=75, imageMask=83, group=84, image=85, inline=86, inlineGroup=87, repeat88/89, constructPath=91.
- `columns.ts` só lê `nonText` para `regionSpanning` (não consumido fora de testes) → popular `nonText` **não** altera detecção de colunas nem o baseline.
- Medição N4: linhas de tabela hoje viram parágrafos com gaps de célula (itens separados por itens vazios/`" "` largos ~57-78pt; ex.: `n4-en-fisica` p6 y293-432); `n4-en-astrofisica` p2 e `n4-pt` p9 são TOC (falso positivo conhecido); equações do `n4-en-fisica` não têm fontes math (só símbolos).

### Plano — E10-T01b (figuras; próximo passo)
- `figures.ts`: filtrar `nonText` (área ≥1% e ≤90% da página), mesclar regiões próximas (gap ≤ ~1.2×bodyFont), ligar caption (menor gap ≤ ~3×bodyFont abaixo; **`placeholder.description` carrega o texto da caption — Opção A, sem bump de schema**), prioridade de kind `table > equation > list > quote` na intercalação.
- Inserção no `buildBlockChunks` (`book.ts`) com algoritmo `insertBefore` por banda: spanning → primeiro parágrafo com `top >= fig.bottom`; banda n → primeiro parágrafo da banda abaixo, senão após o último da banda. Figura vira chunk próprio com `pageIndex` = página de origem (`BlocksEvent.pageIndex = origin.pageFrom`), `endnoteFlags.push(false)`.
- Aceite T01: fixtures de figura (sintética via `minipdf.images` + corpus), `origin.bbox` do bloco `figure` bate com a região, caption associada.

### Plano — E10-T02 (tabelas)
- Agrupar parágrafos consecutivos (mesma página/banda, gap ≤ fator×bodyFont) com gaps grandes alinhados entre linhas; anti dot-leader; falsos positivos conhecidos: TOC `n4-en-astrofisica` p2 / `n4-pt` p9.
- **Mesclar execuções consecutivas de linhas de tabela em UM bloco `table`** (hoje cada linha vira parágrafo); embeddings de células em `placeholder.description` (TSV); medição de calibração: `n4-en-fisica` p6-p8, `n4-pt-astrofisica` p18.

### Plano — E10-T03 (equações)
- Detecção: `mathFontShare ≥ ~0.25` **OU** `symbolDensity ≥ ~0.2` (+ `=` ou linha curta); fontes `rtxmi|txsy|txex|CMMI|CMSY|CMEX...`; `n4-en-fisica` sem fontes math → cair só na densidade de símbolos.
- Mesclar parágrafos de equação consecutivos em um bloco `equation`; aceite: equações não viram lixo de parágrafo.

### Plano — E10-T04 (recortes)
- Teste ligando `origin.bbox` de bloco `figure` a `renderPageRegion` (função e ADR-016 já existem); decisão de produto pendente em `OPEN-QUESTIONS #1`.

### Feito na T01b (2026-11-06, branch `e10-t01b-figures`) — fechada, ADR-100
- `src/figures.ts`: `detectFigures({pages, paragraphs, captions, bodyFontSize})` → `FigureDecision[]` puro e determinístico; constantes `FIGURE_MIN_PAGE_SHARE` 0,01 · `FIGURE_MAX_PAGE_SHARE` 0,9 · `FIGURE_MERGE_GAP_FACTOR` 1,2 · `FIGURE_CAPTION_GAP_FACTOR` 3 (todas exportadas). Merge = cluster com gap ≤ fator×body nos **dois** eixos; âncora considera só bands ≥ 1 (0 = spanning) e 0 ou ≥ 2 overlaps = spanning; legenda exige `captions[i].caption === true` (gate da E5-T05), `normalizeForReader(paragraphHyphenText(...))` para o texto bater com o bloco `caption`.
- Wire em `book.ts`: campo `figures` no `BookAnalysis` (calculado depois de `captions`) e três funções novas — `figureBlockOf` (`runs: []`, `origin.bbox = [bbox]`, `placeholder.description` só quando há legenda), `figureBlocksOf` (ordinais da página, ids `blockId(page, ordinal, caption)`), `interleaveFigures` (reordena o chunk, `endnoteFlags.push(false)`), `figureOnlyChunks` (página sem parágrafo → chunk próprio, `pageIndex = origin.pageFrom`, ordenado por página).
- **Invariantes preservados (ADR-088):** um único evento `blocks` por página — `pipeline.test.ts:62` exige `pageIndex === [0,1,2…]`, então a figura **entra no chunk da página** e o "chunk próprio" do plano vale só para a página sem parágrafo. `blockIndexByParagraph` é limpo a cada página e a busca do âncora é limitada por `lastParagraphIndex` (âncora sem bloco próprio, texto vazio, avança para o parágrafo seguinte).
- **Prioridade `table > equation > list > quote` do plano:** anotação para T02/T03 (hoje a figura só disputa lugar com o parágrafo); registrada na ADR-100 para não virar silêncio.
- Testes: `src/figures.test.ts` (11: filtros de área, merge, legenda, intercalação single-column, append no fim, coluna 2, manutenção do bloco `caption`, `parseBook`) + `test/figure-pdf.test.ts` (3: parágrafo→figure→caption→parágrafo, página só-com-arte, heatmap da p3 do phobos no corpus público — os 3 rodam, `corpus/public` existe).
- Limites conhecidos (candidatos a BACKLOG): legenda acima da figura ou além do gap fica órfã; `nonText` não tem passe de regiões repetidas (running head/foot pode virar figura pequena); tabela desenhada como vetor ainda lê `figure` até a T02 reivindicar.

### Feito na T02 (2026-11-06, branch `e10-t02-detect-tables`) — fechada, ADR-101
- `src/tables.ts`: `detectTables({pages, paragraphs, bodyFontSize})` → `TableDecision[]` puro e determinístico; constantes exportadas `TABLE_MIN_LINES` 3 · `TABLE_MIN_GAPS` 2 · `TABLE_LINK_MIN_GAPS` 2 · `TABLE_VGAP_FACTOR` 1,5 · `TABLE_GAP_FACTOR` 1,2 · `TABLE_BODY_SHARE` 0,55 · `TABLE_ALNUM_FAMILY_SHARE` 0,35 · `MATH_RELATION` · `CELL_ANCHOR` · `CELL_SIGN` · `DOT_LEADER`.
- **Gates finais (todos medidos):** linha é candidata se ≥2 gaps (max(1,2×fs, body)) com âncora alnum-alnum OU sinal-standalone; linha com exatamente 1 gap **quebra** a cadeia; link exige ≥2 gaps alinhados (overlap ≥50% do menor) na linha seguinte; vgap ≤ 1,5×body; célula sem gap é absorvida; elegibilidade: `side !== true`, fs ≥ 0,55×body, sem dot-leader, sem `MATH_RELATION` (`[=≈≃≡≤≥≪≫]` — `<`/`>` simples fora por `p267` `> 0.64`); aceitação: ≥3 linhas E ≥2 gapadas.
- **Família dominante:** voto só entre itens **com alnum** (`TABLE_ALNUM_FAMILY_SHARE` 0,35) — alnum-only separava mal (p70/p64/p65 perdidos com threshold alto em todos os itens); `familyOf` normaliza estilos (`[-_](BoldItalic|Bold|Italic|Oblique)MT$` etc.).
- Wire em `book.ts`: `analysis.tables` paralelo a `paragraphs` (`(TableDecision|undefined)[]`); `splitParagraphsAtTables` remove as linhas de tabela dos parágrafos e o `book.ts` emite UM bloco `table` (runs `[]`, `origin.bbox`, TSV em `placeholder.description`); intercalação já coberta pela prioridade `table > equation > list > quote` (ADR-100).
- Testes: `src/tables.test.ts` (10: grid aceito, dot-leader, 2-linhas rejeitado, TOC, MATH_RELATION, gap sign, quebra de 1 gap etc.) + `test/table-pdf.test.ts` (7: sintéticos prosa/grid/TOC via `minipdf` com prosa em 4 chunks sobrepostos para não splitar colunas; corpus privado fisica=3, en-astro=2, pt=1 com "Tef"; phobos=0).
- **Limites conhecidos (BACKLOG):** (a) p116 parcial — linha com 1 gap quebra a cadeia; (b) tabelas em 2 colunas nunca seedam (o detector de colunas separa as linhas); (c) grids de equação sem relação viram tabela até a T03; (d) header com gap só em bracket (p230) não reivindicado — either-side o pega mas traz FPs (p44/p288).
