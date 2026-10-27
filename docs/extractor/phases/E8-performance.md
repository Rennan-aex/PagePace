# E8 · Desempenho, streaming e cache

**Requisitos:** REQ-EXT-15. **Depende de:** E4+. **Saída:** metas de desempenho (ARCHITECTURE, decisão 8) atendidas em Android de entrada.

## Tarefas
### E8-T01 · Pipeline como `AsyncIterable` por página
- API `extractStream(pdf)` que emite blocos conforme as páginas ficam prontas (com janela de contexto para junção entre páginas). **Aceite:** primeiro bloco emitido antes de processar o livro todo; resultado final idêntico ao modo em lote (teste).
### E8-T02 · Cache
- Chave `(sha256, extractorVersion, schemaVersion)`; armazenamento atrás de uma interface (arquivo no CLI, IndexedDB/SQLite no app). **Aceite:** segunda abertura não reprocessa; mudança de versão invalida.
### E8-T03 · Worker e memória
- Rodar em Web Worker (**decidido: ADR-021** — PDF.js sempre em worker); liberar páginas do PDF.js após uso; limite de memória. **Documentos de estresse (pedido do PO, 2026-10-04):** `n2-en-astrofisica` (406 MB com 14 páginas, pior página 2.427 ms), `n3-pt-filosofia2` (314 MB com 163 páginas) e `n1-en-lostworld` (scan com imagens pesadas, +23,5 MB de `font.data`). **Aceite:** pico ≤ meta em livro de 500 páginas **e** limite/degradação controlada nos 3 documentos de estresse.
- **Fatia 1 — descartar `font.data` (BACKLOG 2026-10-04) — done (2026-10-27, ADR-086):** `discardFontData(page, Object.keys(styles))` em `readPage` chama `font.clearData()` (API própria do pdf.js 6 — `data` é getter, `delete` não funciona) depois de ler nome/métricas; ids não resolvidos são pulados. **Resultado:** teste de integração com pdf.js real (bytes somem, `name`/`ascent` ficam; páginas seguintes ainda resolvem o nome) + teste unitário; medição: `data` vale 0,4 MB (n4-pt) / 6,4 MB (n2-astrofisica) / 0,8 MB (lostworld) — os 308 MB antigos eram o custo total da flag; `pnpm verify` verde (1004 testes, +3), `pnpm eval --ci` exit 0 (saída idêntica).
### E8-T04 · Benchmarks reproduzíveis
- `pnpm bench` por documento (ms/página, MB); inclui roteiro manual para medir no Android. **Documentos de estresse (pedido do PO, 2026-10-04):** `n2-en-astrofisica`, `n3-pt-filosofia2` e `n1-en-lostworld`.
- **Aceite:** números no baseline (informativos) e regressão grave (> 25%) avisa no CI. **Medições em aparelho real obrigatórias (condição da ADR-005, 2026-10-04)** — se alguma falhar, a ADR-005 é reaberta: **(a)** o scan com imagens pesadas (`n1-en-lostworld`); **(b)** a página atípica de 2.427 ms (`n2-en-astrofisica`); **(c)** a memória real no Android (`performance.memory` lá é grosseiro — usar método confiável).
