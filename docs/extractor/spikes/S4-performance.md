# S4 · Desempenho: ms/página, memória e worker (spike da E0-T05)

**Data:** 2026-10-04 · **Status:** concluído — inclui **medição em aparelho Android real** (Redmi Note 13, Android 15; ver §4.1 e §8)
**Scripts:** `packages/extractor/spikes/s4-performance.mjs` (Node) e `packages/extractor/spikes/s4-browser.mjs` + `s4-bench.html` (Chromium) — descartáveis, commitados para reprodução.
**Saídas brutas:** `.pagepace-cache/spikes/S4/` (`summary.json`, `browser.json`, `<id>.json`, `idle.json`; gitignored, contém estatísticas do corpus — nunca commitar).

## 1. Método

### 1.1 Node (medida principal)

- `pdfjs-dist@6.4.299` (build `legacy`, Apache-2.0) em **Node v24.18.0**, Windows x64, 12 núcleos.
- **15 PDFs do corpus privado** (2.765 páginas), leitura **página a página, sem reter dados** (`page.cleanup()` a cada página — é o modo streaming que a E8-T01 vai usar).
- **Um processo filho por PDF e por variante** (`--expose-gc`), para que o pico de memória de um documento não contamine o outro; 30 execuções, 109 s no total.
- Por página: `getPage` + `getTextContent` + `getOperatorList` (tempo separado); em 4 páginas por PDF (1ª, 25%, 50%, última) também **render** em canvas (`@napi-rs/canvas`).
- **Memória:** amostragem a cada página (RSS, heap, external) → pico; após GC, RSS final. **Baseline** (processo só com o PDF.js importado, sem documento): **76,5 MB RSS / 8,6 MB heap**.
- **Bloqueio de thread:** um "batimento cardíaco" de 10 ms mede o **atraso máximo do event loop**. Em Node o PDF.js roda **na thread principal** (sem worker), então esse atraso é exatamente o congelamento de UI que aconteceria numa WebView sem Web Worker. Medido em 2 fases: abertura (documento + página 1) e páginas 2..n.
- **Variante `fontExtraProperties`:** todos os PDFs medidos com `true` (padrão da ADR-015/S2) e `false`, para isolar o custo de segurar os bytes da fonte.
- Determinístico: mesma entrada, mesma saída; só os tempos variam com a máquina.

### 1.2 Chromium (proxy de WebView/Android)

Tarefa pede "WebView/Android de entrada (emulador com limites ou dispositivo real do PO)". **Não há aparelho/emulador Android nesta máquina**, então o proxy usado foi: **Chromium 154 desktop (headless) + throttling de CPU via CDP** (`Emulation.setCPUThrottlingRate` 1×, 4× e 6× = "aparelho com limites"), rodando `s4-bench.html` — **só leitura bruta** (`getTextContent` + `getOperatorList`), como pede a tarefa.

- Dois modos por rodada: **`worker`** (PDF.js em Web Worker, caminho de produção) e **`main`** (fake worker do PDF.js, tudo na thread principal = WebView **sem** worker).
- Servidor estático local próprio (sem dependência nova) entrega a página, o `pdfjs-dist` e o PDF; o driver abre o Chrome por CDP, cria um alvo (target) novo por rodada (heap limpo), throttle, navega, roda e fecha.
- **Medida de sanidade do modo `main`:** para o scan `n1-en-lostworld` a leitura saiu 27× mais barata sem worker. Conferiu-se que a **saída é idêntica**: 248.503 ops e 456 ops de imagem nos dois modos, e o **render da mesma página bate pixel a pixel** (mesmo checksum, mesmo PNG de 413.741 B). A diferença é de arquitetura: com worker o PDF.js **materializa as imagens já na leitura**; sem worker essa transferência fica adiada para o render. Ou seja: no caminho real (**worker**), imagem custa na leitura.
- **Limites do proxy (dizer no relatório, não esconder):** é Chromium de desktop, não Android; o throttling do CDP pesa sobretudo na thread principal, então os números **com worker podem ser otimistas** em relação a um aparelho inteiro lento; e RSS de processo do Node não é comparável a memória de um app Android. **Nada aqui substitui a medição no aparelho do PO (§8).**

### 1.3 O que a medição **não** inclui

- As heurísticas do extrator (E1–E8) ainda não existem: os números são **só a leitura bruta do PDF.js** + render. O orçamento de 150 ms/página tem de caber **isso + o extrator**.
- Nenhum texto do corpus foi copiado para este relatório (só estatísticas).

## 2. Node — leitura bruta por PDF (variante `fontExtraProperties: true`)

| PDF | páginas | leitura ms/pág | texto | ops | 1ª pág (ler+render) | render ms/pág | pior página | lag aberto / págs | RSS pico | heap pico |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| n1-pt-sofia | 494 | **9,06** | 4,28 | 4,66 | 198 ms | 29,6 | 95 ms | 59 / 30 ms | 178 MB | 52 MB |
| n1-en-sofia | 177 | 4,60 | 2,78 | 1,71 | 195 ms | 15,5 | 109 ms | 60 / 12 ms | 144 MB | 38 MB |
| n1-pt-curinga | 310 | 3,44 | 1,93 | 1,42 | 107 ms | 11,9 | 44 ms | 58 / 14 ms | 162 MB | 41 MB |
| n1-en-curinga | 193 | 9,52 | 5,04 | 4,36 | 238 ms | 22,2 | 139 ms | 61 / 21 ms | 179 MB | 50 MB |
| n1-en-lostworld (scan+OCR) | 228 | **82,95** | 6,88 | 75,79 | 813 ms | 181,7 | 385 ms | 212 / 105 ms | 261 MB | 47 MB |
| n2-en-astrofisica | 14 | **126,45** | 69,18 | 57,07 | 255 ms | 481,4 | **2.427 ms** | 64 / **916 ms** | **406 MB** | 96 MB |
| n2-pt-placasdevideo | 2 | 47,82 | 33,17 | 14,27 | 204 ms | 23,9 | 107 ms | 65 / 3 ms | 120 MB | 22 MB |
| n3-pt-filosofia | 183 | 5,17 | 2,92 | 2,15 | 184 ms | 16,6 | 100 ms | 53 / 12 ms | 165 MB | 46 MB |
| n3-pt-filosofia2 | 163 | 5,58 | 3,27 | 2,22 | 580 ms | 110,7 | 303 ms | 65 / 20 ms | **314 MB** | 52 MB |
| n3-en-filosofia (scan+OCR) | 272 | 11,86 | 4,84 | 6,91 | 212 ms | 48,7 | 106 ms | 60 / 59 ms | 284 MB | 96 MB |
| n4-en-astrofisica | 27 | 31,55 | 17,89 | 13,53 | 216 ms | 34,8 | 127 ms | 59 / 23 ms | 201 MB | 56 MB |
| n4-en-fisica | 11 | 19,84 | 11,65 | 8,02 | 231 ms | 23,8 | 132 ms | 53 / 20 ms | 142 MB | 36 MB |
| n4-pt-astrofisica | 367 | 10,32 | 5,18 | 5,02 | 159 ms | 19,8 | 84 ms | 54 / 69 ms | 291 MB | 95 MB |
| n5-en-newton (escaneado) | 5 | 4,78 | 2,78 | 1,78 | 154 ms | 38,4 | 56 ms | 53 / 9 ms | 111 MB | 16 MB |
| n5-pt-astrofisica (escaneado) | 319 | 13,39 | 0,94 | 12,30 | 153 ms | 21,6 | 62 ms | 64 / 18 ms | 153 MB | 18 MB |

- **Corpus inteiro (2.765 páginas): 15,63 ms/página** de leitura; **sem os 3 casos extremos** (lostworld, n2-en-astrofisica, placasdevideo): **8,90 ms/página em 2.521 páginas**. Mediana entre documentos: 10,32 ms/pág.
- **Abertura do documento: 57–68 ms** em todos os 15 (custo fixo de xref/parse + fontes da p1) — não escala com o tamanho do livro.
- **1ª página legível (abrir + ler + render): 107–813 ms**; média 260 ms.
- **Render:** mediana **23,9 ms/página**; piores: n2-en-astrofisica 481, lostworld 182, filosofia2 111.
- **Pior página isolada:** `n2-en-astrofisica` levou **2.427 ms numa única página** (14 páginas no total, PDF de duas colunas) — página atípica existe e estoura qualquer orçamento por página.
- **Atraso máximo do event loop (sem worker):** abertura **53–66 ms em todos** (bloco síncrono único), páginas 2..n em geral 3–69 ms, com **916 ms** (n2-en-astrofisica), **212 ms** e **105 ms** (lostworld).

## 3. Node — memória

- **Baseline** (só V8 + PDF.js, sem documento): **76,5 MB RSS / 8,6 MB heap**. Os picos da tabela §2 incluem esse piso.
- **Livro de 494 páginas (n1-pt-sofia): 178 MB de RSS pico → ~102 MB "de livro"**, heap pico 52 MB. **Dentro do orçamento de 300 MB.**
- **Dois PDFs estouram 300 MB:** `n2-en-astrofisica` **406 MB com só 14 páginas** e `n3-pt-filosofia2` 314 MB (163 páginas). Memória alta aqui não depende do tamanho do livro → é conteúdo pesado (imagens/streaming de conteúdo), não "acumular 500 páginas".
- **`fontExtraProperties` custa pouco e de forma concentrada** (leitura com × sem a flag, 15 PDFs):

| PDF | Δ RSS | Δ heap | Δ ms/pág |
|---|---:|---:|---:|
| n4-pt-astrofisica (85 fontes) | **+35,2 MB** | +9,2 MB | −0,06 |
| n1-en-lostworld | **+23,5 MB** | +1,3 MB | −0,50 |
| n3-en-filosofia | +7,8 MB | +3,3 MB | +0,23 |
| os outros 12 | ≤ ±4,7 MB | ≤ ±3,1 MB | ±2,1 (ruído de execução; ≤ 0,15 nos livros longos) |

Δ de tempo = diferença entre duas execuções (o flag não acelera nada; nos PDFs de poucas páginas uma página pesada domina a média).

→ manter `fontExtraProperties: true` (é o que entrega o nome real da fonte, S1/S2) é viável; **descartar `font.data` depois de ler nome/métricas** (E8-T03 / BACKLOG) recupera até ~35 MB nos PDFs com muitas fontes.

## 4. Chromium (proxy de WebView) — leitura bruta

Livro de 494 páginas **n1-pt-sofia** (leitura bruta, `getTextContent` + `getOperatorList`):

| modo | throttle | leitura ms/pág | texto | ops | abertura | 1ª pág | pior pág | lag thread prin. | heap pico |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **worker** | 1× | **5,80** | 3,04 | 2,59 | 72 ms | 80 ms | 32 ms | **1,8 ms** | 27,5 MB |
| **worker** | 4× | **7,98** | 3,60 | 4,07 | 80 ms | 94 ms | 39 ms | 22,2 ms | 39,9 MB |
| **worker** | 6× | **11,03** | 4,24 | 6,30 | 96 ms | 115 ms | 49 ms | 15,0 ms | 47,2 MB |
| sem worker | 1× | 6,04 | 3,04 | 2,92 | 19 ms | 25 ms | 25 ms | 0 ms | **120,5 MB** |
| sem worker | 4× | 30,06 | 15,08 | 14,54 | 76 ms | 112 ms | 125 ms | 5,5 ms | 99,6 MB |
| sem worker | 6× | **49,69** | 24,77 | 24,13 | 128 ms | 189 ms | 208 ms | 24,1 ms | 85,8 MB |

Scan com camada de OCR **n1-en-lostworld** (228 páginas, 118.045 itens, 456 ops de imagem):

| modo | throttle | leitura ms/pág | texto | ops | pior pág | lag | heap pico |
|---|---|---:|---:|---:|---:|---:|---:|
| **worker** | 1× | **131,96** | 5,73 | 102,53 | 593 ms | 2,0 ms | 28,0 MB |
| **worker** | 6× | **139,23** | 9,64 | 107,88 | 536 ms | 141,1 ms | 28,2 MB |
| sem worker | 1× | 4,74 | 3,09 | 1,58 | 75 ms | 0 ms | 95,1 MB |
| sem worker | 6× | 44,27 | 29,23 | 14,36 | 527 ms | 19,6 ms | 99,0 MB |

- **Render de página do scan (mesmo resultado nos 2 modos, checksum idêntico):** p1 = **419 ms (worker) / 404 ms (sem worker)**; p100 = 337 / 302 ms.
- Leitura das 494 páginas no total: 2,9 s (worker 1×) e 24,5 s (sem worker 6×).

### 4.1 Aparelho real — Redmi Note 13 (Android 15, Chrome, Wi-Fi)

Medição feita pelo PO em 2026-10-04 com o modo `--serve` (prints: `<CORPUS_PRIVATE_DIR>\S4-prints\celular-worker.jpg` e `celular-main.jpg`), mesmo livro `n1-pt-sofia` (494 páginas, PDF de 1,9 MB servido pelo PC pela rede local):

| modo | leitura ms/pág | texto | ops | abertura | 1ª pág | pior pág | p50 | p95 | trava da tela | memória JS | total (494 pág) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **worker** | **24,77** | 11,81 | 12,23 | 926 ms | 1.198 ms | 272 ms | 22,5 | 36,8 | 26,3 ms | 9,5 MB | 13,3 s |
| sem worker (`main`) | 24,35 | 11,85 | 12,19 | 121 ms | 298 ms | 176 ms | 23,9 | 30,9 | 0,8 ms | 9,5 MB | 12,2 s |

- **24,8 ms/página de leitura bruta = 6× de folga sob o orçamento de 150 ms/página: o caso normal está confirmado em aparelho real.**
- O aparelho é **~4× mais lento que o PC a 1×** (24,8 vs 5,8 ms/pág) e **~2,2× mais lento que o PC a 6× de throttling** (24,8 vs 11,0): o proxy do §4 era mesmo **piso otimista** (§7.2).
- **1ª página: 1.198 ms com worker** — a abertura de 926 ms é fria e inclui o download de 1,9 MB pela Wi-Fi; a rodada seguinte (já morna) abriu em 121 ms. **Dentro do limite de 2 s.**
- **Nos dois modos a leitura saiu praticamente igual**, diferente do PC (4,5× mais lento sem worker a 6×). Duas razões: no aparelho o worker também roda no mesmo processador lento (o throttling do CDP só desacelerava a thread principal), e o modo `main` **adiou a materialização das imagens para o render**, que não foi medido aqui (§1.2). A comparação justa entre modos continua sendo a de §6.
- **`performance.memory` no Android devolve 9,5 MB nos dois modos** — número grosseiro, não serve para comparar (no PC os mesmos modos deram 27,5 e 120,5 MB). **A confirmação dos 300 MB de memória é a do §3 (RSS em Node).**
- **Worker segue obrigatório** com base em §6: no pior PDF do corpus, sem worker a tela ficaria **~0,9 s congelada** e o heap da thread principal é 4,4× maior.

Limites desta medição: 1 execução por modo, 1 aparelho de entrada, 1 livro comum (**scan** e a **página atípica de 2,4 s não foram medidos no aparelho**) e leitura bruta **sem render**.

## 5. Orçamento × medição (ARCHITECTURE, decisão 8)

| Meta (provisória, "confirmada no E0") | Medido | Veredito |
|---|---|---|
| **≤ 150 ms/página em celular de entrada** | **Aparelho real (Redmi Note 13): 24,8 ms/pág** de leitura bruta (§4.1). Node/desktop: 8,90 ms/pág no caso normal, 83–126 ms nos extremos. Chromium throttled 6× **com worker**: 11,0 ms/pág (livro comum) e **132–139 ms/pág** (scan com imagens). Sem worker 6×: 49,7 ms/pág. | **Caso normal: confirmado no aparelho real, com 6× de folga.** Casos-limite (scan com imagem pesada, página atípica de 2,4 s) **não foram medidos no aparelho** e chegam perto/além de 150 ms **só na leitura**, sem o extrator. |
| **Pico de memória ≤ 300 MB num livro de 500 páginas** | Livro de 494 pág: **178 MB RSS** (Node) e **≤ 50 MB de heap** (Chromium com worker). Porém 2 PDFs (14 e 163 páginas) ficaram em **406 MB** e **314 MB**. No aparelho o `performance.memory` não é confiável (§4.1). | **Atendida para livro longo comum; não é garantida por PDF.** O gatilho é conteúdo pesado, não "500 páginas". Confirma a E8-T03 (limite de memória, descartar `font.data`, liberar páginas). |
| **Primeira página legível em ≤ 2 s** | **Aparelho real: 1.198 ms (worker, fria, com download de 1,9 MB) e 298 ms (sem worker)** — §4.1. Node: 107–813 ms (ler + render). Chromium: leitura 25–189 ms; render do scan ~400–460 ms. | **Atendida no aparelho real** (folga ~2× no pior caso medido). |

## 6. Precisa de worker? — **Sim**

| Evidência | Com worker | Sem worker |
|---|---:|---:|
| Leitura 494 pág a 6× de throttling | **11,0 ms/pág** | 49,7 ms/pág (**4,5× mais lento**) |
| Heap pico da página principal (1×) | **27,5 MB** | 120,5 MB (**4,4× mais**) |
| Atraso máximo da thread principal (Chromium) | 1,8–22 ms | (medido nos dois modos; em Node, sem worker, foi de **916 ms**) |
| Pior caso em Node = thread única = "WebView sem worker" | — | **bloco de 916 ms**; página de **2.427 ms**; abertura bloqueia 53–66 ms **sempre** |

Sem worker o PDF.js disputa a thread principal com a interface: fica mais lento sob carga (49,7 vs 11,0 ms/pág), gasta **4× mais heap na thread principal** e, no pior PDF do corpus, **congelaria a tela por ~0,9 s numa única página** (e 2,4 s de espera total). **Recomendação: PDF.js em Web Worker desde a primeira versão do app (E8-T03), e a leitura de páginas deve ser assíncrona/por página (E8-T01) — já é assim nesta medição.**

## 7. Anomalias e limitações (para quem vier depois)

1. **Fake worker "esconde" o custo de imagem** (§1.2): sem worker a leitura sai 27× mais barata no scan, com a mesma saída — a transferência de imagem só aparece no render. **Nunca usar o modo sem worker como referência de leitura.**
2. **Throttling do CDP não é um celular:** afeta sobretudo a thread principal; parte do trabalho do worker provavelmente é mais barato aqui do que num aparelho lento. Números com worker são **piso otimista** — confirmado em §4.1: o aparelho real ficou **2,2× mais lento que o proxy a 6×** (24,8 vs 11,0 ms/pág).
3. **RSS de processo do Node ≠ memória de app Android** (inclui ~76,5 MB de V8 + PDF.js). Comparar sempre com o baseline, e preferir o **heap** no navegador.
4. **`fontExtraProperties`** só pesa em PDFs com muitas fontes (+35 MB no pior); manter a flag e descartar `font.data` depois (E8-T03).
5. **Páginas atípicas existem:** p95/pior página manda mais que a média no orçamento de responsividade (2.427 ms em n2-en-astrofisica; 593 ms no scan).
6. **Servidor `--serve` expõe o corpus na LAN** enquanto estiver de pé: é para medir no celular e deve ser encerrado com Ctrl+C logo depois (§8).

## 8. Medição em aparelho real — **fechada em 2026-10-04**

**Dispositivo:** Redmi Note 13 (Android 15, Chrome) do PO, na mesma rede Wi-Fi do PC que servia o PDF. **Resultado em §4.1:** 24,77 ms/pág com worker e 24,35 ms/pág sem worker (494 páginas), 1ª página em 1.198 ms (fria) → **orçamento de 150 ms/pág e de 2 s na 1ª página confirmados em aparelho de entrada**.

Roteiro reproduzível (sem instalar nada), o mesmo usado nesta medição:

```powershell
# 1) na raiz do projeto (PowerShell), sobe o servidor do bench na rede local
node packages\extractor\spikes\s4-browser.mjs n1-pt-sofia --serve --lan

# 2) no CELULAR (mesma rede Wi-Fi), abra a URL que começa com http://10. (ex.):
#    http://10.0.0.154:57554/spikes/s4-bench.html?pdf=n1-pt-sofia&mode=worker
#    (192.168.56.1 é adaptador de máquina virtual e 172.30.32.1 é WSL/Hyper-V: não usar)
# 3) a página roda SOZINHA: espere o bloco "===== RESULTADO =====" no topo (leitura em ms/página);
#    se aparecer "ERRO:" em vermelho, tire print do erro e pare
# 4) tire 1 print do bloco de resultado (uma tela serve)
# 5) repita com mode=main   (mesma URL trocando mode=worker por mode=main) e tire o 2º print
# 6) Ctrl+C no PC para desligar o servidor (ele só existe enquanto estiver rodando; ele loga
#    cada requisição — "200 /corpus/n1-pt-sofia.pdf …" mostra que o PDF chegou ao celular)
# 7) mova as prints para <CORPUS_PRIVATE_DIR>\S4-prints (nomeie celular-worker.jpg e celular-main.jpg)
#    cabo USB no PC → Este Computador → [celular] → Pictures → Screenshots → copiar/colar
```

Nota da 1ª tentativa (2026-10-04): a página ficava presa em "carregando…" porque só o driver CDP chamava `__runBench()`; corrigido para auto-execução (`auto=0` continua obrigatório para o driver) e testado de ponta a ponta abrindo a URL de `10.0.0.154` num Chrome sem CDP (worker 5,83 ms/pág e main 6,08 ms/pág, 494 pág).

**O que ainda NÃO foi medido no aparelho:** o scan `n1-en-lostworld` (132–139 ms/pág no proxy), a página atípica de 2.427 ms, o render e a memória real (`performance.memory` no Android é grosseiro, §4.1). Por isso a **ADR-005 segue `provisional`**: o desempenho do caso normal está confirmado, e a saída de `provisional` depende do fim da E0 (S5 de licenças e estes casos extremos).

## 9. Reprodução

```powershell
# Node: 15 PDFs × 2 variantes + baseline (~2 min), grava summary.json
node packages\extractor\spikes\s4-performance.mjs
node packages\extractor\spikes\s4-performance.mjs n1-pt-sofia       # só um PDF

# Chromium (proxy WebView): throttling 1×/4×/6×, worker × sem worker
node packages\extractor\spikes\s4-browser.mjs n1-pt-sofia --rates 1,4,6 --modes worker,main
node packages\extractor\spikes\s4-browser.mjs n1-en-lostworld --rates 1,6 --modes worker,main
node packages\extractor\spikes\s4-browser.mjs n1-en-lostworld --rates 1 --modes worker,main --rendercheck 1  # render de uma página

# Roteiro do celular (§8)
node packages\extractor\spikes\s4-browser.mjs n1-pt-sofia --serve --lan
```

Saídas: `.pagepace-cache/spikes/S4/summary.json` (Node), `browser.json` (Chromium, acumula as rodadas), `<id>.json`, `<id>.nofont.json`, `idle.json`.
