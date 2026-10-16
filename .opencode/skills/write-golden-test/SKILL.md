---
name: write-golden-test
description: Use para criar gabaritos (golden) e testes golden do extrator, seja de um PDF do corpus, de um PDF sintético ou de uma fixture de camada. Define formato, cobertura parcial e regras de direitos autorais.
---

# Escrever teste golden

## Dois níveis
1. **Fixture de camada** (unitário): entrada em itens brutos JSON → saída esperada em JSON, em `packages/extractor/test/fixtures/<camada>/`. Use texto **sintético** ou de domínio público.
2. **Golden de documento** (corpus): `corpus/golden/<id>.golden.json` para PDFs **públicos**. Para PDFs privados o golden vai em `$CORPUS_PRIVATE_DIR/golden/` (nunca no git).

## Formato do golden de documento (v1.0.0, ADR-036)
```json
{
  "id": "<id do manifest>",
  "schemaVersion": "1.0.0",
  "source": "synthetic | tagged | epub-pair | hand-annotated",
  "coverage": { "pages": [1, 2, 3] },
  "blocks": [
    { "kind": "heading", "level": 1, "runs": [ { "text": "..." } ], "origin": { "pageFrom": 1, "pageTo": 1 } },
    { "kind": "paragraph", "runs": [ { "text": "plain " }, { "text": "bold", "bold": true }, { "text": " italic", "italic": true } ], "origin": { "pageFrom": 1, "pageTo": 1 } }
  ]
}
```
- **`schemaVersion` é a versão do FORMATO do golden** (`GOLDEN_FORMAT_VERSION` em `packages/eval/src/golden.ts`), **não** a do `@pagepace/schema`. Major tem que bater; mudança de formato = bump + registro em `DECISIONS.md`.
- **`kind`** vem da lista fechada `BLOCK_KINDS` do `@pagepace/schema` (mesma do `Book.blocks`); **`level` 1..6 é obrigatório quando `kind = "heading"`**.
- **`bold`/`italic`** nas runs espelham `Run` do esquema — são a verdade para o `style_f1` (E4). Em bloco `heading`, **não** se marca o negrito do estilo de título (o `kind`/`level` já o dizem — ADR-058); só negrito palavra a palavra em título de corpo regular.
- **`coverage.pages`** limita a avaliação às páginas anotadas (gabarito parcial é válido e preferido para páginas difíceis): 1-based, não vazio, estritamente crescente. **Com cobertura, todo bloco precisa de `origin` dentro dela** — senão a comparação é contra texto recortado.
- **Chave desconhecida em qualquer nível = erro.** Chaves de topo são só: `id`, `schemaVersion`, `source`, `coverage`, `blocks`.
- Gravação: `serializeGolden` (2 espaços, LF, `\n` final, `coverage: null` omitido) — use-o em vez de `JSON.stringify` para o arquivo não "piscar" no git.
- Validação: `parseGolden` vive em **`@pagepace/eval`** (não no `@pagepace/schema`) — rodar o `pnpm eval` ou o `pnpm corpus:synthetic` já valida.

## Como obter a verdade
- **Sintético (preferido):** `packages/eval/src/specs.ts` + `pnpm corpus:synthetic` derivam **PDF e golden da mesma especificação** — determinístico, sem revisão manual (ADR-013). Edite a spec, não o JSON.
- **Tagged / EPUB:** converta a estrutura para o formato acima com script em `packages/eval/`, e **revise à mão** uma amostra.
- **À mão:** escolha as páginas mais difíceis (notas, colunas, citações) e anote só elas.

## Regras
- Golden de PDF com copyright **nunca** vai ao git.
- Textos de exemplo em testes/commits/PRs: trechos mínimos de domínio público ou sintéticos.
- **`\n` dentro de uma run = fim de linha visual** (layout da página, ADR-039): é o que o teste de aceite da E2-T02 conta (`goldenLinesPerPage`, ±2% por página em N1). Grave só quando souber o layout — o gerador sintético sempre grava; um golden sem nenhuma quebra de linha é **pulado** por esse teste (não é erro, só não responde à pergunta). Nunca comece nem termine uma run com `\n`.
- Todo golden precisa passar pela validação do formato (`parseGolden` do `@pagepace/eval`) **e** do esquema quando o bloco virar `Book.blocks` (`@pagepace/schema`).
