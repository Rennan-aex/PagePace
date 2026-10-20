# E7 · Confiança, overlay de correções e CLI completa

**Requisitos:** REQ-EXT-13, 14 (e dados para "ver original"). **Depende de:** E4+ (idealmente E5). **Saída:** correções sobrevivem ao reprocessamento (teste); confiança calibrada.

## Tarefas
### E7-T01 · Modelo de confiança — done (2026-10-20, ADR-071)
- Combinar `flags` por heurística em `confidence` (0–1) por bloco; documentar a tabela de pesos. **Aceite:** `confidence_calibration` medida e registrada no baseline.
- **Resultado:** `confidence.ts` com pesos aditivos (dúvida 0,2 · broken-font 0,6 · estrutural 0,0), piso 0,1; métrica `confidence_calibration` (correlação ponto-biserial negada; erro = FP do casamento texto+kind) no eval, gate ≥ 0,5 e baseline 1,0000 nos 12 medidos.
### E7-T02 · `applyOverlay` — done (2026-10-20, ADR-072)
- Implementar as operações de `SCHEMA.md` (merge, split, set_kind, delete, edit_text, set_style), com reancoragem por `quote/prefix/suffix`; `unapplied` explícito. **Aceite:** testes por operação e por falha de reancoragem.
- **Resultado:** `packages/schema/src/apply.ts` (`@pagepace/schema`): reancoragem por id + citação e busca única com prefixo/suffix (zero ou 2+ achados = `unapplied`), offsets deslocados pelo delta, ids de split `<id>#<n>`, merge retargeta toc/noteRef/âncora, `edit_text` = confiança 1 sem flags, `delete_block` preserva o último bloco e limpa ponteiros, `set_style` fatia runs, overlay de outro `bookId` = tudo em `unapplied`; resultado validado por `parseBook`; **34 testes** (6 opções + reancoragem + determinismo/imutabilidade), `pnpm verify` verde (907 testes), `pnpm eval --ci` exit 0 (nada da extração mudou).
### E7-T03 · Teste de reprocessamento
- Gerar `Book` v1, aplicar overlay, alterar levemente a extração (simulada), reaplicar. **Aceite:** ≥ 95% das operações reancoram em mudança pequena; o restante vai a `unapplied`.
### E7-T04 · Dados para "ver original"
- Garantir `origin.bbox` por bloco e API para renderizar a página/região (PDF.js) numa tela de correção. **Aceite:** função de utilidade com teste; documentado em `docs/app/`.
### E7-T05 · CLI completa
- `extract`, `inspect` (relatório Markdown/HTML lado a lado com flags), `eval`, `explain-page <pdf> <n>` (mostra decisão de cada camada). **Aceite:** documentada no README do pacote; usada na checklist manual.
