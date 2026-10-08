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

### E2-T02 · Itens → linhas
- Agrupar itens por baseline (tolerância relativa ao tamanho da fonte), ordenar da esquerda para a direita.
- **Aceite:** teste com fixtures (linha com itens fragmentados, sobrescrito, mudança de fonte na linha); em N1, nº de linhas por página dentro de ±2% do gabarito.

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
