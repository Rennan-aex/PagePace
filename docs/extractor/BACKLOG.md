# Backlog (ideias e problemas fora do escopo da tarefa atual)

Regra: ideia nova nunca entra direto no código. Anote aqui com data e contexto; o PO decide quando promover a tarefa.

| Data | Item | Origem (tarefa) | Prioridade sugerida |
|---|---|---|---|
| 2026-10-04 | Descartar `font.data` após ler `name`/métricas quando `fontExtraProperties: true` (memória: 308 MB em n4; **S4 mediu +35 MB em n4-pt e +23,5 MB em n1-en-lostworld**) — **ligado à tarefa E8-T03, sem implementar agora** | E0-T02 (S1), E0-T05 (S4) | P2 |
| 2026-10-04 | Verificar se dá para obter o `operator list` **sem materializar as imagens**: com worker, a leitura de um scan (n1-en-lostworld) custa ~100 ms/página só de imagem contra 1,6 ms sem worker — estoura o orçamento de 150 ms/pág antes de qualquer heurística | E0-T05 (S4) | P2 |
| (exemplo) | Detectar texto em grego e marcar `lang: "grc"` | E5 | P2 |

Notas (2026-10-04):
- O item "recompor acento destacado (LaTeX)" saiu daqui e virou a tarefa **E3-T01b** (fase E3, prioridade P1), decisão do PO.
- O item "detectar camada de texto invisível (`Tr 3`) em scans com OCR" saiu daqui e virou parte da tarefa **E1-T03** (detectores A e B), decisão do PO, registrada na **ADR-019**.
