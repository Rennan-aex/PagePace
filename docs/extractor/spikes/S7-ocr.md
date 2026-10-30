# S7 · Opções de OCR (spike da E9-T01)

**Data:** 2026-10-30 · **Status:** concluído · **Script:** `packages/extractor/spikes/s7-ocr-probe.ts` (descartável, commitado para reprodução) · **Saídas brutas:** `.pagepace-cache/spikes/S7/` (PNGs, textos e gold — gitignored, contém texto do corpus, nunca commitar) · **Decisão:** ADR-093 (dependência) + ADR-094 (engine).

## 1. Método

- **Engines medidos:** (a) **tesseract.js v7** (WASM, Apache-2.0 — devDependency da raiz, ADR-093) rodando em Node 24 no mesmo processo do probe; (b) **Tesseract nativo 5.4.0** (UB-Mannheim, Apache-2.0, instalado via winget, um `spawn` por página com `--oem 1`); (c) **ML Kit Text Recognition v2** (Android) — não roda neste PC; comparado pelos números publicados pela documentação do Google (§6).
- **Modelos:** os dois engines Tesseract rodaram com **os mesmos arquivos** `traineddata` de `@tesseract.js-data` (`4.0.0_best_int` = "best" e `4.0.0` = "std"), descompactados para o nativo — comparação de engine, não de modelo.
- **Páginas-render:** pdf.js 6.4.299 + `@napi-rs/canvas` (receita do S1, **com `wasmUrl`** — ver §5), escala 2 (~2× os pontos do PDF), salvas em PNG.
- **Referências de qualidade (nada de gabarito no git — regra 1):**
  - **en (livro antigo, scan com camada OCR embutida):** `n1-en-lostworld` p. 50/100/150/200 — a **camada OCR embutida** (`getTextContent`) serve de referência; o CER medido é *acordo com o OCR anterior*, não verdade absoluta (o anterior também erra).
  - **en (livro antigo, scan sem camada):** `n5-en-newton` p. 3 — **transcrição manual** de 1.073 caracteres (1 parágrafo), conferida por mim contra o PNG.
  - **pt (livro didático escaneado):** `n5-pt-astrofisica` p. 50 — **transcrição manual** de 2 parágrafos (321 + 333 caracteres).
  - Os golds moram em `.pagepace-cache/spikes/S7/gold-*.txt` (gitignored); o recorte do OCR por âncoras e o CER usam `slice-gold.ts` + o comando `cer` do probe.
- **CER:** Levenshtein ÷ caracteres da referência, após NFC + colapso de espaços; hifenização de fim de linha desfeita antes de comparar.

## 2. Qualidade (CER — menor é melhor)

**Contra referência humana (gold manual):**

| documento (parágrafo) | tesseract.js best | tesseract.js std | nativo best | nativo std |
|---|---:|---:|---:|---:|
| `n5-pt-astrofisica` p50 ¶1 (~320 chars, pt) | 0,0156 | 0,0156 | 0,0156 | 0,0156 |
| `n5-pt-astrofisica` p50 ¶3 (~333 chars, pt) | **0,0000** | — | **0,0000** | — |
| `n5-en-newton` p3 ¶1 (~1.070 chars, en antigo) | 0,0112 | 0,0121 | 0,0112 | 0,0121 |

**Contra a camada OCR embutida do `n1-en-lostworld` (4 páginas, en antigo):**

| página | tjs best | tjs std | nativo best | nativo std |
|---|---:|---:|---:|---:|
| p50 | 0,0035 | — | 0,0045 | — |
| p100 (escala 2) | 0,0025 | 0,0045 | 0,0045 | 0,0045 |
| p100 (escala 4) | 0,0025 | — | 0,0035 | — |
| p150 | 0,0058 | — | 0,0072 | — |
| p200 | 0,0081 | — | 0,0081 | — |

**Leituras:**

- **best vs std: diferença irrelevante** (≤ 0,0045 em todas as comparações) — o modelo `best_int` (1,4–3,0 MB `.gz`) é suficiente; o `std` (6,8–10,9 MB `.gz`) só pesa.
- **tesseract.js vs nativo: praticamente idênticos** (CER entre eles 0,0000 no newton p3; 0,0070 no astro p61; as divergências maiores, 0,0539/0,0800, estão na região de **figuras**, onde o texto não é paragraph corrido). É o mesmo motor Tesseract com o mesmo modelo — esperado.
- **pt e en de livro antigo ficam em CER ≈ 1–2% contra transcrição humana** e ≤ 1% contra a camada OCR anterior. Erros típicos vistos na conferência visual: letra inicial de parágrafo confundida com inicial maiúscula ("E importante" por "É importante"; "Tear" por "THAT" na capitular do newton), itálico/pequenas maiúsculas ("Prixcieia" por "PRINCIPIA"), figura vira lixo textual (esperado — E10/ADR-016 é que cuida de recortes).
- **Escala 2 × escala 4:** CER igual no tjs (0,0025) e quase igual no nativo — **escala 2 basta**; escala 4 só dobra o tempo.

## 3. Tempo (medido neste PC, Node 24, worker já aquecido)

| condição | tesseract.js (WASM) | nativo (CLI, processo novo por página) |
|---|---:|---:|
| carga fria (core + modelo) | 251–312 ms (uma vez) | ~embutido no 1º spawn |
| lostworld 566×980 (escala 2) | 1.505–2.038 ms/pág | 1.059–1.142 ms/pág |
| lostworld 1131×1959 (escala 4) | 2.055 ms/pág | 1.450 ms/pág |
| newton ~660×1110 | 919–1.529 ms/pág | 714–1.065 ms/pág |
| astrofísica 1189×1635 (pt) | 1.957–2.945 ms/pág | 834–1.896 ms/pág |

- **WASM é ~1,5–2× mais lento que o nativo** — e ambos ficam **muito abaixo** dos 5.000 ms/página do orçamento da ADR-005 no pior caso medido (2,9 s). Um livro de 319 páginas (n5-pt) levaria **~10–15 min** no PC, página a página, em segundo plano (fluxo da E9-T04).
- **RSS do processo Node** durante as runs do tjs: 269–351 MB (piso do Node + WASM; o modelo padrão `std` subiu ~25 MB a mais que o `best`). O RSS do processo nativo não é comparável (filho separado, não medido).
- **Num celular de entrada o WASM será mais lento** — medição em aparelho real ficou como pendência (§8), mesmo formato do E8-T04.

## 4. Tamanho

| item | tamanho |
|---|---:|
| `tesseract.js` (JS) | 1,3 MB |
| `tesseract.js-core` (npm, todos os wasm) | 43,2 MB |
| → wasm LSTM que o navegador baixa (1 arquivo + glue) | ~2,86 MB + ~3,9 MB |
| modelo `eng` best (`.gz` baixado) | 2,95 MB (5,2 MB solto) |
| modelo `por` best (`.gz` baixado) | 1,39 MB (2,4 MB solto) |
| payload do app (1 wasm + glue + por+eng best) | **≈ 10–12 MB na 1ª uso** |
| Tesseract nativo instalado no Windows (completo, winget) | 237,9 MB |
| ML Kit bundled (Latin, por app/aparelho) | **+4 MB** (documentação Google) |
| ML Kit thin (Play Services) | +260 KB + modelo baixado sob demanda |

## 5. Achado de pipeline: páginas escaneadas precisam do `wasmUrl` do pdf.js

- `n1-en-lostworld` e `n3-en-filosofia` são **JBIG2** (e lostworld tem JPX/JPEG2000); `n5-*` são JPEG (DCT). Sem `wasmUrl`, o pdf.js em Node **renderiza as páginas JBIG2 em branco e não avisa** (só 0 caracteres no OCR — foi como o bug apareceu). Com `wasmUrl` apontando para `node_modules/pdfjs-dist/wasm/` (receita do S1, presente no probe), `jbig2.wasm`/`openjpeg.wasm` decodificam e a página sai certa.
- O app serve esses mesmos assets wasm ao vendor do pdf.js (ADR-020) — o caminho de rasterizar scans **existe já** nos dois ambientes; a E9-T02 só precisa ligar `page.render` → `ImageData`/PNG → engine.

## 6. ML Kit (Android, pesquisa — não medido aqui)

- **Licença:** **não é Apache/MIT** — é o *ML Kit Terms* + *Google APIs ToS*: grátis, roda no aparelho, mas **sem engenharia reversa**, coleta de métricas de uso para o Google e contato ocasional com servidores (correções/modelos). Comparar com a liberdade do Apache-2.0 do Tesseract (regra 5 do AGENTS: toda dependência nova registrada — está na ADR-094).
- **Tamanho:** bundled +4 MB por script/arquitetura; thin +260 KB com modelo baixado via Play Services na 1ª uso.
- **Cobertura:** um único modelo **Latin** cobre pt + en (e mais 100+ idiomas latinos) — vantagem sobre baixar dois `traineddata`.
- **Saída estruturada:** blocks/lines/words com **bbox, corner points e confiança** — mapeia direto nos itens do `RawDocument` (bbox + texto) sem heurística extra.
- **Integração:** exige **plugin Capacitor** (nativo) — caminho de código diferente do PC/CI; **não roda no PC nem no PWA**.
- **Velocidade:** a documentação promete "real-time na maioria dos aparelhos" (câmera); **não há número publicado por página de livro** — só medição em aparelho diria (pendência §8).
- **Reprodutibilidade:** os gabaritos/eval do repositório rodam em PC/CI com Tesseract; OCR feito por ML Kit no celular **não seria reproduzível no CI** — o `text_cer` do E9 teria de ser medido com o mesmo engine em tudo.

## 7. Comparativo final e recomendação

| critério | tesseract.js (WASM) | Tesseract nativo | ML Kit (Android) |
|---|---|---|---|
| qualidade pt/en livro antigo | CER ~1–2% (medido) | idêntica (medido) | desconhecida (não medido) |
| roda no app (Capacitor/WebView) | **sim** | não | sim (plugin nativo) |
| roda no PC/CI (reprodutível) | **sim** | sim | não |
| licença | Apache-2.0 | Apache-2.0 | termos Google (não OSI) |
| tamanho no app | ~10–12 MB 1ª uso | 238 MB (impraticável) | +4 MB ou download Play |
| tempo (este PC) | 1,5–2,9 s/pág | 0,8–1,9 s/pág | desconhecido |
| bbox + confiança por palavra | sim (word-level) | sim (TSV) | sim (nativo) |

**Recomendação (ADR-094): tesseract.js como engine do adaptador da E9-T02**, modelo `best_int`, idiomas `por`+`eng` empacotados localmente (`langPath`, sem CDN em produção), render a escala 2, worker único reutilizado com progresso por página (E9-T04). **Tesseract nativo** fica como ferramenta de conferência no PC (CLI de comparação), não como engine do produto. **ML Kit** fica registrado como *acelerador Android opcional* para o futuro: só vale revisitá-lo se uma medição em aparelho real (formato E8-T04) mostrar ≥ 2× mais rápido que o tesseract.js e o PO aceitar a licença Google e a divergência de resultados entre plataformas.

## 8. Pendências desta medição

- [ ] Tempo/qualidade do ML Kit em aparelho real (Redmi Note 13) — hoje só há promessa de "real-time" na documentação; abrir como tarefa só se o PO quiser perseguir o caminho nativo.
- [ ] Um sweep maior do `n5-pt-astrofisica` (mais páginas, incluindo as em branco) para estimar taxa de página em branco do scan — fora do escopo do spike.
- [ ] A E9-T02 decide o contrato exato item→`RawDocument` (a word-level confidence do tjs alimenta a calibração da E7/E9-T03).

## 9. Como reproduzir

```powershell
pnpm tsx packages/extractor/spikes/s7-ocr-probe.ts prep
pnpm tsx packages/extractor/spikes/s7-ocr-probe.ts render n5-pt-astrofisica 50 --scale=2
pnpm tsx packages/extractor/spikes/s7-ocr-probe.ts tjs .pagepace-cache\spikes\S7\n5-pt-astrofisica-p50.png --lang=por --tag=best
pnpm tsx packages/extractor/spikes/s7-ocr-probe.ts native .pagepace-cache\spikes\S7\n5-pt-astrofisica-p50.png --lang=por --tag=best
pnpm tsx packages/extractor/spikes/s7-ocr-probe.ts layer n1-en-lostworld 100
pnpm tsx packages/extractor/spikes/s7-ocr-probe.ts cer <hipotese.txt> <referencia.txt>
```

Saídas em `.pagepace-cache/spikes/S7/` (gitignored). O gold manual (transcrições) foi conferido página a página contra o PNG renderizado; refeitá-lo exige o mesmo cuidado — nenhum texto do corpus entra no git.
