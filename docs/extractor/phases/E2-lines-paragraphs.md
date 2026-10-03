# E2 · Linhas e parágrafos (coluna única)

**Objetivo:** do `RawDocument` a parágrafos corretos em livros simples (N1).
**Requisitos:** REQ-EXT-01, 02, 03.
**Depende de:** E1.
**Critério de saída:** metas N1 de `text_cer`, `para_boundary_f1`, `reading_order` atingidas; `Book` válido gerado.

## Tarefas

### E2-T01 · Estatísticas do documento
- Calcular por documento: tamanho de fonte do corpo (moda ponderada), entrelinha típica, margens e largura de coluna.
- **Aceite:** função pura com testes em fixtures; expor valores via `pagepace inspect`.

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
