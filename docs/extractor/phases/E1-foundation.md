# E1 · Fundação

**Objetivo:** esquema 1.0, ingestão bruta, CLI mínima, corpus reproduzível, runner de métricas com baseline e CI com gate. Ao final, qualquer melhoria posterior é *medida*.
**Requisitos:** REQ-EXT-01, 12, 16, 17, 22.
**Depende de:** E0.
**Critério de saída:** `pnpm corpus:fetch && pnpm eval` roda no corpus público e gera `baseline.json`; CI executa o gate; `pagepace dump-raw <pdf>` funciona.

## Tarefas

### E1-T00 · Lint/format e versão do Node · `done`
- **Objetivo:** escolher e configurar lint/format (registrar ADR) e **alinhar a versão do Node** usada no projeto.
- **Versão do Node (pedido do PO, 2026-10-04):** hoje os spikes mediram em **Node 24**, o `engines` do `package.json` diz `>=20`, **não existe `.nvmrc`** e o workflow de CI (`ci.yml`) roda **Node 20**. Escolher **uma** versão e fazer os quatro apontarem para ela: `.nvmrc`, `engines` do `package.json`, `ci.yml` (`node-version`) e a versão citada nos relatórios/scripts.
- **Aceite:** `pnpm lint` e `pnpm format:check` no CI; `pnpm verify` inclui lint; **o CI passa na versão do Node escolhida** (`.nvmrc` = `engines` = `node-version` do `ci.yml`).
- **Resultado (2026-10-05):** **Biome `2.5.15`** instalado (devDependency da raiz, `MIT OR Apache-2.0` — ADR-017 confirmada no S5) e configurado em **`biome.json`** (preset `recommended`, formatter 2 espaços/100 colunas/aspas duplas/LF; fora de propósito: `packages/extractor/spikes`, `.pagepace-cache`, `.opencode`, `corpus`, `*.md`). Scripts novos: **`pnpm lint`** = `biome check .`, **`pnpm format`** = `biome format --write .`, **`pnpm format:check`** = `biome format .`; o **`pnpm verify` agora roda typecheck → lint → format:check → testes → check:no-pdf** e o `ci.yml` ganhou as etapas `pnpm lint` e `pnpm format:check`. Primeira passada corrigiu 6 arquivos (só ordenação de imports). **Node 24** alinhado nos quatro apontamentos (**ADR-022**): `.nvmrc` = `24.18.0`, `engines.node` = `>=24`, `ci.yml` com `node-version-file: .nvmrc` (fonte única), README com "Node 24+" — e confirmado que **Node 20 está em EOL desde 2026-04-30** (cronograma oficial do nodejs/release). **ADR-017 → `accepted`** e **ADR-009 → `accepted`** (ferramental fechado). `pnpm verify` verde.

### E1-T01 · Esquema 1.0 (`@pagepace/schema`) · `done`
- **Objetivo:** transformar o rascunho de `SCHEMA.md` em tipos TS + validadores de runtime (`RawDocument`, `Book`, `Overlay`, `Anchor`).
- **Passos:** escolher lib de validação (zod/valibot/ajv; licença e tamanho — decisão do PO, 2026-10-04: **escolher na própria E1-T01**, sem decidir antes); implementar; exemplos válidos e inválidos como fixtures.
- **Árvore de tags (pedido do PO, 2026-10-04):** **não persistir a árvore de tags crua no `RawDocument`** (campo `structTree` não guarda a árvore do PDF). Guardar **só** o que o S3 §4 recomenda: **pistas normalizadas de parágrafo** (nós `P` como confirmação) e **`bbox` de figura** (`Figure`), depois de descartar `Span`/`alt` repetido, `Art`/nós sem `role` e `Link`. Marcar o documento como **"tagged confiável"** só quando passar na validação do **S3 §4.3** (`MarkInfo.Marked = true`; árvore não vazia em ≥ 90% das páginas com texto; sem hierarquia invertida e `P`/`Sect` majoritários; sem papéis não-padrão relevantes).
- **Aceite:** testes de validação passam; `SCHEMA_VERSION = "1.0.0"`; changelog e tag `schema-v1.0.0` registrados; ADR da escolha; fixture com árvore crua/ruim **não** vaza para o `RawDocument` (só as pistas normalizadas).
- **Fora de escopo:** lógica de extração.
- **Resultado (2026-10-05):** validador escolhido **`zod@4.6.5`** (MIT, 5,9 MB, 0 dependências — **ADR-024**). `packages/schema` virou a fonte de verdade: `version.ts` (`SCHEMA_VERSION = "1.0.0"`, `KNOWN_WARNING_CODES = ["ocr-text-layer"]`), `common.ts`, `errors.ts` (`SchemaValidationError`, `parseWith`/`safeParseWith` — chaves desconhecidas viram um issue por chave, com caminho), `raw.ts`, `book.ts`, `overlay.ts` (`CorrectionOp` como união discriminada por `op`), `fixtures.ts` (5 válidas + **21 inválidas**) e `index.ts` (helpers `parseRawDocument`/`parseBook`/`parseOverlay`/`parseAnchor`). Interfaces **escritas primeiro** e schemas anotados como `z.ZodType<T>`: se validador e tipo divergirem, o `tsc` falha. **`structTree` não existe** (ADR-025): só `tagHints` com `reliable`/`paragraphs`/`figures`, objetos estritos rejeitam qualquer chave extra; teste dedicado prova que árvore crua não vaza nem em `RawDocument` nem em `Book`. `packages/schema/package.json` version = `1.0.0`. **33 testes** no `index.test.ts`, `pnpm verify` verde. **Pendência pós-merge:** tag `schema-v1.0.0` (evolve-schema) — só depois do merge na `main`.

### E1-T02 · Ingestão PDF.js → `RawDocument`
- **Objetivo:** adaptador que lê bytes de PDF e devolve `RawDocument` validado.
- **Versão fixa (pedido do PO, 2026-10-04):** **fixar a versão EXATA do `pdfjs-dist`** no `package.json` (sem `^` nem `~`; ex.: `6.4.299`) e criar um **teste de fumaça** que **falhe se a API mudar** (chama `getDocument`/`getTextContent`/`getMarkInfo`/`page.getStructTree` e confere os tipos esperados).
- **Notas de API obrigatórias (armadilhas do S1 §5 e do S3):** (1) `getMarkInfo()` devolve um **`Map`**, não objeto; (2) a árvore de tags é **`page.getStructTree()` por página** — `pdf.getStructTree()` não existe em v6; (3) destruir com **`task.destroy()`** (`pdf.destroy()` não existe em v6); (4) `standardFontDataUrl`, `cMapUrl` e `wasmUrl` em Node precisam de **caminho de arquivo puro** (URL `file://` falha); (5) `fontExtraProperties: true` só no `getDocument` e segura `font.data` na memória (descartar depois, E8-T03); (6) prefixo de subset `XXXXXX+Nome` cortado antes de inferir família/estilo.
- **Assets de fonte (ADR-020):** ao copiar os assets para o app, incluir **só os `.pfb` Foxit** e **não** copiar os 4 `LiberationSans*.ttf` (GPL).
- **Aceite:** em 3 PDFs do corpus, saída valida no esquema; número de páginas confere; `source.sha256` correto; mesma entrada gera JSON idêntico (teste de determinismo); **com um PDF sintético Helvetica não embutido, comparar posição `(x, y)` e largura de cada item com e sem as fontes padrão do PDF.js: a diferença deve ser desprezível ou ficar registrada como aviso** (o S5 só mediu contagem de itens/caracteres/pixels, e a inferência de espaços da E2-T03 depende da largura); teste de fumaça da API verde.
- **Detalhe:** leitura de arquivo só no CLI; o adaptador recebe `Uint8Array`.

### E1-T03 · Detecção de PDF escaneado/sem texto **e** de camada OCR invisível (ADR-018 + ADR-019)
Dois detectores, dois estados distintos (decisão do PO, 2026-10-04):
- **Detector A — "0 itens de texto" (ADR-018):** detectar PDF sem camada de texto, **não tentar extrair** (não montar `RawDocument` vazio) e emitir a mensagem exata `PDF escaneado: leitura exige OCR, ainda não disponível`; nenhum crash. Estado no app: **"sem texto: aguardando OCR"** (o livro fica na biblioteca e não abre; parte do app, fora desta tarefa).
- **Detector B — texto invisível `Tr 3` (ADR-019):** medir, por página/documento, a fração de caracteres com render mode invisível (`Tr 3`). Se a **maior parte dos caracteres** das páginas for invisível, o documento recebe o aviso **`ocr-text-layer`** e a extração **continua normalmente** sobre o texto existente, com três restrições: **confiança mais baixa** (`extraction.avgConfidence` reduzido e `flags`/`warnings` registrando o motivo), **negrito/itálico ignorados** (a camada de OCR não traz estilo confiável — runs saem sem `bold`/`italic`) e o **app avisa o usuário de que o texto pode ter erros**. Estado no app: **"texto de OCR embutido: leitura com aviso"** (o livro abre e é legível).
- A E9 (OCR próprio) **não** muda de prioridade ou escopo por causa desta tarefa (decisão do PO, 2026-10-04).
- **Aceite:** fixture sem camada de texto (ex.: `n5-pt-astrofisica`) → CLI mostra a mensagem da ADR-018 e não gera JSON de livro; fixture com camada OCR invisível (ex.: `n1-en-lostworld`, `n3-en-filosofia`) → CLI gera livro **com** o aviso `ocr-text-layer`, sem `bold`/`italic` e com confiança reduzida; PDF digital normal → nenhuma mudança; **um teste de CI para cada detector**. (REQ-EXT-22)

### E1-T04 · CLI mínima
- **Aceite:** `pnpm pagepace dump-raw <pdf> [--pages 1-5]` escreve JSON; `--help` funciona; erro claro para arquivo inexistente.

### E1-T05 · Corpus: manifest + `corpus:fetch`
- **Passos:** o script resolve `CORPUS_PRIVATE_DIR` lendo primeiro a variável de ambiente e, se ela não existir, o arquivo `.env` na raiz do repositório (sem dependência nova: parser de `KEY=VALUE` mínimo, `.env` já está no `.gitignore`). Sem as duas fontes, seguir só com o corpus público e avisar uma vez, sem falhar.
- **Cache no CI (pedido do PO, 2026-10-04):** o workflow deve guardar `corpus/public/` em cache com **`actions/cache`**, com **chave baseada no `corpus/manifest.yaml`** (ex.: hash do arquivo) para não rebaixar a cada execução.
- **Aceite:** `pnpm corpus:fetch` baixa os públicos do manifest para `corpus/public/`, valida SHA-256 e falha em divergência; reexecutar não rebaixa o que já está certo; mescla o manifest privado se `CORPUS_PRIVATE_DIR` existir; `pnpm eval` acha `CORPUS_PRIVATE_DIR` pelo `.env` quando a variável não está no ambiente; CI usa `actions/cache` em `corpus/public/` com chave derivada do manifest.

### E1-T06 · Runner de avaliação + métrica `text_cer`
- **Objetivo:** `@pagepace/eval` roda o pipeline (por ora só ingestão + texto bruto concatenado) em cada documento do corpus com gabarito e calcula `text_cer`.
- **Aceite:** `pnpm eval` imprime tabela por nível/documento; funciona com corpus só público; testes unitários da métrica (casos conhecidos).

### E1-T07 · Formato golden + primeiros gabaritos sintéticos
- **Objetivo:** definir `*.golden.json` (parcial ou total, `coverage.pages`) e gerar 3–5 PDFs sintéticos a partir de uma especificação (ADR-013).
- **Aceite:** gerador determinístico; PDFs sintéticos entram no corpus (gerados em `corpus/public/synthetic/`, ignorados; o gerador e as especificações são versionados); golden correspondente em `corpus/golden/`.

### E1-T08 · Baseline e gate de CI
- **Aceite:** `pnpm eval --update-baseline` gera `packages/eval/baseline.json`; `pnpm eval --ci` falha se alguma métrica piora > 0,002; o workflow `ci.yml` passa a executar o gate; teste que prova que uma piora forçada falha.

## Checklist manual do PO
- [ ] `pnpm corpus:fetch` em máquina limpa reproduz o corpus.
- [ ] Vi o primeiro relatório de métricas e entendi as colunas.

## Riscos
Esquema 1.0 mal fechado causa migrações cedo: manter campos opcionais para o que ainda é incerto.
