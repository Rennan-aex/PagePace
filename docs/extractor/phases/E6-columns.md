# E6 · Colunas e ordem de leitura

**Requisitos:** REQ-EXT-02, 10. **Depende de:** E3 (E5 recomendável). **Saída:** `reading_order` ≥ meta em N2.

## Tarefas
### E6-T01 · Detecção de colunas · `done`
- Análise de vazios verticais (projeção) por página; 1, 2 ou 3 colunas; tratar títulos e figuras que atravessam colunas. **Aceite:** fixtures sintéticas de 1/2 colunas passam.
- **Resultado (2026-10-19):** `packages/extractor/src/columns.ts` (camada 3, puro) — `detectColumns` projeta os **itens brutos** no eixo x (voto = centro no bin **ou** item cruzando o bin inteiro, bordas fechadas; gate relativo ao **pico** da projeção, não ao nº de itens — calibrado em `n2-en-arxiv-phobos`, onde equações emitem ~600 itens/página que raspam bandas); guarda de largura mínima por coluna (0,2 da área de conteúdo) mata falso positivo de fio de texto solto; `COLUMNS_MAX = 3` (sobra o gutter mais largo); `spanningItems`/`regionSpanning` marcam título/resumo/figura que atravessam o gutter; sem mudança de esquema e **sem plug no `buildBook`** (E6-T02 consome `columns`/`gutters`/`spanningItems` — ADR-067). 17 testes unitários + 2 sintéticos via pdf.js (1/2 colunas + título atravessando) + 2 de corpus com `skipIf` (arXiv 7/10 páginas em 2 colunas; rebus/SciLO 130/130 páginas em 1 coluna). `pnpm verify` verde (807 testes); `pnpm eval --ci` exit 0, baseline intocada (detecção ainda não altera a extração).
### E6-T02 · Ordem de leitura (XY-cut ou equivalente)
- Ordenar regiões; pontos de quebra entre colunas e páginas. **Aceite:** `reading_order` ≥ meta em N2; teste de regressão em N1 (não piora).
### E6-T03 · Regiões laterais e *sidebars*
- Marcar e tirar do fluxo principal (ou no fim da página) com `flags`. **Aceite:** fixture.
### E6-T04 · Colunas + notas + cabeçalhos
- Integração com E3/E5 em artigos de duas colunas. **Aceite:** métricas de N2 completas sem regressão em N1/N3.
