# Avaliação

## Princípio
**Medir antes de heurística.** Toda tarefa que mexe na extração roda `pnpm eval` e compara com `packages/eval/baseline.json`.

## Métricas
| Métrica | Definição | Usada em |
|---|---|---|
| `text_cer` | Taxa de erro de caracteres entre o texto extraído (normalizado) e o gabarito | todas |
| `para_boundary_f1` | F1 das fronteiras de parágrafo (posição no fluxo de texto normalizado) | E2+ |
| `heading_f1` | Detecção de títulos (F1 por texto do título) | E4+ |
| `heading_level_acc` | Acerto do nível (1..6) dos títulos casados | E4+ |
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
| `heading_level_acc` | ≥ 0,95 | ≥ 0,90 | ≥ 0,90 | ≥ 0,85 |
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

## Ordem de leitura (E2-T06, ADR-043)
- **O que mede:** `reading_order` = `1 − edições ÷ max(blocos do gabarito, blocos extraídos)`. Cada bloco vira **um token** (seu texto normalizado) e as duas sequências são alinhadas com a mesma distância de Levenshtein do `textCer` — bloco trocado de lugar, bloco inventado e bloco faltando custam **1 edição cada**; os dois lados vazios valem 1 e só um lado com blocos vale 0. **1,0000 = o leitor vê os blocos exatamente na ordem do gabarito.**
- **Quem é a hipótese:** os **blocos do `Book`** (`buildBook`), recortados por `coverage.pages` (`origin.pageFrom` é 0-based, a cobertura é 1-based → `+1`). O lado do gabarito não é cortado: `parseGolden` já recusa bloco fora da cobertura. É o `Book` que o leitor recebe, então é a ordem que se julga — e o teste de aceite chama a **mesma função** que o runner (`blockReadingOrder`).
- **Na baseline:** registrada em `METRIC_DIRECTIONS` como *maior é melhor* → o `pnpm eval --ci` falha se cair além de **0,002**. Valores hoje: **N1 1,0000** (`syn-n1-en-paragraphs`, `syn-n1-pt-acentos` — meta 0,99) · `syn-n2-pt-estilos` 1,0000 · `syn-n3-en-footnotes` 1,0000 · **`syn-n2-en-columns` 0,1429** (duas colunas intercalam — alvo da E6, não regressão).
- **Limite conhecido (ADR-043):** a identidade do bloco é o texto, então **um bloco com texto diferente do gabarito também custa 1 edição** — granularidade `1/blocos`. Com `text_cer = 0,0000` isso não aparece; reavaliar quando o primeiro golden real chegar com erros de texto. Junção entre páginas = E3-T04, colunas = E6.
- **Aceite da E2-T06:** `packages/eval/src/reading-order.test.ts` roda em **todo documento N1 com golden** e exige `reading_order ≥ 0,99` (meta de N1 da tabela), com um **teste guardião** que falha se nenhum N1 puder ser conferido — e a mensagem da falha traz as contagens de blocos dos dois lados.

## Regiões repetidas (E3-T02, ADR-046)
- **O que mede:** `header_footer_f1` = F1 da remoção de cabeçalhos/rodapés/números de página. **Referência** = linhas brutas cujo texto o gabarito **não** guarda naquela página (as regiões repetidas nunca entram no golden); **hipótese** = as linhas que a limpeza removeu do documento. Casamento por **token** (`" texto "` exato) e, se não casar, por **trigramos** com retenção ≥ `HEADER_FOOTER_TRIGRAM_HOLD = 0,7` (linhas com < 4 caracteres só casam por igualdade exata — um "1" precisa ser "1"). Os dois lados vazios valem F1 = 1; o casamento tolerante existe para que erros de caractere (`text_cer`) não virem "missed removal" falso.
- **Onde roda:** `headerFooterRemoval(golden, document)` no runner (`eval.ts`), coluna na tabela, seção **`Repeated region removal (missed / over-removed)`** sempre no `pnpm eval`, registrada em `METRIC_DIRECTIONS` como *maior é melhor* → o `--ci` falha se cair além de **0,002**. O teste de aceite (`packages/eval/src/header-footer.test.ts`) exige **≥ 0,98** em todo N1 com golden, com **guardião `overRemoved === 0`** (remover conteúdo de verdade é proibido — a métrica pune, o guardião derruba).
- **Na baseline:** valores hoje **1,0000 nos 6 medidos** (o 6º é o sintético novo `syn-n1-pt-cabecalhos`, 4 páginas: cabeçalho corrido nas p. 2–4, número de rodapé em todas e título de capítulo 18 pt no topo da p. 1 que **tem de sobreviver**). O aceite E2-T02 (`lines.test.ts`) agora conta linhas **após** a limpeza — os cabeçalhos nunca fizeram parte do fluxo de leitura.
- **Evidência em livros reais (sem golden; contagens da sonda, `.pagepace-cache/tmp/probe-private.ts`):** 13 livros lidos (2 escaneados recusados pela ADR-018), 2.441 páginas, **8 regiões** detectadas e **459 linhas removidas**, das quais **332 são números de página recuperados como `origin.originalPageLabel`** — maior caso `n1-en-sofia` 175 (topo) e `n3-en-filosofia` 120 (rodapé); cabeçalhos corridos de verdade só em `n2-en-astrofisica` (2 assinaturas de prova editorial) e `n3-pt-filosofia2` (autor/título). **6 livros com 0 regiões** — o comportamento conservador é intencional (protege títulos e blurbs; REGUA: nunca remover conteúdo de verdade).
- **Limite conhecido (ADR-046):** a limpeza roda **uma vez por entrada** (invariante testada: alimentar o documento limpo de novo não remove nada). Em `n3-pt-filosofia2` um segundo passe ainda acharia 1 região residual (a 2ª assinatura descoberta sobe para a 1ª linha após a remoção) — iterar até o fixpoint muda a ordem dos blocos e exigiria reavaliar `reading_order`; decidido ficar em 1 passe.

## Hifenização de fim de linha (E3-T03, ADR-047)
- **O que mede:** `hyphen_join_acc` = parcela dos **sítios de hífen de fim de linha** em que a palavra que a extração produziu é palavra que o gabarito guarda. Um **join errado** (`guardachuva`) e um **keep errado** (`pala-vra`) falham no mesmo teste de pertinência, e um join certo (`palavra`) ou um keep certo (`guarda-chuva`) passam — **uma regra só pontua as duas direções**. O lado do gabarito é a bolsa de seus tokens com pontuação das bordas tirada (`palavra,` → `palavra`), então uma vírgula depois da palavra nunca esconde um join certo. Sítio sem decisão não conta: hipótese vazia vale 1.
- **Quem decide:** `hyphenJoinDecision(left, right)` em `packages/extractor/src/hyphen.ts`, na ordem — **dígitos** de qualquer lado mantêm (faixas `1998-2004`); **léxico pequeno pt/en** mantém (`guarda-chuva`, `well-known`); **ênclise pt** mantém (`disse-lhe`); **maiúscula depois do hífen** mantém mas fica **incerta** (`Ex-Ministro` → bloco com `flags: ["uncertain-hyphen"]` e confiança `0,7`); senão **junta e apaga o hífen**. Sítio = linha termina em `-` precedido de letra/dígito e a próxima começa com letra/dígito; soft hyphen (U+00AD) não é sítio. **A junção não cruza página** (E3-T04).
- **Onde roda:** o texto do parágrafo no `Book` e o `documentText` do eval passam pela mesma junção (`paragraphHyphenText` / `joinHyphenatedText`) — `text_cer` mede o fluxo do leitor, como na E3-T02. Runner: `hyphenJoinAccuracy(golden, document)` no `eval.ts` (o teste de aceite chama a **mesma função**), coluna na tabela, seção **`Hyphen joins (wrong / uncertain)`** sempre no `pnpm eval`, `METRIC_DIRECTIONS` = *maior é melhor* → o `--ci` falha se cair além de **0,002**.
- **Na baseline:** valores hoje **1,0000 nos 7 medidos** — o 7º é o sintético novo `syn-n1-pt-hifenizacao` (11 sítios, todos decididos como o gabarito escreve; 1 incerto `Ex-Ministro`, reportado na seção). O gerador sintético ganhou o **marcador U+00AD** no texto da spec: quebra a linha **imprimindo `-`** (a menos que o texto já termine em `-`, que é o hífen legítimo escrito à mão) e **some do golden** — a mesma string escreve o PDF quebrado e a palavra do leitor. Sem `\n` na spec de propósito: o golden não registra layout (ADR-039) e o teste de contagem de linhas de lado.
- **Aceite da E3-T03:** `packages/eval/src/hyphen.test.ts` roda em **todo documento N1 com golden** e exige **`hyphen_join_acc ≥ 0,98`** (meta de N1 da tabela), com **`=== 1` no sintético de hifenização** e um **teste guardião** que falha se nenhum N1 puder ser conferido — a mensagem da falha traz quantos sítios estavam errados e quantos incertos. Os casos pt/en das regras (juntar, léxico, ênclise, dígitos, incerto, não-sítio) vivem em `packages/extractor/src/hyphen.test.ts`.
- **Limite conhecido (ADR-047):** sem dicionário, `no-`+`me` e `dá-`+`me` são indistinguíveis — os léxicos são minúsculos de propósito e a dúvida que sobra é **marcada** (`uncertain-hyphen` + confiança 0,7), não silenciada. Junção entre páginas = E3-T04; palavra partida mais de uma vez no meio do parágrafo conta um sítio por quebra.

## Títulos e níveis (E4-T02, ADR-055)
- **O que mede:** `heading_f1` = F1 do casamento por **texto normalizado** entre os blocos `heading` que o `Book` emite e os que o gabarito declara; `heading_level_acc` = parcela dos títulos casados cujo **nível (1..6) também coincidiu**. Um título inventado é falso positivo, um do gabarito não achado é falso negativo, um achado no nível errado é só erro de nível (`heading_f1` continua 1). Dois lados vazios valem 1 (nada a achar, nada inventado).
- **Quem decide:** `detectHeadings(paragraphs, context)` em `packages/extractor/src/headings.ts` — **porta** (≤ `HEADING_MAX_LINES` 3 linhas, nunca menor que o corpo, colado na margem, não itálico-majoritário, não legenda) **e** ao menos um **sinal de exibição**: fonte ≥ `HEADING_SIZE_FACTOR` 1,2 × corpo, negrito ≥ `HEADING_BOLD_SHARE` 0,6, centralizado (≤ `HEADING_CENTER_TOLERANCE` 0,03 da medida), numeração (`1.2`, `Capítulo 3`) ou **linha curta isolada** (≤ 0,7 da medida, com folga ≥ 1,5 × entrelinha dos dois lados e que **não termina frase** — `endsSentence`). Linha que abre como item de lista (`1.`, `•`) precisa do tamanho ou do peso sozinhos. **Nível = cluster de tamanhos de fonte** dos títulos do livro (maior = 1, cada cluster menor = +1, teto `HEADING_MAX_LEVEL` 6); **sem evidência de tamanho** (todos iguais) o nível cai para a **ordem de leitura** (1º = nível 1) — **ADR-055**.
- **Onde roda:** `buildBook` passa as medidas de cada página (`pageMeasureOf`) e as estatísticas do corpo para `detectHeadings`; cada parágrafo vira `kind: "heading"` com `level` ou continua `paragraph`. Runner: `blockHeadingDetection(golden, document, coverage)` no `eval.ts` (a hipótese é o `buildBook` cortado por `coverage.pages`, igual a `blockReadingOrder`; o **teste de aceite chama a mesma função**), coluna `heading_f1` na tabela, seção **`Heading detection (false positives / missed / wrong level)`** sempre no `pnpm eval`, `METRIC_DIRECTIONS` = *maior é melhor* para as duas → `--ci` falha se cair além de 0,002.
- **Na baseline:** `heading_f1` **1,0000 em 6 dos 7 medidos** e **0,0000 em `syn-n2-en-columns`** (o título vive em duas colunas intercaladas — alvo da E6, como `para_boundary_f1`/`reading_order`; o relatório reporta `missed "Notes on Light"` e **nenhum falso positivo em nenhum documento**). `heading_level_acc` acompanha (1,0000 em 6, 0 no de colunas) — inclusive `syn-n3-en-footnotes`, cujo gabarito espera o nível 2.
- **Aceite da E4-T02:** `packages/eval/src/headings.test.ts` roda em **todo documento N1 com golden** e exige **`heading_f1 ≥ 0,95` e `heading_level_acc ≥ 0,95`** (metas de N1 da tabela), com um **teste guardião** que falha se algum N1 não tiver título no gabarito (dois lados vazios dariam 1) — a mensagem da falha já lista falsos positivos, perdidos e níveis errados. Os casos de cada sinal vivem em `packages/extractor/src/headings.test.ts`.
- **Limite conhecido (ADR-055):** o nível por ordem de leitura só aparece quando **todos** os títulos têm o mesmo tamanho, e aí a hierarquia real fica de fora (os bookmarks do PDF, resolvidos pela E4-T03, é o plano); `1. Introduction` no corpo é lido como item de lista; título no pé de página pode ser engolido pela junção E3-T04; a medida é de coluna única (E6).

## Estilo do título vs texto original em títulos (E4-T05, ADR-058)
- **O que garante:** as runs de um bloco `heading` não carregam o negrito do **estilo de título** — `kind` + `level` já dizem que o bloco é de exibição, e o negrito ali duplicaria a semântica. Quem decide é `headingRuns(runs)` em `packages/extractor/src/runs.ts`: share de negrito dos caracteres **não-espaço** ≥ `HEADING_BOLD_SHARE` 0,6 (o mesmo peso que na E4-T02 marca um título em negrito) → nenhum run sai com `bold` e os vizinhos deixados plain pela remoção fundem; abaixo do limiar o negrito **palavra a palavra** fica (ênfase do texto original); `italic`/`sup`/`sub` nunca são tocados.
- **Medição (sonda do corpus, 24 documentos):** dos **1.151 títulos detectados**, **155** tinham negrito-majoritário (estilo de título — todos sem `bold` nas runs) e **4** têm negrito palavra a palavra em título de corpo regular (preservados, shares 0,28–0,57). `style_f1` e a baseline **intocadas**: nenhum gabarito marca negrito de estilo de título em cabeçalho (convenção da ADR-058 — o gabarito espelha o contrato; os sintéticos já nascem assim).
- **Limite conhecido (ADR-058):** dentro de um título negrito-majoritário o fragmento **não-negrito** não pode ser expresso (o schema não tem flag "regular") — o leitor recebe o título inteiro no peso do `kind`/`level`; revisar se um gabarito real precisar de negrito-majoritário dentro de um título.

## Testes golden de página
Para depurar, além do corpus: pares `fixture de itens brutos (JSON) → blocos esperados (JSON)` por camada, em `packages/extractor/test/fixtures/`. Eles não contêm texto com copyright (texto sintético ou domínio público).

## Testes manuais
`tests/manual/extractor-visual-checklist.md`, executada pelo humano ao fim de cada fase: abrir `pagepace inspect <pdf>` (relatório HTML/Markdown lado a lado) e conferir páginas difíceis.
