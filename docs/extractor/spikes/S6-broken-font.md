# S6 · Fonte quebrada em letras comuns (spike da BACKLOG linha 26)

**Data:** 2026-10-26 · **Status:** concluído · **Scripts:** `packages/extractor/spikes/s6-broken-font-probe*.ts` (8 descartáveis, commitados para reprodução) · **Saídas brutas:** `.pagepace-cache/tmp/` (PNGs/gitignored — nunca commitar) · **Decisão:** ADR-084.

## 1. Método

- `pdfjs-dist@6.4.299` (o mesmo da ingestão): glifos lidos do `page.getOperatorList()` (`glyph.originalCharCode` × `glyph.unicode`), nomes reais via `page.commonObjs` com `fontExtraProperties`.
- ToUnicode do próprio PDF: varredura dos streams com `node:zlib` (bfchar/bfrange), sem dependência nova — é a resposta ao "o que o Calibre emitiu".
- Render (`@napi-rs/canvas`, receita do S1): recorte da região de um item para ver o glifo real (prova visual).
- Varredura do corpus: 13 digitais privados + 4 públicos no nível caractere e no pipeline do extrator (bloco), mais os 12 sintéticos. Só medição — nenhuma heurística nova foi criada (aceite do pedido).

## 2. Achado 1 — n1-pt-sofia (Calibre 1.26.0): o erro está no PDF

- Render p4: "Sofia" e "final" aparecem **corretos** (ligaduras fi/fl visíveis); a camada de texto lê "Soàa"/"ànal" — glifo certo, codificação errada.
- ToUnicode gravado pelo Calibre está incompleto e trocado — Palatino (CMap obj 22, 107 pares): `U+00C6 → "à"`, `U+00C3 → "á"`, `U+0020 → "?"`, `U+008E → "æ"`; só **24 de 128** códigos em 0x80–0xFF têm entrada. Os pares de Cambria (CMaps obj 61–70) repetem o padrão (`U+009D → "à"`, `U+009E → "á"`, `U+01EB → "?"`).
- Códigos sem entrada no ToUnicode (0xE0/0xE1 — justamente os slots das ligaduras na codificação do subconjunto) caem na codificação padrão do pdf.js: byte `0xE0 → "à"`, `0xE1 → "á"`.
- **Consequência:** as letras trocadas estão no próprio PDF; qualquer extrator que leia ToUnicode/encoding emite o mesmo texto errado e "fi" não é recuperável por extração. Não é bug do pdf.js e não há como consertar no nosso lado — só **sinalizar**.

## 3. Achado 2 — o "?" do n4 é má-diagnóstico

- 30 itens "?" avulsos em 29 páginas de `n4-pt-astrofisica` são **perguntas legítimas** (renders p22/p66/p190 mostram "?" real no fim de questão, no formato "…? Solução:").
- A citação "F (d) ? F (R)" **não existe** em nenhum dos 2 PDFs n4 nem em nenhum dos 5 relatórios inspect (busca exata e flexível: 0 ocorrências) — má-transcrição da análise de 2026-10-22.
- Um sinal baseado em "?" quebraria ~30 blocos legítimos do n4 → **descartado**. Os 2 blocos do n4 que o `brokenFontSignal` atual já marca continuam sendo os PUA antigos (E3-T05), outra classe.

## 4. Medição do sinal candidato (à interno: letra + à + letra)

O "à" nunca ocorre dentro de palavra em português (crase é palavra própria) nem em inglês/francês/espanhol do corpus.

| documento | chars "à" interno | blocos ≥ 1 | blocos ≥ 3 | ≥ 3 **e** share 5% |
|---|---:|---:|---:|---:|
| n1-pt-sofia | 925 | 686 | **44** | 0 |
| n1-pt-curinga | 1 (digitação humana: "atràs") | 1 | 0 | 0 |
| outros 15 digitais | 0 | 0 | 0 | 0 |
| 12 sintéticos | 0 | 0 | 0 | 0 |

- `brokenFontSignal` atual (FFFD/PUA): **0** blocos no sofia — a classe passa despercebida, conf 0.90.
- O **share 5%** da regra atual nunca dispara nem no sofia (o "à" é raro dentro do parágrafo) — o gate de share **não** serve para essa classe; só o piso ≥ 3 basta e já zera todos os FPs.
- "fl"→"á" não é separável do "á" legítimo do português (centenas a milhares de hits legítimos nos pt; "á" interno em inglês = 1–3 nomes espanhóis legítimos, abaixo de qualquer piso) — mas o mesmo bloco/documento já é sinalizado pelo "à".

## 5. Recomendação de planejamento (virar tarefa depois — nada aqui é heurística)

1. **Sinal novo** (classe distinta da FFFD/PUA): ocorrências de "à" interno por bloco, **piso ≥ 3, sem gate de share**; agregação documental (≥ N blocos sinalizados) para o aviso em `extraction.warnings`.
2. FP medido: **0** em 17 digitais + 12 sintéticos; o único candidato (digitação "atràs") morre no piso.
3. Limite consciente: catalão tem "à" interno (FP se o corpus crescer para esse idioma) — considerar gating por idioma quando houver.
4. Alternativa mais cara, não escolhida agora: parsear ToUnicode/encoding na ingestão (pegaria "fl"→"á" e futuras fontes sem depender de idioma) — reabrir se o sinal de texto não bastar.
5. Próximo passo: tarefa com teste vermelho antes (skill `add-heuristic`), A/B no corpus e `pnpm eval --ci` (regra de ouro).
