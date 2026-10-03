# E0 · Spikes

**Objetivo:** reduzir incertezas técnicas antes de construir. Cada spike produz um relatório curto em `docs/extractor/spikes/<id>.md` (o que foi testado, dados, conclusão, recomendação) e, se mudar algo, uma entrada em `DECISIONS.md`. Código de spike é descartável (pasta `spikes/` em branch ou `packages/extractor/spikes/`), mas **os relatórios ficam**.
**Requisitos:** REQ-EXT-17, 21 (e informa 01, 05, 15).
**Depende de:** corpus mínimo disponível (ação do PO).
**Critério de saída:** relatórios S1–S5 escritos; ADR-005 (PDF.js) confirmada ou substituída; metas de desempenho confirmadas ou ajustadas.

## Tarefas

### E0-T01 · Corpus inicial e primeira lista de candidatos
- **Status:** `todo` (parte humana: PO coloca PDFs; parte IA: preparar o manifest)
- **Objetivo:** ter ao menos 10 PDFs (2+ por nível N1–N4, mistura pt/en) acessíveis aos agentes.
- **Passos:** PO define `CORPUS_PRIVATE_DIR` e coloca PDFs pessoais; IA propõe candidatos públicos (arXiv, domínio público) por nível/idioma em `OPEN-QUESTIONS.md` sem baixar nada com licença duvidosa; criar `corpus/manifest.yaml` com as entradas públicas confirmadas (sha256 calculado).
- **Aceite:** `ls $CORPUS_PRIVATE_DIR` lista os PDFs; manifest válido (YAML) com ≥ 4 públicos; `pnpm check:no-pdf` verde.
- **Fora de escopo:** gabaritos, qualquer código de extração.

### E0-T02 · Spike S1: o que o PDF.js entrega
- **Objetivo:** documentar exatamente quais dados o PDF.js dá (itens de texto, `fontName`, transform, largura, `hasEOL`, estilos de fonte, `getOutline`, `getStructTree`, metadados), em Node e no navegador.
- **Passos:** script que despeja os itens de 3 PDFs (N1, N2, N3) em JSON; comparar com a página renderizada; listar o que falta (ex.: espaços, negrito).
- **Aceite:** `spikes/S1-pdfjs.md` com tabela "dado / disponível? / como obter / qualidade", exemplos reais (sem texto com copyright além de trechos mínimos) e recomendação.
- **Fora de escopo:** pipeline, heurísticas.

### E0-T03 · Spike S2: detecção de negrito/itálico
- **Objetivo:** medir quanto dá para saber de estilo só pelo nome da fonte e flags; achar os casos que exigem outra técnica (negrito simulado por contorno, fontes com nomes opacos como `F23`).
- **Aceite:** `spikes/S2-styles.md` com a taxa de PDFs do corpus em que o nome da fonte basta, exemplos de falha e proposta para o E4.

### E0-T04 · Spike S3: cobertura de PDFs tagged
- **Objetivo:** quantos PDFs do corpus têm struct tree e se ela é confiável (comparar com o visual).
- **Aceite:** `spikes/S3-tagged.md` com contagem, exemplos bons/ruins, recomendação de como usar o sinal.

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
