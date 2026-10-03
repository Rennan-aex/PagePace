---
name: write-golden-test
description: Use para criar gabaritos (golden) e testes golden do extrator, seja de um PDF do corpus, de um PDF sintético ou de uma fixture de camada. Define formato, cobertura parcial e regras de direitos autorais.
---

# Escrever teste golden

## Dois níveis
1. **Fixture de camada** (unitário): entrada em itens brutos JSON → saída esperada em JSON, em `packages/extractor/test/fixtures/<camada>/`. Use texto **sintético** ou de domínio público.
2. **Golden de documento** (corpus): `corpus/golden/<id>.golden.json` para PDFs **públicos**. Para PDFs privados o golden vai em `$CORPUS_PRIVATE_DIR/golden/` (nunca no git).

## Formato do golden de documento
```json
{
  "id": "<id do manifest>",
  "schemaVersion": "1.x.x",
  "source": "synthetic | tagged | epub-pair | hand-annotated",
  "coverage": { "pages": [1, 2, 3] },
  "blocks": [ { "kind": "paragraph", "runs": [ { "text": "..." } ], "origin": { "pageFrom": 1, "pageTo": 1 } } ]
}
```
`coverage.pages` limita a avaliação às páginas anotadas (gabarito parcial é válido e preferido para páginas difíceis).

## Como obter a verdade
- **Sintético:** o gerador produz PDF e golden da mesma especificação (ver E1-T07).
- **Tagged / EPUB:** converta a estrutura para o formato acima com script em `packages/eval/`, e **revise à mão** uma amostra.
- **À mão:** escolha as páginas mais difíceis (notas, colunas, citações) e anote só elas.

## Regras
- Golden de PDF com copyright **nunca** vai ao git.
- Textos de exemplo em testes/commits/PRs: trechos mínimos de domínio público ou sintéticos.
- Todo golden precisa passar pela validação do esquema (`@pagepace/schema`).
