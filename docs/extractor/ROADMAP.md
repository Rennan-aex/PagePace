# Roadmap do extrator

Cada marco é entregue em fatias verticais pequenas. Detalhe de tarefas em `phases/`. Estado vivo em `STATE.md`.
Ordem: **E0 → E1 → E2 → E3 → E4 → E5 → E6 → E7 → E8 → E9 → E10**. A trilha **SEG** (segmentador) pode ser feita a qualquer momento depois do E1, e **precisa estar pronta antes do M2 do app**.

| Marco | Objetivo | Requisitos | Critério de saída (resumo) | Arquivo |
|---|---|---|---|---|
| **E0** Spikes | Saber o que o PDF.js entrega, desempenho no celular, cobertura de PDFs tagged, licenças; montar o corpus inicial | 17, 21 | Relatórios em `spikes/` + decisão go/no-go do PDF.js em DECISIONS | `phases/E0-spikes.md` |
| **E1** Fundação | Esquema 1.0, ingestão bruta, CLI `dump-raw`, corpus + manifest + fetch, runner de métricas e baseline, CI | 01, 12, 16, 17, 22 | `pnpm eval` roda em todo o corpus público e gera baseline; CI com gate | `phases/E1-foundation.md` |
| **E2** Linhas e parágrafos | Linhas, espaços, parágrafos em coluna única | 01, 02, 03 | F1 de fronteira de parágrafo ≥ meta do nível 1 | `phases/E2-lines-paragraphs.md` |
| **E3** Limpeza | Cabeçalho/rodapé, hifenização, junção entre páginas, unicode | 06, 07, 18 | Metas de remoção e hifenização atingidas nos níveis 1–3 | `phases/E3-cleanup.md` |
| **E4** Títulos e estilos | Títulos e níveis, negrito/itálico, sumário, metadados | 04, 05 | Detecção de títulos e estilos nas metas; sumário gerado | `phases/E4-headings-styles.md` |
| **E5** Notas e citações | Notas de rodapé ligadas, citações, epígrafes, listas, referências, numeração marginal | 08, 09, 19 | Ligação de notas ≥ meta no nível 3 | `phases/E5-notes-quotes.md` |
| **E6** Colunas | Colunas e ordem de leitura | 02, 10 | Ordem de leitura ≥ meta no nível 2 | `phases/E6-columns.md` |
| **E7** Confiança e correção | Confiança, overlay, `applyOverlay`, CLI completa, dados para "ver original" | 13, 14 | Overlay reaplica após reprocessar sem perder correções (teste) | `phases/E7-confidence-overlay.md` |
| **E8** Desempenho | Streaming por página, cache, orçamento de tempo/memória | 15 | Metas de desempenho no Android de entrada | `phases/E8-performance.md` |
| **E9** OCR | Adaptador OCR para escaneados | 20 | Nível 5 abre e é legível, com confiança calibrada | `phases/E9-ocr.md` |
| **E10** Não textual | Tabelas, equações, figuras | 11 | Blocos corretos e fora do fluxo de leitura dinâmica | `phases/E10-nontext.md` |
| **SEG** Segmentador | Frases e palavras pt/en | SEG-01..03 | Suíte de casos pt/en passando | `phases/SEG-segmenter.md` |

## Marcos de integração com o app
- O app só começa o **M2** (leitura dinâmica) com E1–E4 + SEG concluídos num nível razoável para livros simples.
- O app só começa o **M3** (modo normal) com E5 (notas) razoavelmente pronto.
- A tela de correção do app depende do E7.

## Regras de mudança de plano
Reordenar ou cortar marcos exige entrada em `DECISIONS.md`. Itens novos vão para `BACKLOG.md` primeiro.
