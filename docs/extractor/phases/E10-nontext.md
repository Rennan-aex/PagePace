# E10 · Tabelas, equações e figuras

**Requisitos:** REQ-EXT-11. **Depende de:** E5/E6. **Saída:** blocos `figure|table|equation` corretos e fora do fluxo de leitura dinâmica.

## Tarefas
### E10-T01 · Figuras
- Detectar imagens/vetores relevantes (`nonText`) e criar `figure` com `origin.bbox` e `caption` ligada. **Aceite:** fixtures; legendas associadas.
### E10-T02 · Tabelas
- Detectar tabelas por alinhamento de colunas/linhas de grade; bloco `table` com `placeholder` e, se possível, células. **Aceite:** metade das tabelas simples do corpus N4 detectadas; nunca misturar células no texto corrido.
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
