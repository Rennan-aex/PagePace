# S3 · Struct tree ("PDF tagged"): cobertura e confiabilidade (spike da E0-T04)

**Data:** 2026-10-04 · **Status:** concluído · **Script:** `packages/extractor/spikes/s3-structtree.mjs` (descartável, commitado para reprodução) · **Saídas brutas:** `.pagepace-cache/spikes/S3/` (gitignored; contém texto do corpus — nunca commitar).

## 1. Método

- `pdfjs-dist@6.4.299` em Node 24 rodando nos **15 PDFs do corpus privado** (0 falhas): 2.765 páginas, 2.400 com texto, 393.773 itens de texto.
- API do pdf.js: `pdf.getMarkInfo()` (retorna um **`Map`**, não objeto — `Marked`/`UserProperties`/`Suspects`) e **`page.getStructTree()`** (a árvore é **por página**; `pdf.getStructTree()` não existe nesta versão).
- Por página coletamos: árvore nula / vazia / utilizável, histograma de `role`, profundidade, nós de conteúdo (`content` = MCID), figuras (`alt`/`bbox`), `Artifact`, `P` sem conteúdo e **hierarquia invertida** (bloco como filho de `P`/`Span` — ex.: `Sect` dentro de `P`).
- *Utilizável* = tem ao menos um nó `content`. *Cobertura* = páginas com árvore utilizável ÷ páginas com texto.
- Comparação com o visual: render de páginas de exemplo (`node packages/extractor/spikes/s3-structtree.mjs render <id> <pág> [escala]`) e dump da árvore (`... tree <id> <pág>`), conferidos um a um (PNGs em `.pagepace-cache/spikes/S3/render/`).
- Determinístico: mesma entrada, mesma saída.

## 2. Quantos têm struct tree?

| Situação | PDFs | Quais |
|---|---:|---|
| `StructTreeRoot` no arquivo | **5/15** | n1-en-sofia, n1-en-curinga, n1-en-lostworld, n3-pt-filosofia, n4-en-fisica |
| `MarkInfo.Marked = true` | **4/15** | n1-en-sofia, n1-en-curinga, n1-en-lostworld, n4-en-fisica (n3-pt-filosofia tem raiz **sem** `MarkInfo`) |
| Árvore **utilizável** (nós de conteúdo) | **4/15** | n1-en-sofia, n1-en-curinga, n4-en-fisica, **n3-pt-filosofia (só 2 páginas, 9 nós — inútil na prática)** |
| Árvore **confiável** (ver §3) | **3/15** | **n1-en-sofia, n4-en-fisica, n1-en-curinga (com defeitos de forma)** |
| Sem nada | 10/15 | n1-pt-*, n2-*, n3-pt-filosofia2, n3-en-filosofia, n4-en-astrofisica, n4-pt-astrofisica, n5-* |

| PDF | páginas com texto | páginas com árvore utilizável | cobertura | `content` | itens de texto | papéis principais | defeitos |
|---|---:|---:|---:|---:|---:|---|---|
| **n1-en-sofia** | 177 | 177 | **100%** | 1.872 | 10.252 | Sect, P×1.863, **H1×1**, L/LI/LBody | nenhum |
| **n1-en-curinga** | 192 | 192 | **100%** | 19.542 | 20.253 | Part, P×3.577, **Span×19.461**, Sect×81 | **`Sect` dentro de `P`** (hierarquia invertida); fragmentação extrema em `Span` |
| **n4-en-fisica** | 11 | 11 | **100%** | 446 | 962 | Document, P×161, Figure×3, Link×13 | 14 nós **sem `role`**; alt em só 1 de 3 figuras |
| n1-en-lostworld | 224 | **0** | **0%** | 0 | 118.045 | só `Root` (228×) | **falso tagged**: `Marked=true` mas árvore **vazia** |
| n3-pt-filosofia | 176 | 2 | **1,1%** | 9 | 10.935 | Root, `Art`×2, Document, Sect×3, P×7, Figure×2 | sem `MarkInfo`; papel não-padrão `Art`; cobertura perto de zero |
| os outros 10 | — | 0 | 0% | 0 | 233.326 | — | sem `StructTreeRoot` |

**Totais do corpus:** 792 páginas devolvem árvore, 382 são utilizáveis (15,9% das 2.400 páginas com texto — mas quase tudo concentrado nos 3 PDFs bons); 21.869 nós de conteúdo; **1 `H1` em todo o corpus, 0 `H2`–`H6`**; 3 `Figure` (1 com `alt`, 3 com `bbox`); 0 `Artifact`; 0 `P` vazio; **1 documento com hierarquia invertida**.

## 3. Confiável? (comparação com o visual)

### Bom: `n1-en-sofia` (p. 3, `n1-en-sofia-p3.png`)
Árvore: `Sect → H1 + P×12`, tudo com `lang=EN-US`. Visual: título **"THE GARDEN OF EDEN"** (H1) + epígrafe + 11 parágrafos. **Bate**: 1 título → 1 `H1`; corpo → `P` na ordem de leitura; nada sobrando nem faltando. Cobertura 100% das 177 páginas e ainda entrega listas (`L/LI`) corretas nas p. 36 e 118. **Melhor árvore do corpus.**

### Bom, mas sem títulos: `n4-en-fisica` (p. 1, `n4-en-fisica-p1.png`)
Árvore: `Document → P×161 + Figure×3 + Link×13`. Visual (capa do artigo): logo NARST = `Figure` com `bbox` na posição certa; título, autores, "Abstract" e corpo em `P`. **Blocos corretos**, mas **tudo virou `P`** — nem o título do artigo nem "Abstract" ganharam `Hn`. `alt` de uma figura veio lixo gerado automaticamente ("A close-up of a logo / AI-generated content may be incorrect"). 14 nós sem `role`.

### Ruim (forma): `n1-en-curinga` (p. 1, `n1-en-curinga-p1.png`)
Árvore: `Part → P → Span×19.461`, com **`Sect` dentro de `P`** (hierarquia invertida, o PDF viola o modelo de tags) e um `Span` por fragmento de palavra, cada um com `alt` **duplicando o próprio texto** ("Sophie's World", ".", "Guardian"...). Visual: capa + 3 citações de elogio — o conteúdo cabe em 5–6 blocos; a árvore tem **43.046 nós** (23.504 estruturais + 19.542 de conteúdo). Os blocos (`P`) estão certos, mas a árvore **não pode ser usada crua** (span-alt é ruído; `Sect` invertido quebra qualquer parser estrito).

### Ruim (conteúdo): `n1-en-lostworld` (p. 2, `n1-en-lostworld-p2.png`)
`Marked=true` e `StructTreeRoot` presente, mas **`Root` sem nenhum filho em 228 páginas**. É o scan com OCR embutido (ADR-019): o gerador do PDF criou a raiz vazia. Quem confiar só em "tem `StructTreeRoot`" leva **falso positivo**.

### Ruim (quase vazio): `n3-pt-filosofia`
Raiz sem `MarkInfo`, 9 nós de conteúdo em 2 de 176 páginas e papel não-padrão `Art`. Inútil.

## 4. Recomendação: como usar (ou não) esse sinal

1. **Só como confirmação de parágrafo (E2), nunca como fonte principal.** Nos 3 PDFs bons a estrutura `P` coincide com os parágrafos visuais; nos outros 12 não há nada. A heurística geométrica continua sendo o caminho — a árvore, quando existir, só **corrobora** (e é barato: `page.getStructTree()` por página).
2. **Não serve para títulos (E4):** **1 `H1` em 15 PDFs** e nenhum `H2`–`H6`. O único `H1` do corpus (sofia p.3) ajuda, mas não sustenta a E4 — a detecção de títulos continua por tamanho/posição/espaçamento.
3. **Validar antes de aceitar.** Marcar o documento como "tagged confiável" só se **todos** passarem:
   - `MarkInfo.Marked = true` (sem isso, `StructTreeRoot` sozinho já enganou — n3-pt-filosofia);
   - árvore **não vazia** em ≥ 90% das páginas com texto (engana n1-en-lostworld);
   - **sem** hierarquia invertida e com `P`/`Sect` como nós majoritários (engana n1-en-curinga se o objetivo for árvore limpa);
   - nenhum papel não-padrão relevante (`Art`, nós sem `role`).
4. **Normalizar ao consumir:** descartar `Span`/`alt` que repete o texto, mapear `Art` e nós sem `role` para "sem informação", tratar `Link` como anotação. Não persistir a árvore crua no `RawDocument` sem essa limpeza (o campo `structTree` da ADR/schema fica `unknown` — limitar ao que é útil).
5. **`Figure` com `bbox` é o achado mais útil fora da E2:** as 3 figuras têm `bbox` válido → serve de confirmação para o recorte de figuras/tabelas da **E10** (ADR-016). `alt` só em 1 de 3, não confiar nele.
6. **Corpus/manifest:** feature **`tagged`** só nos 3 com árvore utilizável e 100% de cobertura (**n1-en-sofia, n1-en-curinga, n4-en-fisica**); n1-en-lostworld e n3-pt-filosofia ficam **sem** a apesar do `StructTreeRoot`. Vale buscar 1–2 PDFs tagged de propósito (E0-T01b) para os gabaritos da origem 2 de `CORPUS.md`.

## 5. Reprodução

```powershell
node packages/extractor/spikes/s3-structtree.mjs                # mede os 15 PDFs
node packages/extractor/spikes/s3-structtree.mjs tree n1-en-sofia 3        # dump da árvore da página
node packages/extractor/spikes/s3-structtree.mjs render n1-en-sofia 3 1.2   # PNG da página
```

Saídas: `.pagepace-cache/spikes/S3/summary.json` (totais, papéis, defeitos, tabela por PDF), `<id>.json` (por PDF, inclui `samples`) e `render/*.png`.
