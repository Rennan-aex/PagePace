# E6 · Colunas e ordem de leitura

**Requisitos:** REQ-EXT-02, 10. **Depende de:** E3 (E5 recomendável). **Saída:** `reading_order` ≥ meta em N2.

## Tarefas
### E6-T01 · Detecção de colunas
- Análise de vazios verticais (projeção) por página; 1, 2 ou 3 colunas; tratar títulos e figuras que atravessam colunas. **Aceite:** fixtures sintéticas de 1/2 colunas passam.
### E6-T02 · Ordem de leitura (XY-cut ou equivalente)
- Ordenar regiões; pontos de quebra entre colunas e páginas. **Aceite:** `reading_order` ≥ meta em N2; teste de regressão em N1 (não piora).
### E6-T03 · Regiões laterais e *sidebars*
- Marcar e tirar do fluxo principal (ou no fim da página) com `flags`. **Aceite:** fixture.
### E6-T04 · Colunas + notas + cabeçalhos
- Integração com E3/E5 em artigos de duas colunas. **Aceite:** métricas de N2 completas sem regressão em N1/N3.
