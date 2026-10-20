# "Ver original" — dados e render da tela de correção

> E7-T04 (REQ-EXT-12). A tela de correção é a **única** exceção à ADR-003: o PDF aparece só aqui, para o usuário conferir e corrigir a extração.

## O que o extrator entrega

Todo bloco do `Book` traz `origin.bbox`: **uma caixa por página** que o bloco ocupa, em pontos, coordenadas **top-left** (a mesma convenção dos itens do `RawDocument`). Cada caixa é a **união das linhas do bloco naquela página** (`packages/extractor/src/bbox.ts`, ADR-074).

- `bbox[0]` corresponde a `origin.pageFrom`, `bbox[n]` a `origin.pageTo` — blocos que atravessam a virada da página têm mais de uma caixa, em ordem de página.
- `margin_ref` (numeração marginal, ADR-065) mantém a caixa da própria linha: a união de uma linha é ela mesma.
- A caixa vem **gratuita** da extração — a tela de correção nunca reabre o PDF para "descobrir" onde o bloco está.

## A função de render

`renderPageRegion(page, target, options)` (exportada por `@pagepace/extractor`, ADR-075): recebe a página do PDF.js e um canvas, enquadra a região e desenha.

```ts
import { renderPageRegion } from "@pagepace/extractor";

// page = await pdf.getPage(...) — página do PDF.js (1-based), já em memória
const canvas = document.createElement("canvas");
canvas.width = view.clientWidth * devicePixelRatio;   // pixels do canvas, não CSS
canvas.height = view.clientHeight * devicePixelRatio;

const task = renderPageRegion(page, canvas, {
  region: block.origin.bbox?.[0] ?? null,  // null (ou omitido) = página inteira
});
await task.promise;                        // quando resolve, os pixels estão no canvas
// ao fechar a tela: task.cancel() é o cancelamento do próprio PDF.js
```

- `region` — `BBox` em pontos (o próprio `origin.bbox[i]`).
- `padding` — respiro ao redor da região em pixels do canvas (padrão 8).
- `scale` — zoom explícito (pixels por ponto); sem ele, a região **ajusta** ao alvo.
- `background` — cor de trás do papel (padrão branco).
- O alvo é **injetado**: no app é o `<canvas>`; nos testes, um stub. Nenhuma dependência nova, nada de canvas de Node.

O enquadramento puro (sem canvas) é `regionFrame(pageSize, target, options)` → `{ scale, offsetX, offsetY, clip }`, útil para sombra/moldura por trás do canvas.

## Limites conhecidos

- Página com rotação ≠ 0 é enquadrada como se não tivesse rotação (todos os PDFs do corpus têm rotação 0).
- Região degenerada (largura/altura 0) vira 1 ponto no cálculo — nunca divide por zero.
- O PDF.js roda em Web Worker no app (ADR-021); esta função recebe a `page` já carregada e só desenha.
