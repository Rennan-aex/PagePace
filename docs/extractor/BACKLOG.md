# Backlog (ideias e problemas fora do escopo da tarefa atual)

Regra: ideia nova nunca entra direto no código. Anote aqui com data e contexto; o PO decide quando promover a tarefa.

| Data | Item | Origem (tarefa) | Prioridade sugerida |
|---|---|---|---|
| 2026-10-04 | Descartar `font.data` após ler `name`/métricas quando `fontExtraProperties: true` (memória: 308 MB em n4; **S4 mediu +35 MB em n4-pt e +23,5 MB em n1-en-lostworld**) — **ligado à tarefa E8-T03, sem implementar agora** | E0-T02 (S1), E0-T05 (S4) | P2 |
| 2026-10-04 | Verificar se dá para obter o `operator list` **sem materializar as imagens**: com worker, a leitura de um scan (n1-en-lostworld) custa ~100 ms/página só de imagem contra 1,6 ms sem worker — estoura o orçamento de 150 ms/pág antes de qualquer heurística | E0-T05 (S4) | P2 |
| 2026-10-04 | ~~Decidir quais assets de `standard_fonts/` entram no app~~ — **DECIDIDO pelo PO (2026-10-04): opção A, ADR-020** (copiar só os 10 `.pfb` Foxit; **não** copiar os 4 `LiberationSans*.ttf` GPLv2; render menos fiel aceito só em Helvetica não embutido). **CONCLUÍDO na E1-T02 (2026-10-05):** `scripts/copy-pdfjs-assets.mjs` (só `.pfb`/`cmaps`/`wasm`/`LICENSE_FOXIT`, com lista de proibição explícita) + teste que prova que nenhum `.ttf`/`Liberation*` sai — ver `spikes/S5-licenses.md` §3 | E0-T06 (S5) | concluído |
| 2026-10-05 | **Caixa de parágrafo inflada quando a nota de rodapé é filha do nó `P`** (rebus: `Note`/`Reference` dentro de `P` → a união das caixas dos MCID leva a nota junto; medido: **54 caixas sobrepostas em 15 das 91 páginas** com pistas, 37 pistas com altura > 200 pt, maior = 678 pt em página de 792 pt). Proposta: ao montar a caixa de um `P`, descartar os subtrees `Note`/`Footnote`/`Endnote` (que continuam virando dicas de nota em `tagHints`). Requer `add-heuristic` + avaliação, e `pnpm eval` só existe na **E1-T08** — por isso ficou aqui. Capturado na conferência visual da **ADR-028**. **Decisão do PO (2026-10-05): mantido na fila** — corrigir quando a ferramenta que mede a qualidade existir, para não piorar outra métrica sem perceber; subir para P1 antes da E2 consumir as pistas | E1-T02 | P2 (subir para P1 antes da E2 consumir as pistas) |
| 2026-10-04 | Gerar `THIRD-PARTY-NOTICES` (licenças e avisos de todas as dependências que vão ao bundle) quando o app for empacotado — Apache-2.0 exige cópia da licença, MIT exige o aviso de copyright, e o `pdfjs-dist` tem 10 arquivos de licença de ativos. Hoje não há obrigação (nada é distribuído) | E0-T06 (S5) | P2 |
| (exemplo) | Detectar texto em grego e marcar `lang: "grc"` | E5 | P2 |

Notas (2026-10-04):
- O item "recompor acento destacado (LaTeX)" saiu daqui e virou a tarefa **E3-T01b** (fase E3, prioridade P1), decisão do PO.
- O item "detectar camada de texto invisível (`Tr 3`) em scans com OCR" saiu daqui e virou parte da tarefa **E1-T03** (detectores A e B), decisão do PO, registrada na **ADR-019**.
