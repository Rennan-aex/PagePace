# E4 · Títulos, estilos e sumário

**Requisitos:** REQ-EXT-04, 05. **Depende de:** E3. **Saída:** metas `heading_f1`, `heading_level_acc`, `style_f1` em N1–N3; sumário gerado.

## Tarefas
### E4-T01 · Estilos inline (negrito, itálico, sup, sub) — **concluída 2026-10-13**
- A partir do resultado do spike S2: nome da fonte + flags; casos de sobrescrito por tamanho/posição; produzir `runs`.
- **Aceite:** `style_f1` ≥ meta em N1; `runs` adjacentes com o mesmo estilo são fundidos; testes de fronteiras (estilo no meio da palavra).
- **Feito (branch `e4-t01-inline-styles`, ADR-053):** `fontstyle.ts` (nome → bold/italic), `runs.ts` (runs por item + sup/sub por tamanho/posição + fusão de vizinhos iguais + item só-espaço neutro), `style_f1` no eval (F1 por caractere de negrito/itálico). `pnpm verify` verde (532 testes); `style_f1` = 1,0000 nos 7 documentos, nenhum outro regrediu.
### E4-T02 · Detecção de títulos e níveis
- Clusters de tamanho/peso/espaçamento relativos ao corpo; centralização; linhas curtas isoladas; numeração (`1.2`, `Capítulo`); evitar legendas e epígrafes.
- **Aceite:** `heading_f1` e `heading_level_acc` ≥ meta; relatório de falsos positivos.
### E4-T03 · Sumário
- Usar bookmarks do PDF quando existirem e conferir com títulos detectados; fallback: derivar dos títulos. Cada entrada aponta para `blockId`.
- **Aceite:** teste com PDF com e sem bookmarks; discrepâncias viram `warnings`.
### E4-T04 · Metadados
- Título, autores, idioma (`pt|en|mixed|unknown`) por detecção simples (léxico de stopwords) + metadados do PDF.
- **Aceite:** idioma correto em 100% dos documentos do corpus com idioma conhecido.
### E4-T05 · Estilo vs texto original em títulos
- Títulos não herdam negrito do estilo de título como `bold` de run (evita duplicar a semântica); decidir e registrar ADR.
