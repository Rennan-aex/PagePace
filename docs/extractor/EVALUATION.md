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

## Flags do runner (E1-T08, ADR-038)
| Flag | O que faz | Sai com |
|---|---|---|
| `pnpm eval` | mede e imprime a tabela | 0 (1 se algum documento falhou) |
| `pnpm eval --diff` | tabela ao lado do baseline (documento, métrica, antes, depois, delta, status) — informativa | 0 |
| `pnpm eval --ci` | o **gate**: qualquer métrica pior além de 0,002 = falha | **1** |
| `pnpm eval --update-baseline` | regrava o baseline com este run (recusa se houve erro ou nada medido) | 0 / 1 |

`--update-baseline` não combina com `--ci`/`--diff` (exit 2). Documento do baseline que não foi medido (ex.: corpus privado ausente no CI) e documento medido fora do baseline são **avisos**, não falhas. O CI roda `pnpm eval --ci` na etapa `Corpus evaluation` sempre que `packages/eval/baseline.json` existir.

## Relatórios
`pnpm eval` imprime tabela por nível e por documento e grava `packages/eval/out/report.json` (ignorado). `pnpm eval --diff` mostra o que mudou contra o baseline.

## Como o runner mede hoje (E1-T06, ADR-035)
- **Pipeline:** ingestão PDF.js → texto bruto (`pageText`/`documentText`) → normalização (`normalizeText`: NFC, sem soft hyphen, espaços colapsados) → `text_cer` = Levenshtein ÷ tamanho do gabarito.
- **Junção dos itens (E2-T03, ADR-040):** `hasEOL` → quebra de linha; lacuna horizontal > `SPACE_GAP_FACTOR` (**0,12 × o maior `fontSize` dos dois itens**) → espaço; encostado → nada; e um item que **já termina ou começa com espaço nunca ganha outro**. Antes da E2-T03 a regra era provisória (0,15 em sobre o item anterior, ADR-035).
- **Cobertura:** `coverage.pages` (1-based) recorta a extração **e** o gabarito; sem cobertura, o documento inteiro entra na medição.
- **Só mede quem tem golden:** `golden: none` sai na tabela como `no golden`. Desde a **E1-T07 (2026-10-06)** o corpus tem **5 de 24** documentos com gabarito (os 5 sintéticos `syn-*`), todos medindo **`text_cer = 0.0000`** — os primeiros gabaritos dos PDFs reais chegam com as fases E2+.
- **Códigos de saída:** 0 = sucesso (mesmo sem nada medido, com aviso) · 1 = algum documento falhou (PDF/golden ausente, SHA divergente, PDF escaneado, JSON inválido) **ou uma métrica piorou além da tolerância (`--ci`)** · 2 = opção desconhecida.
- **Flags de baseline (`--diff`, `--ci`, `--update-baseline`)** existem desde a **E1-T08 (2026-10-06)** — ver a seção "Flags do runner" acima.

## Golden e corpus sintético (E1-T07, ADR-013/036/037)
- **Formato:** `*.golden.json` com `schemaVersion` = versão do **formato do golden** (`GOLDEN_FORMAT_VERSION`, hoje `1.0.0`), `source` fechado, `blocks` com `kind` do `@pagepace/schema` e runs `bold`/`italic` (gabarito do `style_f1`). Validação em `@pagepace/eval` (`parseGolden`).
- **Gerador:** `pnpm corpus:synthetic` deriva **PDF + golden** da mesma especificação (`packages/eval/src/specs.ts`) — determinístico, sem dependência nova. O `pnpm corpus:fetch` gera o PDF sintético que faltar e confere o SHA-256.
- **5 sintéticos** (`syn-*`) cobrem N1 pt/en (parágrafos, acentos), N2 pt/en (duas colunas, negrito/itálico) e N3 en (notas de rodapé, golden parcial `coverage.pages: [2]`). Eles são **cassos controlados** (heurística nova deve dar 0 neles) e **não contam na cobertura por nível do `CORPUS.md`** — a cobertura continua sendo dos PDFs reais.

## Contagem de linhas por página (E2-T02, ADR-039)
- **Aceite da E2-T02:** em N1, o número de linhas por página deve ficar dentro de **±2% do gabarito**, conferido pelo teste `packages/eval/src/lines.test.ts` (não é métrica: não entra no `baseline.json` nem muda o `text_cer`).
- **O golden só responde quando registra o layout:** `\n` dentro de uma run = fim de linha visual (`goldenLinesPerPage` em `golden.ts`). Os 5 sintéticos registram; um golden sem nenhuma quebra é **pulado com motivo visível**, nunca adivinhado — e um teste guardião falha se nenhum documento N1 puder ser conferido.
- **Prova na sessão:** `syn-n1-en-paragraphs` 12/13 e `syn-n1-pt-acentos` 12/14 linhas nas p. 1/2 → desvio **0,00%** (limite ±2%). Em N1 reais (sem golden) a contagem foi comparada só como **evidência**, contra a referência `hasEOL+1` do pdf.js: 0,000% em `n1-en-sofia`/`n1-en-curinga`/`n1-pt-curinga`, +0,006% em `n1-pt-sofia`, −0,170% em `n1-en-rebus` — nas páginas divergentes a referência é que erra (sumário e número de página).

## Inferência de espaços (E2-T03, ADR-040)
- **Aceite da E2-T03:** `text_cer` em N1 **≤ 0,5%**, conferido por `packages/eval/src/spaces.test.ts` em **todo documento N1 com golden**, com um teste guardião que falha se nenhum N1 puder ser conferido (como na E2-T02, **não é métrica nova**: não entra no `baseline.json` nem muda o `text_cer` dos demais documentos).
- **Casos cobertos por teste:** linha **justificada** (lacunas largas e variadas sem glifo de espaço), **kerning apertado** (palavra partida em dois itens) e **itens sem espaço** (o produtor separou as palavras só por posição), mais a regra de **não duplicar** espaço existente.
- **Prova na sessão (2026-10-08):** `pnpm eval --ci` exit 0 com `text_cer = 0,0000` nos 2 N1 medidos (`syn-n1-en-paragraphs`, `syn-n1-pt-acentos`) → **nenhuma métrica mudou** (nada no `baseline.json` precisa de atualização). Como os sintéticos trazem um item por linha (0 lacunas), a evidência em **N1 reais** (sem golden) foi medida à parte: das fronteiras **sem glifo de espaço**, a regra **insere 1** (`n1-pt-sofia`: `"papai." → "FIM"`, lacuna 0,94 em) e **cola as demais** — maior caso `n1-en-curinga` **0,0872 em** em `"ment|ion"`, abaixo do limiar, palavra intacta (2.127 fronteiras sem glifo naquele livro e **nenhuma** acima do limiar — a maior medida é essa). O provisório 0,15 em criava **1.151 espaços duplos** em `n1-en-sofia` e 130 em `n3-en-scielo`, todos em fronteiras que **já tinham** espaço: a guarda nova elimina os dois números. `text_cer` não sente essa diferença (a normalização colapsa espaço repetido) — o ganho é no texto que o leitor recebe no `Book`.

## Fronteiras de parágrafo (E2-T04, ADR-041)
- **O que mede:** `para_boundary_f1` = F1 das fronteiras de parágrafo no fluxo de texto normalizado — os **blocos** do golden contra os **parágrafos** que o extrator monta (`documentParagraphs`), alinhados com janela de tolerância de **5 caracteres** (`PARA_BOUNDARY_WINDOW`). `falseCuts` = a extração cortou onde o gabarito não cortou; `falseMerges` = o gabarito cortou onde a extração juntou; os dois lados vazios valem F1 = 1.
- **Virada de página fora dos dois lados:** a fronteira que cai exatamente na virada de página **não conta nem no gabarito nem na extração** — no pé da página não sobra o espaço entre parágrafos, então nenhum sinal decide se o parágrafo continua (junção de páginas = E2-T05). Detalhe e prova na **ADR-041**.
- **Relatório de erros por documento:** o `pnpm eval` imprime sempre a seção **`Paragraph boundary errors (false cuts / false merges)`** com, por documento, os falsos cortes, as junções erradas e o F1 (o aceite da fase pedia esse relatório).
- **Na baseline:** registrada em `METRIC_DIRECTIONS` como *maior é melhor* (ADR-038) → o `pnpm eval --ci` falha se ela cair além de **0,002**, a mesma tolerância do `text_cer`. Valores hoje: **N1 1,0000** (`syn-n1-en-paragraphs`, `syn-n1-pt-acentos`) · `syn-n2-pt-estilos` 1,0000 · `syn-n3-en-footnotes` 1,0000 · **`syn-n2-en-columns` 0,0000** (3 falsos cortes + 5 junções — duas colunas intercalam até a E6; é o alvo da E6, não uma regressão).
- **Aceite da E2-T04:** `packages/eval/src/paragraphs.test.ts` roda em **todo documento N1 com golden** e exige `para_boundary_f1 ≥ 0,98` (meta de N1 da tabela acima), com um **teste guardião** que falha se nenhum N1 puder ser conferido — e a mensagem da falha já traz os falsos cortes/junções daquele documento. O teste chama `paragraphBoundaries(...)`, a mesma função que o runner mede (uma só implementação).

## Testes golden de página
Para depurar, além do corpus: pares `fixture de itens brutos (JSON) → blocos esperados (JSON)` por camada, em `packages/extractor/test/fixtures/`. Eles não contêm texto com copyright (texto sintético ou domínio público).

## Testes manuais
`tests/manual/extractor-visual-checklist.md`, executada pelo humano ao fim de cada fase: abrir `pagepace inspect <pdf>` (relatório HTML/Markdown lado a lado) e conferir páginas difíceis.
