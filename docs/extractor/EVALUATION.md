# Avaliação

## Princípio
**Medir antes de heurística.** Toda tarefa que mexe na extração roda `pnpm eval` e compara com `packages/eval/baseline.json`.

## Métricas
| Métrica | Definição | Usada em |
|---|---|---|
| `text_cer` | Taxa de erro de caracteres entre o texto extraído (normalizado) e o gabarito | todas |
| `para_boundary_f1` | F1 das fronteiras de parágrafo (posição no fluxo de texto normalizado) | E2+ |
| `heading_f1` / `heading_level_acc` | Detecção de títulos e acerto do nível | E4+ |
| `reading_order` | Distância de edição normalizada entre a ordem de blocos extraída e a do gabarito | E2, E6 |
| `hyphen_join_acc` | Acerto de junção de palavras hifenizadas (e preservação de hifens legítimos) | E3 |
| `header_footer_f1` | Precisão/recall de remoção de cabeçalho/rodapé/numeração | E3 |
| `style_f1` | F1 por caractere de negrito e de itálico | E4+ |
| `footnote_link_acc` | Notas detectadas e ligadas à chamada correta | E5 |
| `block_kind_f1` | F1 por tipo de bloco (citação, lista, referência...) | E5+ |
| `confidence_calibration` | Correlação entre confiança e erro (blocos de baixa confiança devem ser os errados) | E7 |
| `ms_per_page` / `peak_mb` | Desempenho em Node (e, no E8, medido em Android) | E8 |

## Metas (PROVISÓRIAS: ajustadas após o baseline do E1)
| Métrica | N1 | N2 | N3 | N4 |
|---|---|---|---|---|
| `text_cer` | ≤ 0,5% | ≤ 1% | ≤ 1% | ≤ 2% |
| `para_boundary_f1` | ≥ 0,98 | ≥ 0,93 | ≥ 0,93 | ≥ 0,90 |
| `heading_f1` | ≥ 0,95 | ≥ 0,90 | ≥ 0,90 | ≥ 0,85 |
| `reading_order` | ≥ 0,99 | ≥ 0,95 | ≥ 0,95 | ≥ 0,92 |
| `hyphen_join_acc` | ≥ 0,98 | ≥ 0,95 | ≥ 0,95 | ≥ 0,95 |
| `header_footer_f1` | ≥ 0,98 | ≥ 0,95 | ≥ 0,95 | ≥ 0,92 |
| `style_f1` | ≥ 0,95 | ≥ 0,90 | ≥ 0,90 | ≥ 0,85 |
| `footnote_link_acc` | n/a | n/a | ≥ 0,90 | n/a |

## Baseline e regra de ouro
- `packages/eval/baseline.json` (versionado) guarda o resultado aceito por (documento, métrica).
- Em PR, o runner compara. **Piorou além de 0,002 absoluto = falha.** Melhorou = o PR deve atualizar o baseline (`pnpm eval --update-baseline`) junto da mudança.
- Piorar de propósito (trade-off) exige entrada em `DECISIONS.md` explicando o ganho que compensa.
- O corpus privado também é medido localmente com as mesmas regras (sem commitar resultados detalhados).

## Relatórios
`pnpm eval` imprime tabela por nível e por documento e grava `packages/eval/out/report.json` (ignorado). `pnpm eval --diff` mostra o que mudou contra o baseline.

## Testes golden de página
Para depurar, além do corpus: pares `fixture de itens brutos (JSON) → blocos esperados (JSON)` por camada, em `packages/extractor/test/fixtures/`. Eles não contêm texto com copyright (texto sintético ou domínio público).

## Testes manuais
`tests/manual/extractor-visual-checklist.md`, executada pelo humano ao fim de cada fase: abrir `pagepace inspect <pdf>` (relatório HTML/Markdown lado a lado) e conferir páginas difíceis.
