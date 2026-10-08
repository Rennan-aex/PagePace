# E2 · Linhas e parágrafos (coluna única)

**Objetivo:** do `RawDocument` a parágrafos corretos em livros simples (N1).
**Requisitos:** REQ-EXT-01, 02, 03.
**Depende de:** E1.
**Critério de saída:** metas N1 de `text_cer`, `para_boundary_f1`, `reading_order` atingidas; `Book` válido gerado.

## Tarefas

### E2-T01 · Estatísticas do documento · `done`
- Calcular por documento: tamanho de fonte do corpo (moda ponderada), entrelinha típica, margens e largura de coluna.
- **Aceite:** função pura com testes em fixtures; expor valores via `pagepace inspect`.
- **Resultado (2026-10-07):** **`done` — `pnpm verify` verde com 260 testes (+17) e `pnpm eval --ci` exit 0 (nenhuma métrica mudou: nenhuma heurística de extração foi tocada).**
  - **(1) `packages/extractor/src/stats.ts`** — função pura `documentStats(raw: RawDocument): DocumentStats` (núcleo portável, sem `fs`; exportada por `@pagepace/extractor`): **corpo** = moda ponderada do `fontSize` (peso = caracteres não-espaço, item só de espaços pesa 1, desempate no **menor** tamanho, tudo arredondado a 2 casas); **entrelinha** = mediana dos deltas verticais entre itens de linhas consecutivas da mesma página — para cada item, o próximo com `gap ≥ 0,5 × corpo` e `≤ 3 × corpo` **e** sobreposição horizontal (itens da mesma linha e colunas vizinhas nunca contam) — com fallback documentado `LINE_HEIGHT_FALLBACK_FACTOR = 1.2 × corpo` quando não há nenhum par; **margens** = caixa do texto (`xMin/xMax/yMin/yMax`) comparada ao `MediaBox` de cada página, **mediana** entre páginas; **largura de coluna** = `xMax − xMin` (mediana); páginas sem texto ficam de fora; documento sem nenhum item = `StatsError`.
  - **(2) CLI `pnpm pagepace inspect <arquivo.pdf>`** — imprime arquivo, páginas medidas, itens, corpo, entrelinha, margens e largura de coluna; `--help` atualizado; a leitura/ingestão foi fatorada em `loadDocument()` (mesmas mensagens e mesmos códigos de saída 0/1/2/3 do `dump-raw`, incluindo o PDF escaneado da ADR-018).
  - **(3) Testes (+17):** `packages/extractor/src/stats.test.ts` (**14** — corpo por peso de caracteres, desempate no menor, ruído de ponto flutuante, item só de espaços, entrelinha, itens na mesma linha, coluna vizinha sem sobreposição, gap fora da faixa, fallback, margens contra a página, mediana entre 2 páginas, páginas sem texto, documento sem texto = erro, determinismo) + CLI (**3** — saída real sobre PDF `minipdf` de 3 linhas, uso/arquivo ausente/opção desconhecida, escaneado = exit 3).
  - **(4) Provas reais:** `pagepace inspect` no **`n1-en-rebus-philosophy-mind`** → corpo **11,00 pt**, entrelinha **15,40 pt**, margens ≈56 pt, coluna **498,61 pt**, 96/99 páginas, 8.272 itens; no **`n2-en-arxiv-phobos`** (duas colunas — fora do escopo da E2, valor só informativo) → corpo **9,96 pt**, entrelinha **10,96 pt**; `pnpm eval --ci` = os mesmos 5 sintéticos com `text_cer 0.0000`, exit 0.

### E2-T02 · Itens → linhas · `done`
- Agrupar itens por baseline (tolerância relativa ao tamanho da fonte), ordenar da esquerda para a direita.
- **Aceite:** teste com fixtures (linha com itens fragmentados, sobrescrito, mudança de fonte na linha); em N1, nº de linhas por página dentro de ±2% do gabarito.
- **Resultado (2026-10-07):** **`done` — `pnpm verify` verde com 277 testes (+17) e `pnpm eval --ci` exit 0 (nenhuma métrica mudou: nenhuma heurística do pipeline de `text_cer` foi tocada).**
  - **(1) `packages/extractor/src/lines.ts`** — função pura `groupLines(page): TextLine[]` (mais `documentLines(raw)`), núcleo portável, determinística. **Baseline = `y + height`** (o `glyphBox` do ingest define `y = baseline − altura`, então a soma é a baseline exata) e **`height == fontSize`**. Passo A: itens com conteúdo (`text.trim() !== ""`) entram na **linha mais próxima acima** quando `|baseline − âncora| ≤ 0,5 × item.fontSize` (**`LINE_BASELINE_TOLERANCE_FACTOR`**) **ou** a sobreposição vertical é `≥ 0,5 × item.height` (**`LINE_OVERLAP_MIN_FACTOR`**) — a segunda regra é a que segura sobrescrito/índice e mistura de fontes na mesma linha. Passo B: itens só de espaço/marcador `hasEOL` (o pdf.js emite `text: ""` com altura 0) se anexam a uma linha cuja caixa contém a baseline e **nunca criam linha** (sem linhas-fantasma). Saída ordenada por `top` (desempate `bottom`, `x`) e itens por `x` com desempate totalmente ordenado; geometria da linha só dos itens com conteúdo.
  - **(2) Fatores calibrados em medição, não no chute:** itens da mesma linha têm delta de baseline **exatamente 0,00**; entre linhas vizinhas a distância normalizada fica em **1,14×–1,4× o `fontSize`** (mínima medida 1,14) — o fator 0,5 deixa **≈2× de folga** para cada lado e a regra de sobreposição cobre o caso em que a tolerância sozinha não bastaria.
  - **(3) Testes +9 (`packages/extractor/src/lines.test.ts`):** linha com itens fragmentados (2 runs lado a lado), duas linhas adjacentes sem fundir, leading de 1,05× (corpo e corpo+acentos), sobrescrito (item 4 pt acima da linha de 11 pt), mudança de fonte na linha (12 pt + 8 pt na mesma baseline), itens só de espaço/EOL (zero height) anexados e **nunca criando linha**, página vazia, ordem de entrada embaralhada = mesma saída (determinismo) e as duas constantes nomeadas.
  - **(4) Aceite contra o gabarito (+7 em `packages/eval/`):** `goldenLinesPerPage(golden)` em `golden.ts` (+4 testes) devolve as **linhas visíveis por página** somando os `\n` das runs de cada bloco — e devolve `null` quando o golden **não registra o layout** (nenhuma run quebra linha) ou quando um bloco não tem `origin` de página única; **`packages/eval/src/lines.test.ts`** roda em **todo documento N1 com golden** e exige, por página, desvio **≤ 2%** (`LINE_COUNT_TOLERANCE`), com um teste guardião que falha se **nenhum** N1 puder ser conferido (a checagem não pode morrer em silêncio). **Resultado: `syn-n1-en-paragraphs` = 12/13 linhas nas p. 1/2 e `syn-n1-pt-acentos` = 12/14 — desvio 0,00% nas 4 páginas** (o gabarito real dos N1 ainda não existe; os goldens de PDF com copyright não vão ao git, skill `write-golden-test`).
  - **(5) Provas em N1 reais (sem golden, contra a referência `hasEOL+1` do pdf.js — evidência, não gate):** `n1-en-sofia` **0,000%** (177 pág, 6.280 linhas), `n1-en-curinga` **0,000%** (192, 7.370), `n1-pt-curinga` **0,000%** (309, 8.806), `n1-pt-sofia` **+0,006%** (493, 17.637 — 1 página fora), `n1-en-rebus` **−0,170%** (96, 2.943). As divergências foram **investigadas uma a uma e a referência é que erra**: p. 5 (CONTENTS) tem 56 itens em **31 baselines distintos = 31 linhas corretas**, mas 44 marcadores `hasEOL` que **repetem baseline** (entra título + autor na mesma contagem do pdf.js) → `hasEOL+1` = 45; p. 26 = 42 linhas nossas contra 41 do pdf.js porque o **número da página é uma linha própria** (baseline própria, sem `EOL`). Fora do escopo e medido só para não enganar ninguém: `n1-en-lostworld` (camada de OCR, E9) **−0,511%** e `n2-en-arxiv-phobos` (duas colunas, E6) **−48,342%** — esperado, o agrupamento ainda é de coluna única.
  - **(6) Docs:** **ADR-039 `accepted`** (regra de agrupamento + o que conta como "gabarito" do aceite), `EVALUATION.md` (seção "Contagem de linhas por página") e skill `write-golden-test` (`\n` = fim de linha visual).

### E2-T03 · Inferência de espaços
- Inserir espaço onde a lacuna entre itens/caracteres excede limiar relativo ao tamanho da fonte; não duplicar espaços existentes.
- **Aceite:** `text_cer` em N1 ≤ meta; casos: justificado, kerning apertado, itens sem espaço.

### E2-T04 · Linhas → parágrafos
- Sinais: recuo de primeira linha, espaçamento vertical extra, última linha curta, mudança de alinhamento. Parâmetros nomeados e documentados.
- **Aceite:** `para_boundary_f1` N1 ≥ meta; relatório de erros por documento (falsos cortes/junções).

### E2-T05 · Montar `Book` mínimo
- Blocos `paragraph` com `origin`, IDs estáveis, `confidence` provisória constante, validação no esquema.
- **Aceite:** `pagepace extract <pdf>` gera `Book` válido; teste de estabilidade de IDs (rodar duas vezes = mesmos IDs).

### E2-T06 · Ordem de leitura trivial (coluna única) + métrica `reading_order`
- **Aceite:** métrica implementada e no baseline.

## Checklist manual do PO
- [ ] Abri `pagepace inspect` em 2 livros N1 e os parágrafos parecem certos nas páginas que conferi.
