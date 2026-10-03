# packages/

| Pacote | Papel | Fase em que ganha corpo |
|---|---|---|
| `schema` | O contrato versionado (modelo intermediário, formato bruto, overlay). Sem lógica pesada. | E1 |
| `extractor` | Pipeline PDF → modelo (ingestão, normalização, layout, semântica...). | E1–E10 |
| `segmenter` | Frases e palavras pt/en (usado pelo extrator, pelo app e pelo TTS). | trilha SEG |
| `eval` | Runner do corpus, métricas, baseline. | E1 em diante |
| `cli` | Linha de comando `pagepace` (extract, eval, inspect). | E1 em diante |

Regra de dependência: `schema` não depende de ninguém. `extractor`, `segmenter` e `eval` dependem de `schema`. `cli` depende de todos. O app (`apps/reader`) só consome `schema`, `segmenter` e o resultado do extrator.
