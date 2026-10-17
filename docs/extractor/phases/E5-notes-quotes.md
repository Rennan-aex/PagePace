# E5 · Notas de rodapé, citações, listas, referências

**Requisitos:** REQ-EXT-08, 09, 19. **Depende de:** E4. **Saída:** `footnote_link_acc` ≥ meta em N3; `block_kind_f1` medido.

## Tarefas
### E5-T01 · Notas de rodapé: detecção — **concluída 2026-10-16**
- Região inferior com fonte menor e marcador numérico/símbolo; separador horizontal quando existir.
- **Aceite:** blocos `footnote` com `origin`; testes com numeração reiniciando por capítulo e por página.
- **Resultado (2026-10-16):** `packages/extractor/src/footnotes.ts` (camada 4) — `detectFootnotes` por página: região inferior (≥ 0,5 da altura de texto), fonte < 0,95 × body, marcador (`1.`/`1)`/`(1)`/`[4]`/`*`/`††`, e o número cru do estilo SciELO com guarda de prosa, de capitulares e de mobiliário de página — **ADR-059**) ou régua impressa (confiança baixa + flag). 21 `testes` verdes, `pnpm eval --ci` = 0 (nenhuma métrica mudou), corpus: **218 blocos `footnote`** (eram 76) em 10 documentos; FP residuais de lista/referência em **BACKLOG 2026-10-16** (P2, E5-T05/E5-T06).
### E5-T02 · Notas: ligação à chamada — **concluída 2026-10-16**
- Encontrar a chamada (sobrescrito/número no texto), ligar `noteRef` no `run` e `anchor` na nota; tratar nota que continua na página seguinte.
- **Aceite:** `footnote_link_acc` ≥ meta; chamadas sem nota e notas sem chamada viram `flags` e baixam confiança.
- **Resultado (2026-10-16):** `packages/extractor/src/notelinks.ts` (camada 4) — `linkFootnoteCalls`: casamento por **label + página** (sup = baseline menor), `noteRef` no run da chamada, `anchor` na **nota**, flags `note-without-call`/`call-without-note` (conf 0,7); nota sem marcador parseável não liga nem flaga; OCR pula a passada; cross-page via guarda de tamanho removida em `footnotes.ts`. Métrica **`footnote_link_acc`** (F1 por `(página, label)`) em `metrics.ts` + runner/coluna/seção/baseline (`higher`). Golden **1.0.0 → 1.1.0** com `noteRef` (label); sintético `syn-n3-en-footnotes` ganhou run `style: "sup"` (`rise`/`size` no minipdf; y top-down). Testes: 15 `notelinks` + 22 `footnotes` + 8 `footnoteLinkAcc` + aceite `footnote-links.test.ts` (N3 ≥ 0,90, sintético === 1); `pnpm eval --ci` exit 0, baseline atualizada (7 × 1,0000). **ADR-060**.
### E5-T03 · Notas de fim (endnotes) — **concluída 2026-10-17**
- Seção de notas ao fim de capítulo/livro ligada às chamadas por número. **Aceite:** teste em fixture sintética.
- **Resultado (2026-10-17):** `packages/extractor/src/endnotes.ts` (camada 4) — `detectEndnotes`: título de seção com **igualdade exata normalizada** no léxico en/pt (`notes`, `endnotes`, `notas`, `notas de rodapé`) + parágrafos contíguos que abrem com marcador de nota (`opensWithNoteMarker`, o mesmo gate do E5-T01, exportado de `footnotes.ts`); para na 1ª decisão `heading` e no 1º parágrafo sem marcador; título nunca é nota. Notas viram blocos `footnote` (o conceito que o esquema já tem — **sem mudança de esquema, ADR-061**); `notelinks.ts` ganhou `NoteCallBlock.endnote?` + fallback `endnoteAfter` (label em ordem de leitura, mesma página primeiro) e página de endnotes não levanta `call-without-note`; `book.ts` faz a união. 12 testes em `endnotes.test.ts` + sintético **`syn-n3-en-endnotes`** (chamadas `sup` na p.1, seção "Notes" de corpo na p.2, todas as métricas 1,0000) + aceite `footnote_link_acc === 1`; 688 testes, `pnpm eval --ci` exit 0 (baseline: 8 × 1,0000).
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
