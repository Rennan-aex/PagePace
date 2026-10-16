# E5 · Notas de rodapé, citações, listas, referências

**Requisitos:** REQ-EXT-08, 09, 19. **Depende de:** E4. **Saída:** `footnote_link_acc` ≥ meta em N3; `block_kind_f1` medido.

## Tarefas
### E5-T01 · Notas de rodapé: detecção — **concluída 2026-10-16**
- Região inferior com fonte menor e marcador numérico/símbolo; separador horizontal quando existir.
- **Aceite:** blocos `footnote` com `origin`; testes com numeração reiniciando por capítulo e por página.
- **Resultado (2026-10-16):** `packages/extractor/src/footnotes.ts` (camada 4) — `detectFootnotes` por página: região inferior (≥ 0,5 da altura de texto), fonte < 0,95 × body, marcador (`1.`/`1)`/`(1)`/`[4]`/`*`/`††`, e o número cru do estilo SciELO com guarda de prosa, de capitulares e de mobiliário de página — **ADR-059**) ou régua impressa (confiança baixa + flag). 21 `testes` verdes, `pnpm eval --ci` = 0 (nenhuma métrica mudou), corpus: **218 blocos `footnote`** (eram 76) em 10 documentos; FP residuais de lista/referência em **BACKLOG 2026-10-16** (P2, E5-T05/E5-T06).
### E5-T02 · Notas: ligação à chamada
- Encontrar a chamada (sobrescrito/número no texto), ligar `noteRef` no `run` e `anchor` na nota; tratar nota que continua na página seguinte.
- **Aceite:** `footnote_link_acc` ≥ meta; chamadas sem nota e notas sem chamada viram `flags` e baixam confiança.
### E5-T03 · Notas de fim (endnotes)
- Seção de notas ao fim de capítulo/livro ligada às chamadas por número. **Aceite:** teste em fixture sintética.
### E5-T04 · Citações em bloco e epígrafes
- Recuo duplo, fonte menor/itálico, entrelinha diferente. **Aceite:** `block_kind_f1` por tipo no nível 3.
### E5-T05 · Listas e legendas
- Marcadores/numeração, recuo. Legendas próximas a figuras/tabelas (`caption`). **Aceite:** testes.
### E5-T06 · Referências bibliográficas
- Seção "Referências/Bibliografia/References"; blocos `reference` com recuo deslocado. **Aceite:** testes em N2.
### E5-T07 · Numeração marginal (Bekker/Stephanus)
- Números/pontos nas margens (`1094a`, `327a`) viram `margin_ref`, fora do fluxo, mas com posição relativa ao texto. **Aceite:** fixture sintética; REQ-19 (P2, pode ser adiado via BACKLOG se não houver PDF real no corpus).
### E5-T08 · Trechos em grego/latim
- Preservar caracteres; marcar `lang` quando óbvio (bloco de caracteres gregos). **Aceite:** nenhum caractere perdido em PDF com grego.
