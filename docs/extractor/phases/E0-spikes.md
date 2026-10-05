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

### E0-T01b · Corpus público (manifest versionado) · `done`
- **Objetivo:** 4–8 PDFs de licença aberta confirmada no `corpus/manifest.yaml`, para que o CI e qualquer máquina reproduzam o corpus sem o material do PO.
- **Entradas / dependências:** E0-T01a (formato do manifest já definido).
- **Escopo (ajuste do PO, 2026-10-04):** esta tarefa **não cria o script `corpus:fetch`** — o script (e o teste de hash divergente) é da **E1-T05**. Aqui entram só o manifest versionado e o download manual único dos PDFs.
- **Passos sugeridos:** levantar candidatos por nível/idioma (arXiv e periódicos CC-BY para N2/N4; SciELO, SciELO Livros, eduCAPES, OpenStax, Wikisource/Domínio Público, Internet Archive para N1/N3/N5) **sem baixar nada de licença duvidosa**; **abrir a página oficial de cada item** e registrar a URL da página, a linha exata da licença (curta) e a data da verificação — **nunca afirmar licença de memória**; baixar cada PDF **uma única vez** com um comando simples de PowerShell para `corpus/public/` (pasta ignorada pelo git) e calcular o SHA-256; confirmar idioma, nível e features **abrindo o arquivo com os scripts de spike** (S1/S3); escrever as entradas (`golden: none`); conferir a cobertura de CORPUS.md.
- **Metas (PO, 2026-10-04):** mínimo **4**, máximo **8** PDFs; até **30 MB** cada e **100 MB** no total. Pelo menos: **1 N3 em inglês DIGITAL** (hoje só existe escaneado; sugestão: OpenStax "Introduction to Philosophy"); **1 N2 em duas colunas** (arXiv, preferindo CC BY, com URL versionada); **1 N3 ou N2 em português** (SciELO, SciELO Livros ou eduCAPES); **1 PDF com tags confiáveis** (rodar o script do S3 e aplicar os critérios do S3 §4.3); se couber: 1 N4 (OpenStax) e 1 N5 (Internet Archive).
- **Regras de licença:** ver a seção "Regras de licença" em `docs/extractor/CORPUS.md`. Se um candidato não passar, ele **não entra** e a dúvida vai para `OPEN-QUESTIONS.md`.
- **Aceite:** `corpus/manifest.yaml` com 4–8 entradas, cada uma com `source_url` direta e estável, `license` (+ URL da página oficial consultada e data da verificação), `sha256` conferido, número de páginas, nível confirmado, idioma e features; `golden: none`; nenhum arquivo PDF no git; `pnpm check:no-pdf` e `pnpm verify` verdes.
- **Fora de escopo:** o script `corpus:fetch` (E1-T05), corpus privado, gabaritos, spikes.
- **Testes:** nenhum automatizado nesta tarefa (o teste do `corpus:fetch` com hash divergente é da E1-T05). Conferência manual: baixar de novo pelo mesmo comando e comparar o SHA-256.
- **Resultado:** 4 PDFs no `corpus/manifest.yaml` (**10,5 MB no total**, todos ≤ 30 MB), cada um com licença conferida **na própria página oficial** (linha exata + data), SHA-256, páginas, nível e idioma confirmados abrindo o arquivo com `s3-structtree.mjs` + renders: `n2-en-arxiv-phobos` (N2, duas colunas confirmadas visualmente, **CC BY 4.0**, URL versionada `v1`, hifenização/equações), `n3-pt-scielo-wittgenstein` (N3 pt, coluna única, 12 notas de rodapé, **CC BY 4.0**), `n3-en-scielo-climatejustice` (N3 en digital nativo, 20 pág, notas fn1–fn7+, **CC BY 4.0**) e `n1-en-rebus-philosophy-mind` (N1 en, livro Rebus com notas por capítulo, **tagged confiável pelo S3 §4.3**: `Marked=true`, 97,9% das páginas com árvore utilizável, `INVALID=[]`, `Document`/`P` majoritários, figuras com `bbox`+`alt`). OpenStax "Introduction to Philosophy" (sugerido nas metas) foi baixado e **descartado**: **45,8 MB > limite de 30 MB** e sem notas de rodapé (não seria N3 mesmo) — o N3-en e o `tagged` saíram de outras fontes. Opcionais N4/N5 ficaram para depois (mesmo processo). `pnpm check:no-pdf` e `pnpm verify` verdes.

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

### E0-T05 · Spike S4: desempenho · `done`
- **Objetivo:** medir ms/página e pico de memória em Node para um livro de ~300–500 páginas; medir em WebView/Android de entrada (emulador com limites ou dispositivo real do PO) apenas a leitura bruta com PDF.js.
- **Aceite:** `spikes/S4-performance.md` com números, método e conclusão sobre o orçamento (ARCHITECTURE, decisão 8); necessidade de worker.
- **Resultado:** 15 PDFs (2.765 páginas) em Node: **8,90 ms/página** no caso normal (15,63 ms/pág no corpus inteiro), abertura 57–68 ms, 1ª página com render 107–813 ms, render mediana 23,9 ms/pág; pior página **2.427 ms** (n2-en-astrofisica) e bloqueio de event loop de **916 ms** sem worker. Memória: livro de 494 páginas = **178 MB RSS** (baseline 76,5 MB), mas 2 PDFs de 14/163 páginas passam de 300 MB (406/314 MB); `fontExtraProperties` custa até +35 MB. WebView (proxy: **Chromium headless com throttling 4×/6×**, dois modos): com worker **11,0 ms/pág a 6×** no livro comum e **132–139 ms/pág** no scan; sem worker **49,7 ms/pág** e 4,4× mais heap → **worker é obrigatório (E8-T03)**. **Aparelho real (Redmi Note 13, Android 15): 24,77 ms/pág com worker, 1ª página 1.198 ms** → **orçamento de 150 ms/pág e 2 s confirmados no aparelho de entrada** (§4.1/§8 do relatório). Casos extremos (scan, página de 2,4 s, memória) não medidos no aparelho → **ADR-005 segue `provisional` até o fim da E0**.

### E0-T06 · Spike S5: auditoria de licenças e alternativas · `done`
- **Objetivo:** listar dependências candidatas (PDF.js, pdfkit/pdf-lib, zod/ajv, bibliotecas de segmentação) com licença, tamanho, suporte a navegador.
- **Aceite:** `spikes/S5-licenses.md` com tabela e veredito por item; ADR-005/009/013 atualizadas.
- **Resultado:** **50 pacotes instalados (119,4 MB) = 50 conformes, 0 copyleft** (MIT 44 · Apache-2.0 3 · ISC 2 · BSD-3 1); 3 binários nativos, todos de build/teste; 45/50 com arquivo de licença. Candidatos todos aptos: geração de PDF `pdf-lib`/`pdfkit`/`jspdf` (MIT), validação `zod`/`ajv`/`valibot` (MIT), segmentação `compromise`/`sentence-splitter` (MIT; `natural` descartado por 14 dependências), Biome `MIT OR Apache-2.0` (confirma ADR-017); `mupdf` classificado **BLOQUEADA** (AGPL-3.0) valida a ADR-006; `pdf-parse` não serve (só Node). **Achado:** o `pdfjs-dist` distribui **4 fontes `LiberationSans*.ttf` sob GPLv2** para os Helvetica não embutidos — medido com `s5-fontprobe.mjs`: extração **idêntica sem elas** (24 páginas de 2 PDFs + 1 sintético), só o render muda (**1,8% dos pixels** no sintético) → **decisão do PO (2026-10-04): opção A — ADR-020**, no app só os `.pfb` Foxit (implementação na E1-T02). `Intl.Segmenter` nativo medido: parte abreviaturas (`O Sr.`, `Dra.`) → começar sem dependência. **ADR-005 → `accepted`** (condição de reabertura registrada na própria ADR: scan, página de 2,4 s e memória real Android viram critério de aceite da E8-T04); ADR-009/013/017 atualizadas com as evidências de licença.

## Checklist manual do PO
- [ ] Li os relatórios S1–S5 e concordo com o veredito sobre o PDF.js.
- [ ] Os PDFs do corpus representam o que leio de verdade.

## Riscos
PDF.js insuficiente para estilos → plano B: ler operadores/fontes de mais baixo nível, ainda dentro do PDF.js (API de operator list).
