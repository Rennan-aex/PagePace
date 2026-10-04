# S1 · O que o PDF.js entrega (spike da E0-T02)

**Data:** 2026-10-04 · **Status:** concluído · **Script:** `packages/extractor/spikes/s1-dump.mjs` (descartável, commitado para reprodução) · **Saídas brutas:** `.pagepace-cache/spikes/S1/` (gitignored; contém texto do corpus — nunca commitar).

## 1. Método

- `pdfjs-dist@6.4.299` (Apache-2.0) em Node 24, build `legacy`, sem worker (main thread).
- 5 PDFs do corpus privado (`CORPUS_PRIVATE_DIR`), incluindo os 3 pedidos na tarefa (N1, N2, N3) mais os 2 PDFs novos (N4, N5):
  `node packages/extractor/spikes/s1-dump.mjs` → `summary.json` + `digest.txt` + PNGs de 1–3 páginas por PDF.
- Renderização em Node com `@napi-rs/canvas@1.0.10` (MIT) para comparar texto extraído × visual.
- Determinístico: mesma entrada, mesma saída (sem `Date.now` na lógica; só medição de tempo).

| PDF | páginas | produtor | perfil |
|---|---|---|---|
| n1-pt-sofia | 494 | calibre (e-book) | texto digital simples |
| n2-pt-placasdevideo | 2 | pdfTeX (LaTeX) | artigo curto |
| n3-pt-filosofia | 183 | PageMaker → Distiller | livro técnico |
| n4-pt-astrofisica | 367 | LaTeX (exercícios) | acentos destacados, muitas fontes |
| n5-pt-astrofisica | 319 | scanner (imagem) | **sem camada de texto** |

## 2. Tabela: dado / disponível? / como obter / qualidade

| Dado | Disponível? | Como obter | Qualidade observada |
|---|---|---|---|
| Itens de texto (`str`, `transform` 6 elementos, `width`, `height`, `dir`, `hasEOL`, `fontName`) | **Sim** | `page.getTextContent()` | **Bom.** Chave única em 100% dos 177.867 itens medidos (7 chaves, 0 variações). `dir` sempre `ltr`; sem rotação nas amostras. |
| Quebras de linha | **Sim** | `item.hasEOL` | **Bom** para reconstruir linhas; n1: 17.143 EOL → 17.636 linhas. Em linhas com várias runs, EOL vem só no último item. |
| Espaços | **Parcial** | dentro do `str` **ou** item `" "` separado (`height: 0`) | **Médio.** Dois comportamentos no mesmo corpus: n1/n3 embutem espaço no item; n2/n4 (LaTeX) emitem item `" "` próprio. Em n1, 11.465 de 41.006 itens são só espaço. Junção por geometria é obrigatória, não opcional. |
| Posição/gap entre runs | **Sim** | `transform[4] + width` vs `transform[4]` do próximo | **Bom** para detectar espaços ausentes (n1: 1 candidato real) e solapamentos. |
| Nome real da fonte | **Só com flag** | `getDocument({ fontExtraProperties: true })` → `page.commonObjs.get(item.fontName)` → `.name` | **Bom, com caveats:** nome vem com prefixo de subset (`AMBACO+Georgia`); sem a flag o nome **não** chega ao main thread (não está em `EXPORT_DATA_PROPERTIES`). |
| Negrito/itálico (`font.bold`, `font.italic`) | **Não** (fontes embutidas) | — | **Ruim.** `undefined` em **110/110** fontes dos 5 PDFs; só é preenchido em fallback de fonte do sistema. Estilo terá que sair do nome real da fonte (tarefa S2/E0-T03). |
| Métricas da fonte | **Parcial** | `font.ascent`, `font.descent`, `page.commonObjs` | **Médio.** `null` em Type1 sem métricas embutidas (n3: `Times-Roman` com `ascent: null`). |
| Estilos por item | **Sim** | `textContent.styles[fontName]` = `{fontFamily, ascent, descent, vertical}` | **Médio.** `fontFamily` é só `serif`/`sans-serif`/`monospace` (heurística do próprio pdf.js), não a família real. |
| Sumário/outline | **2 de 5** | `pdf.getOutline()` | **Bom quando existe:** n1 = 35 entradas, n2 = 8 com aninhamento; `title`, `dest` (ref ou string), `url`, `bold`/`italic`/`color` (vieram todos `false`/preto nos 43 nós medidos). |
| Árvore de tags (struct tree) | **0 de 5 úteis** | `pdf.getStructTree()` | **Inútil no corpus atual:** n1/n2/n4/n5 = `null`; n3 = `{role:"Root", children:0}`. Não serve de sinal hoje (detalhe no spike S3). |
| Metadados | **Sim** | `pdf.getMetadata()` → `info` (`Title`, `Author`, `Creator`, `Producer`) e XMP (`meta.getRaw()`, `meta.get("dc:title")`) | **Médio.** n1: `Title: "O Mundo de Sofia"`, XMP com `dc:title`/`dc:creator`/`dc:language`. n3: `Title` é nome de arquivo (`.pmd`), `Author: "xp"` — lixo típico de PDF antigo. |
| Marcação (marked content / MCID) | **Não exposto** | `getTextContent()` não traz MCIDs/`beginMarkedContent` nestes PDFs | **Ruim:** `sameTextAsDefault: true` em todos os testes. Tags não alcançam o texto pelo caminho normal. |
| Anotações (links) | **Sim** | `page.getAnnotations()` | **Bom** (n2: 17 links na p1). Serve para links/outline, não para corpo do texto. |
| Imagens / página sem texto | **Sim** | `page.getOperatorList()` + `OPS.paintImageXObject` | **Bom para detectar escaneado:** n5 = 319/319 páginas com op de imagem e **0 itens de texto**. |
| Renderização em Node | **Sim** | `page.render({ canvasContext, viewport })` com `@napi-rs/canvas` | **Bom:** PNGs gerados conferem com o texto extraído (ver §4). |
| Normalização Unicode | **Sim, e não resolve** | `getDocument({ disableNormalization })` comparado com default (NFC) | **Inócuo aqui:** `changedItems: 0` em n1–n4. O problema de n4 não é combinação Unicode (é acento como caractere espaçado em item separado). |

## 3. Métricas brutas por PDF (corpus completo, `summary.json`)

| Métrica | n1 | n2 | n3 | n4 | n5 |
|---|---:|---:|---:|---:|---:|
| páginas com texto / sem texto | 493/1 | 2/0 | 176/7 | 360/7 | **0/319** |
| itens / linhas | 41.006 / 17.636 | 432 / 146 | 10.935 / 5.817 | 125.494 / 15.791 | 0 / 0 |
| linhas com +1 item | 1.613 | 46 | 1.404 | 13.105 | 0 |
| espaços ausentes (candidatos) | 1 | 0 | 0 | 0 | 0 |
| solapamentos (overlap) | 0 | 0 | 0 | **9.972** | 0 |
| itens só com espaço | 11.465 | 107 | 2.062 | 30.128 | 0 |
| itens terminando em hífen | 40 | 18 | **1.727** | 146 | 0 |
| acento espaçado (U+00B4/`¸`/`˜`…) | 0 | 0 | 0 | **9.013** | 0 |
| fontes (nomes reais) | 5 | 7 | 13 | 85 | 0 |
| `bold`/`italic` definidos | 0/5 | 0/7 | 0/13 | 0/85 | — |
| outline / struct tree | 35 / null | 8 / null | null / Root vazio | null / null | null / null |
| desempenho | 10 ms/pág · 221 MB | 71 ms/pág* | 5 ms/pág · 234 MB | 10 ms/pág · 308 MB | 13 ms/pág · 295 MB |

\* n2 tem só 2 páginas: o tempo é fixo de setup, não por página real. `warn = 0` em todos. Texto × operator list custam ~metade cada (n1: 2.083 ms texto, 2.325 ms ops).

## 4. Comparação com o render (PNGs em `.pagepace-cache/spikes/S1/render/`)

- **n1 p247:** extração bate com o visual, linha a linha.
- **n4 p184:** o render mostra `equação` / `Solução:` corretos; o texto extraído vem `equa¸c˜ao` / `Solu¸c˜ao` — letra + acento como item separado (9.013 ocorrências). **92% dos 9.972 solapamentos de n4 são justamente esses acentos destacados** (sonda `probe-overlap.mjs`: 9.212 de 9.972 envolvem `´`/`¸`/`˜`/`ˆ`).
- **n5 p160:** render é imagem de scanner; extração 0 itens — confirmado visualmente.

## 5. Armadilhas de API descobertas (para o E1)

1. `standardFontDataUrl` / `cMapUrl` / `wasmUrl` em Node precisam de **caminho de arquivo puro** (usa `fs.readFile`); URL `file://` falha com `Unable to load font data at:`.
2. Destruir com `task.destroy()` — `pdf.destroy()` não existe em v6.
3. Nome real da fonte exige `fontExtraProperties: true` **no `getDocument`**, e aí o `font.data` (bytes da fonte) fica retido em memória (n4: 308 MB com 85 fontes). Peso × dado: se o nome bastar, descartar `data` depois de ler.
4. Prefixo de subset (`XXXXXX+Nome`) precisa ser cortado antes de inferir família/estilo.
5. `getStructTree()` pode devolver `Root` sem filhos — tratar "tagged de falso" ≠ "tagged".
6. Escaneado sem camada de texto: 0 itens, ops de imagem em todas as páginas — detectável barato pelo operator list (ou por 0 itens + 0 chars).

## 6. Lacunas confirmadas (o que o PDF.js **não** resolve sozinho)

1. **Acento destacado** (n4): `´` + letra em itens separados; NFC não compõe (é char espaçado U+00B4, não combining). Precisa de heurística de recomposição geométrica (item de acento sobreposto ao 1º caractere do próximo item → compor `Í` etc.). **Candidata a backlog/E4.**
2. **Negrito/itálico:** flags `undefined` em fontes embutidas; depende do nome da fonte → escopo do spike S2 (E0-T03).
3. **Struct tree:** inexistente/inválida no corpus atual → S3 (E0-T04) deve confirmar em PDFs tagged de verdade.
4. **PDF escaneado (n5):** nenhum texto sem OCR — pergunta de produto registrada em `OPEN-QUESTIONS.md`.
5. **Fim de parágrafo vs fim de linha:** `hasEOL` dá a linha visual; parágrafo continua sendo decisão do extrator (ADR-012), não vem do PDF.

## 7. Recomendação

- **ADR-005 (PDF.js) ganha evidência a favor:** entrega geometria, itens, fontes e render com qualidade suficiente para o pipeline (E1–E3), desempenho folgado (5–10 ms/página em livro de 494 páginas, abaixo do orçamento preliminar) e licença Apache-2.0. **Mantida `provisional` até o S4 (desempenho em Android/WebView)**, conforme critério de saída da fase E0.
- Confirmar `fontExtraProperties: true` + descarte de `font.data` como padrão de leitura (ver ADR-015).
- Os casos 1–3 acima viram tarefas/heurísticas nos marcos certos; nada aqui bloqueia o E1.
