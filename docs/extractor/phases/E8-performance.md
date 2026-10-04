# E8 · Desempenho, streaming e cache

**Requisitos:** REQ-EXT-15. **Depende de:** E4+. **Saída:** metas de desempenho (ARCHITECTURE, decisão 8) atendidas em Android de entrada.

## Tarefas
### E8-T01 · Pipeline como `AsyncIterable` por página
- API `extractStream(pdf)` que emite blocos conforme as páginas ficam prontas (com janela de contexto para junção entre páginas). **Aceite:** primeiro bloco emitido antes de processar o livro todo; resultado final idêntico ao modo em lote (teste).
### E8-T02 · Cache
- Chave `(sha256, extractorVersion, schemaVersion)`; armazenamento atrás de uma interface (arquivo no CLI, IndexedDB/SQLite no app). **Aceite:** segunda abertura não reprocessa; mudança de versão invalida.
### E8-T03 · Worker e memória
- Rodar em Web Worker; liberar páginas do PDF.js após uso; limite de memória. Inclui descartar `font.data` (bytes da fonte) depois de ler nome/métricas quando `fontExtraProperties: true` — no spike S1 isso segurou 308 MB em n4; **só planejar aqui, sem implementar agora** (item do BACKLOG ligado a esta tarefa). **Aceite:** pico ≤ meta em livro de 500 páginas.
### E8-T04 · Benchmarks reproduzíveis
- `pnpm bench` por documento (ms/página, MB); inclui roteiro manual para medir no Android. **Aceite:** números no baseline (informativos) e regressão grave (> 25%) avisa no CI.
