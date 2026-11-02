# Fluxo do PDF escaneado: detectar → perguntar → processar com progresso

> E9-T04 (REQ-EXT-22 + ADR-018/ADR-098). Este é o contrato do app: o extrator exporta as peças, a CLI (`pnpm pagepace extract --ocr`) é a implementação de referência e o `packages/app` (ainda não existe) deve seguir este fluxo quando for implementado.

## 1. Detectar

Antes de tentar extrair (e antes de perguntar qualquer coisa), o app testa se o PDF tem camada de texto:

```ts
import { isScannedPdf } from "@pagepace/extractor";

const scanned = await isScannedPdf(bytes);          // true = sem texto, é scan
```

- Probe barato: abre o PDF com pdf.js, conta caracteres de texto (`documentHasText`) e fecha — mesmo veredito do `ScannedPdfError` que a ingestão lançaria depois (ADR-018).
- `RangeError` em bytes vazios. Com `assets` opcional (wasm/cmaps) o veredito também vale para páginas JBIG2/JPX.
- Sem o probe, o app ainda descobre o scan na ingestão (`ScannedPdfError`) — mas tarde demais para mostrar a pergunta antes de começar o trabalho.

## 2. Perguntar ao usuário

O livro escaneado **sem** camada de texto não deve entrar na biblioteca com o selo "aguardando OCR" sem antes perguntar (ADR-018; estados em `PROJECT.md`):

- **"Reconhecer o texto agora (OCR)"** → vai para o passo 3, em segundo plano com barra de progresso.
- **"Deixar para depois"** → o livro entra na biblioteca com o selo **"sem texto: aguardando OCR"** e não abre para leitura até o usuário disparar o OCR depois (mesma tela, botão "Reconhecer texto").
- PDF escaneado **com** camada OCR embutida (`isScannedPdf` = false) **não pergunta**: abre normalmente com o aviso `ocr-text-layer` (ADR-019/ADR-096).

A CLI não tem interface: sem `--ocr` ela sai com código 3 e a dica `SCANNED_OCR_HINT`; com `--ocr` ela não pergunta e processa (é o análogo de "o usuário já optou").

## 3. Processar em segundo plano, com progresso

O trabalho pesado roda **fora da tela** (Web Worker no app; processo da própria CLI no PC) e reporta página a página. O orquestrador é o `ingestOcrFlow` (núcleo portável, ADR-098):

```ts
import { createTesseractOcrEngine, ingestOcrFlow, OCR_RENDER_SCALE } from "@pagepace/extractor";

const engine = createTesseractOcrEngine({ langPath, gzip, cachePath }); // modelos locais, nunca CDN
try {
  const raw = await ingestOcrFlow({
    fileName, sha256, pageCount,
    engine,
    renderPage,                                     // injetado: pdf.js + <canvas> do app
    onProgress: ({ page, total }) => setBar(page / total), // 1 página reconhecida = 1 evento
  });
  // raw tem ingest.adapter = "ocr" e source.ocrTextLayer = true (ADR-096)
} finally {
  await engine.close();                             // quem cria, fecha (ADR-095)
}
```

O que cada lado faz:

| Lado | Responsabilidade |
|---|---|
| App (worker) | `renderPage(pageIndex)`: pdf.js desenha a página em `<canvas>` a `OCR_RENDER_SCALE` (2), devolve PNG + dimensões + raster de luminância (BT.601) para o estilo visual (E9-T03/ADR-097). |
| `ingestOcrFlow` | Sequencia render → reconhecer → coletar, na ordem das páginas; chama `onProgress({ page, total })` **depois** de cada página pronta; monta o `RawDocument` validado. |
| `createTesseractOcrEngine` | Worker único reutilizado (frio ~300 ms, quente 1,5–2,9 s/página no PC), `por+eng` `best_int`, `langPath` obrigatório. |
| `buildBook(document)` | Pipeline inalterado: confiança 0,5, warning `ocr-text-layer`, estilo estimado habilitado (ADR-096/097). |

## 4. Progresso e estados da tela

- **Barra:** `onProgress` emite `{ page, total }` por página reconhecida — nunca por cento estimado (o custo por página varia; medir é mais honesto que prever).
- **Título:** "Reconhecendo texto — página N de M"; **cancelar** = abortar o worker e manter o selo "aguardando OCR".
- **Concluído:** o livro sai do selo e abre para leitura, já com o aviso de que o texto pode ter erros (é OCR).
- **Falha** (modelos ausentes, memória): volta ao selo "aguardando OCR" com a mensagem de erro; nada é gravado pela metade.

## 5. Cache: OCR paga uma vez

O resultado entra no mesmo cache de extração do PDF digital (ADR-089, `--cache-dir` na CLI): a chave é `(sha256, versão do extrator, versão do schema)`. A segunda abertura do mesmo arquivo **não refaz o OCR** — é servida do cache, idêntica byte a byte. Trocar heurística/esquema invalida sozinha (muda a chave).

## 6. Referência funcional (CLI)

```powershell
# sem --ocr: recusa com código 3 + dica (comportamento da ADR-018, intacto)
pnpm pagepace extract livro.pdf

# com --ocr: detecta, renderiza escala 2, reconhece página a página,
# imprime "OCR: página N de M reconhecida" no stderr e o Book no stdout
pnpm pagepace extract livro.pdf --ocr

# modelos de uma pasta própria (opcional; padrão: @tesseract.js-data → .pagepace-cache/ocr-lang/)
pnpm pagepace extract livro.pdf --ocr --tessdata "C:\modelos\tessdata"
```

Arquivos da implementação: `packages/cli/src/ocr.ts` (render + modelos), `packages/cli/src/index.ts` (`runOcrFlow`), `packages/extractor/src/ingest/ocr-flow.ts` (orquestrador), `packages/extractor/src/ingest/pdfjs.ts` (`isScannedPdf`). Decisão: **ADR-098**.

## Limites conhecidos

- Sem `--ocr`, PDF escaneado continua sendo recusa (exit 3) — nenhum caminho automático silencioso (regra da ADR-018: o usuário opta).
- O app precisa empacotar/baixar os `.traineddata` como assets estáticos (sem CDN); no PC as devDependencies já trazem os modelos.
- `ocrTextLayer = true` faz o pipeline tratar tudo como OCR (confiança 0,5, sem negrito/itálico embutido); o estilo do scan vem da heurística E9-T03, não do PDF.
- Páginas em branco de scans legítimos continuam sendo reconhecidas como brancas (nada de "pular página" automático — seleção de páginas a pular é manual, decisão de produto).
