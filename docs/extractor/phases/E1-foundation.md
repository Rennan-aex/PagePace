# E1 · Fundação

**Objetivo:** esquema 1.0, ingestão bruta, CLI mínima, corpus reproduzível, runner de métricas com baseline e CI com gate. Ao final, qualquer melhoria posterior é *medida*.
**Requisitos:** REQ-EXT-01, 12, 16, 17, 22.
**Depende de:** E0.
**Critério de saída:** `pnpm corpus:fetch && pnpm eval` roda no corpus público e gera `baseline.json`; CI executa o gate; `pagepace dump-raw <pdf>` funciona.

## Tarefas

### E1-T00 · Lint/format
- **Objetivo:** escolher e configurar lint/format (registrar ADR). **Aceite:** `pnpm lint` e `pnpm format:check` no CI; `pnpm verify` inclui lint.

### E1-T01 · Esquema 1.0 (`@pagepace/schema`)
- **Objetivo:** transformar o rascunho de `SCHEMA.md` em tipos TS + validadores de runtime (`RawDocument`, `Book`, `Overlay`, `Anchor`).
- **Passos:** escolher lib de validação (zod/valibot/ajv; licença e tamanho); implementar; exemplos válidos e inválidos como fixtures.
- **Aceite:** testes de validação passam; `SCHEMA_VERSION = "1.0.0"`; changelog e tag `schema-v1.0.0` registrados; ADR da escolha.
- **Fora de escopo:** lógica de extração.

### E1-T02 · Ingestão PDF.js → `RawDocument`
- **Objetivo:** adaptador que lê bytes de PDF e devolve `RawDocument` validado.
- **Aceite:** em 3 PDFs do corpus, saída valida no esquema; número de páginas confere; `source.sha256` correto; mesma entrada gera JSON idêntico (teste de determinismo).
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
- **Aceite:** `pnpm corpus:fetch` baixa os públicos do manifest para `corpus/public/`, valida SHA-256 e falha em divergência; reexecutar não rebaixa o que já está certo; mescla o manifest privado se `CORPUS_PRIVATE_DIR` existir; `pnpm eval` acha `CORPUS_PRIVATE_DIR` pelo `.env` quando a variável não está no ambiente.

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
