# E0 · Spikes

**Objetivo:** reduzir incertezas técnicas antes de construir. Cada spike produz um relatório curto em `docs/extractor/spikes/<id>.md` (o que foi testado, dados, conclusão, recomendação) e, se mudar algo, uma entrada em `DECISIONS.md`. Código de spike é descartável (pasta `spikes/` em branch ou `packages/extractor/spikes/`), mas **os relatórios ficam**.
**Requisitos:** REQ-EXT-17, 21 (e informa 01, 05, 15).
**Depende de:** corpus mínimo disponível (ação do PO).
**Critério de saída:** relatórios S1–S5 escritos; ADR-005 (PDF.js) confirmada ou substituída; metas de desempenho confirmadas ou ajustadas.
**Corpus:** E0-T01 foi dividida em **E0-T01a** (corpus privado, `done`) e **E0-T01b** (corpus público, `todo`). O corpus privado já existe (13 PDFs); o público é necessário a partir do E1.

## Tarefas

### E0-T01a · Corpus privado (manifest particular) · `done`
- **Objetivo:** o PO coloca PDFs pessoais fora do repo e a IA registra cada um no manifest privado com nível, idioma, features e SHA-256, sem texto do livro no git.
- **Passos:** PO define `CORPUS_PRIVATE_DIR` (ambiente e/ou `.env` na raiz) e joga os PDFs na pasta; IA lista a pasta e escreve `$CORPUS_PRIVATE_DIR/manifest.yaml` (mesmo esquema do público + campo `file`, ADR-014). `level`/`lang`/`features` saem do nome do arquivo e são provisórios.
- **Aceite:** `CORPUS_PRIVATE_DIR` lista ≥ 8 PDFs em pelo menos 4 níveis e 2 idiomas; manifest privado válido com uma entrada por PDF (`level`, `lang`, `features`, `sha256`, `visibility: private`); `pnpm check:no-pdf` verde.
- **Fora de escopo:** corpus público, gabaritos, qualquer código de extração.
- **Testes:** nenhum automatizado (arquivo fora do repo, não versionado). Revisão visual da lista no `pnpm verify` e conferência manual dos níveis com `dump-raw` na E1-T04.

### E0-T01b · Corpus público (manifest versionado + `corpus:fetch`) · `todo`
- **Objetivo:** ≥ 4 PDFs de licença aberta confirmada no `corpus/manifest.yaml`, para que o CI e qualquer máquina reproduzam o corpus sem o material do PO.
- **Entradas / dependências:** E0-T01a (formato do manifest já definido).
- **Passos sugeridos:** levantar candidatos por nível/idioma (arXiv e periódicos CC-BY para N2/N4; SciELO Livros, eduCAPES, OpenStax, Wikisource/Domínio Público, Internet Archive para N1/N3/N5) **sem baixar nada de licença duvidosa**; confirmar a licença de cada item e registrar a URL; baixar para `corpus/public/` (ignorado) e calcular o SHA-256; escrever as entradas; implementar `pnpm corpus:fetch` (E1-T05) validando o SHA-256; repetir a cobertura de CORPUS.md.
- **Aceite:** `corpus/manifest.yaml` com ≥ 4 entradas, cada uma com `source_url`, `license` e `sha256` conferidos; `pnpm corpus:fetch` em diretório limpo baixa tudo e valida os hashes; `pnpm check:no-pdf` verde.
- **Fora de escopo:** corpus privado, gabaritos, spikes.
- **Testes:** automatizado: teste do `corpus:fetch` com diretório temporário e falha proposital por hash divergente. Manual: `tests/manual/` do E0.

### E0-T02 · Spike S1: o que o PDF.js entrega · `done`
- **Objetivo:** documentar exatamente quais dados o PDF.js dá (itens de texto, `fontName`, transform, largura, `hasEOL`, estilos de fonte, `getOutline`, `getStructTree`, metadados), em Node e no navegador.
- **Passos:** script que despeja os itens de 3 PDFs (N1, N2, N3) em JSON; comparar com a página renderizada; listar o que falta (ex.: espaços, negrito).
- **Aceite:** `spikes/S1-pdfjs.md` com tabela "dado / disponível? / como obter / qualidade", exemplos reais (sem texto com copyright além de trechos mínimos) e recomendação.
- **Fora de escopo:** pipeline, heurísticas.

### E0-T03 · Spike S2: detecção de negrito/itálico · `done`
- **Objetivo:** medir quanto dá para saber de estilo só pelo nome da fonte e flags; achar os casos que exigem outra técnica (negrito simulado por contorno, fontes com nomes opacos como `F23`).
- **Aceite:** `spikes/S2-styles.md` com a taxa de PDFs do corpus em que o nome da fonte basta, exemplos de falha e proposta para o E4.
- **Resultado:** 257/257 fontes de texto decididas pelo nome (100%); só com tokens genéricos cai para 72% e erra 10.286 letras; flags do pdf.js `undefined` em 409/409; OS/2 perde 7% das fontes (subsets TeX); 1 caso de itálico simulado (107 letras); nenhum negrito por contorno.

### E0-T04 · Spike S3: cobertura de PDFs tagged · `done`
- **Objetivo:** quantos PDFs do corpus têm struct tree e se ela é confiável (comparar com o visual).
- **Aceite:** `spikes/S3-tagged.md` com contagem, exemplos bons/ruins, recomendação de como usar o sinal.
- **Resultado:** 5/15 têm `StructTreeRoot`, 4/15 têm `Marked=true`, só **3/15 têm árvore utilizável e 100% de cobertura** (n1-en-sofia, n1-en-curinga, n4-en-fisica); **1 `H1` em todo o corpus, 0 `H2`–`H6`** → não serve para títulos (E4); n1-en-lostworld = árvore vazia com `Marked=true` (falso positivo), n3-pt-filosofia = 9 nós em 2 páginas; n1-en-curinga com `Sect` dentro de `P` + 19.461 `Span` com `alt` repetido. Recomendação: usar só como **confirmação de parágrafos (E2)** e de **figuras com `bbox` (E10)**, após validação (não vazio ≥90% das páginas, sem hierarquia invertida). Feature `tagged` marcada no manifest privado nos 3 confiáveis.

### E0-T05 · Spike S4: desempenho
- **Objetivo:** medir ms/página e pico de memória em Node para um livro de ~300–500 páginas; medir em WebView/Android de entrada (emulador com limites ou dispositivo real do PO) apenas a leitura bruta com PDF.js.
- **Aceite:** `spikes/S4-performance.md` com números, método e conclusão sobre o orçamento (ARCHITECTURE, decisão 8); necessidade de worker.

### E0-T06 · Spike S5: auditoria de licenças e alternativas
- **Objetivo:** listar dependências candidatas (PDF.js, pdfkit/pdf-lib, zod/ajv, bibliotecas de segmentação) com licença, tamanho, suporte a navegador.
- **Aceite:** `spikes/S5-licenses.md` com tabela e veredito por item; ADR-005/009/013 atualizadas.

## Checklist manual do PO
- [ ] Li os relatórios S1–S5 e concordo com o veredito sobre o PDF.js.
- [ ] Os PDFs do corpus representam o que leio de verdade.

## Riscos
PDF.js insuficiente para estilos → plano B: ler operadores/fontes de mais baixo nível, ainda dentro do PDF.js (API de operator list).
