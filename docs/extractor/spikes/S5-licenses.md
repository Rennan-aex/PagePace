# S5 · Auditoria de licenças e alternativas (spike da E0-T06)

**Data:** 2026-10-04 · **Status:** concluído · **Scripts:** `packages/extractor/spikes/s5-licenses.mjs` e `s5-fontprobe.mjs` (descartáveis, commitados para reprodução) · **Saídas brutas:** `.pagepace-cache/spikes/S5/` (gitignored: `summary.json`, `npm-registry.json`, PNGs de comparação).

## 1. Método

- **Parte 1 — o que já está instalado.** Varredura de `node_modules/.pnpm` (50 pacotes únicos): leitura do `package.json` de cada um (licença SPDX), tamanho em disco, presença de binário nativo (`.node`), `bin` e arquivo de licença. Classificação contra a política da **ADR-006**: permitidas `MIT`, `Apache-2.0`, `BSD-2/3-Clause`, `ISC`, `0BSD`, `Unlicense`, `CC0-1.0`, `BlueOak-1.0.0`; bloqueadas as que começam com `AGPL`, `GPL`, `LGPL`, `SSPL`, `MPL`, `EPL`, `CDDL`, `CECILL`.
- **Parte 2 — candidatos.** Consulta ao registro npm (`https://registry.npmjs.org/<pkg>/latest`) para licença, tamanho descompactado, número de dependências, `bin`, campo `browser`/`exports`/`unpkg` (indicação de build de navegador) e `optionalDependencies` (binários por plataforma). Resultado em cache → `--offline` reproduz sem rede.
- **Parte 3 — alternativa sem dependência.** `Intl.Segmenter` (nativo do runtime) medido numa amostra fixa em português.
- **Sonda de dependência de fonte (`s5-fontprobe.mjs`).** Para cada candidato a **asset copiado para o app**, compara extração e render **com** as fontes padrão do PDF.js e com `standardFontDataUrl` apontando para uma pasta vazia: contagem de itens/caracteres, warnings e **diferença de pixels** página a página (PDF do corpus + PDF sintético gerado na hora).
- **Não feito aqui** (fica para E1-T00/E1-T07): teste de empacotamento real no navegador (bundle), leitura do código-fonte dos candidatos, revisão do texto integral das licenças e instalação dos candidatos. Nenhum candidato foi instalado — nada mudou nas `package.json`.

## 2. O que está instalado hoje: 50 pacotes, 119,4 MB, **50/50 conformes**

Hoje **nenhum pacote `packages/*` tem dependência** (schema, extractor, segmenter, cli e eval estão vazios); tudo que existe é `devDependencies` da raiz, usado por spikes/testes/build.

| pacote (declarado) | versão | licença | MB em disco | nativo | veredito |
|---|---|---|---:|---|---|
| `@napi-rs/canvas` | 1.0.10 | MIT | 0,1 | não | OK |
| `@types/node` | 22.20.5 | MIT | 2,3 | não | OK |
| `pdfjs-dist` | 6.4.299 | Apache-2.0 | 33,3 | não | OK |
| `typescript` | 5.9.3 | Apache-2.0 | 22,5 | não | OK |
| `vitest` | 2.1.9 | MIT | 1,6 | não | OK |

- **Total:** 50 pacotes (5 declarados + 45 transitivos) · **119,4 MB**.
- **Licenças:** MIT 44 · Apache-2.0 3 · ISC 2 · BSD-3-Clause 1. **Copyleft: 0.** Veredito: **50 OK, 0 bloqueadas, 0 sem licença**.
- **Binário nativo (`.node`):** `@napi-rs/canvas-win32-x64-msvc` (36,6 MB), `@rollup/rollup-win32-x64-gnu` (2,0 MB), `@rollup/rollup-win32-x64-msvc` (2,6 MB) — **os três são exclusivamente de build/teste** e não entram no bundle do app (regra da ADR-015: `@napi-rs/canvas` nunca vai ao app). O pacote `@napi-rs/canvas` em si é puro (0,1 MB); o `.node` vem do pacote de plataforma da mesma licença MIT.
- **Arquivo de licença no diretório:** 45/50. Os 5 sem arquivo são os pacotes de binário de plataforma (`@esbuild/win32-x64`, `@napi-rs/canvas-win32-x64-msvc`, `@rollup/rollup-win32-x64-gnu`, `@rollup/rollup-win32-x64-msvc`) e `stackback` — todos com a licença declarada em SPDX no `package.json`. **Não é falta de licença; é pacote que só empacota um binário.**
- **Conclusão:** a ADR-006 está sendo cumprida na prática. A auditoria aqui é de **devDependencies**; a primeira leva de dependências de **runtime** nasce na E1-T02 e terá que passar por esta mesma tabela.

## 3. Achado: o `pdfjs-dist` **não é só Apache-2.0**

O código do PDF.js é Apache-2.0 (arquivo `LICENSE` na raiz). Mas o pacote distribui quatro pastas de **ativos** com licenças próprias, cada uma com o seu arquivo de licença:

| pasta | MB | licença do conteúdo | arquivo |
|---|---:|---|---|
| `cmaps/` (169 arquivos) | 1,1 | BSD (Adobe, 1990–2009) | `cmaps/LICENSE` |
| `iccs/` | 0,0 | CC0-1.0 | `iccs/LICENSE` |
| `standard_fonts/` — 10 `.pfb` Foxit | 0,3 | BSD (PDFium Authors) | `standard_fonts/LICENSE_FOXIT` |
| `standard_fonts/` — **4 `.ttf` LiberationSans** | **0,5** | **GPLv2 + exceção de fonte** | `standard_fonts/LICENSE_LIBERATION` |
| `wasm/` (JBIG2, OpenJPEG, qcms) | 1,5 | BSD-2 / MIT / Apache-2.0 | 6 arquivos `wasm/LICENSE_*` |

Os 4 arquivos GPL são `LiberationSans-{Regular,Bold,Italic,BoldItalic}.ttf` (560,2 KB no total). O mapa do worker (`build/pdf.worker.mjs`) associa **Helvetica, Helvetica-Bold, Helvetica-Oblique e Helvetica-BoldOblique → `LiberationSans-*.ttf`**, e Times/Courier/Symbol/ZapfDingbats → arquivos Foxit. Ou seja: **todo PDF que usa Helvetica sem fonte embutida dispara o download desses TTFs** de `standardFontDataUrl`.

No corpus privado, **4 de 15 PDFs** citam `/Helvetica`: `n1-pt-curinga` (1 ocorrência), `n2-en-astrofisica` (8), `n3-pt-filosofia2` (1), `n4-en-astrofisica` (8).

### 3.1 O que muda sem essas fontes (medido)

| caso | texto extraído | render (páginas) | avisos |
|---|---|---|---|
| `n2-en-astrofisica`, 14 páginas | **idêntico** (5.390 itens / 73.715 caracteres) | **idêntico pixel a pixel (14/14)** | 0 |
| `n3-pt-filosofia2`, 10 páginas | **idêntico** (183 itens / 5.105 caracteres) | **idêntico pixel a pixel (10/10)** | 0 |
| PDF sintético `Helvetica` **não embutido** (gerado pelo script) | **idêntico** (1 item / 15 caracteres) | **1,8% dos pixels diferentes** | 0 |

Leitura: nos PDFs do corpus as fontes de referência estão embutidas, então nada muda. No caso controlado (Helvetica declarada sem `FontFile`) o render **sem** as fontes continua saindo, mas com uma fonte de fallback estreita no lugar do Liberation Sans — veja `.pagepace-cache/spikes/S5/p1-com-fontes.png` × `p1-sem-fontes.png`.

**Consequências:**
- **Extração (o produto): não precisa das fontes Liberation.** Texto, geometria e estilos saem iguais — este é o caminho das E1–E7.
- **Render (recorte de figuras da ADR-016 e botão "ver original" da ADR-003): precisa**, sob pena de texto com fonte errada em PDFs Helvetica não embutidos.
- **Decisão adiada para a E1-T02**, quando os assets do app forem copiados: (a) copiar só os `.pfb` Foxit e abrir mão da fidelidade do render em Helvetica, (b) copiar os 4 `.ttf` GPL e assumir as obrigações deles (entregar licença + fonte; os arquivos são separáveis do código Apache-2.0), ou (c) substituir por Liberation 2.x (relicenciada como OFL, mas divergiria do upstream). **Nada é distribuído hoje**, então isto não trava a E0; fica registrado na ADR-005 e no BACKLOG. **Decidido pelo PO em 2026-10-04: opção (a) → ADR-020** (só `.pfb` Foxit; os `.ttf` não entram no app).

## 4. Candidatos: licença × tamanho × navegador

Metadados do registro npm em 2026-10-04 (versão mais recente de cada um). "Campo browser/exports" = o pacote declara entrada própria para navegador; ausência do campo **não** quer dizer que não funcione (é só JS puro), quer dizer que **não há build de navegador declarado** e o teste real fica para a tarefa que adotar.

| grupo | pacote | versão | licença | MB (descompactado) | deps | entrada de navegador | veredito |
|---|---|---|---|---:|---:|---|---|
| leitura de PDF | `pdfjs-dist` | 6.4.299 | Apache-2.0 | 33,3 | 0 | `browser={"fs":false,…}` + `main=build/pdf.mjs` | **OK — usar (ADR-005)** |
| leitura de PDF | `mupdf` | 1.28.1 | **AGPL-3.0-or-later** | 13,7 | 0 | não | **BLOQUEADA (ADR-006)** |
| leitura de PDF | `pdf-parse` | 2.4.5 | Apache-2.0 | 20,3 | 2 | não (tem `bin`) | **OK de licença, não serve**: só Node, viola REQ-EXT-17 |
| geração de PDF (ADR-013) | `pdf-lib` | 1.17.1 | MIT | 18,6 | 4 | `unpkg=dist/pdf-lib.min.js` | **OK — candidato principal** |
| geração de PDF (ADR-013) | `pdfkit` | 0.20.2 | MIT | 10,0 | 6 | `exports: {node, default}` | **OK — candidato** |
| geração de PDF (ADR-013) | `jspdf` | 4.2.1 | MIT | 28,8 | 3 | `browser=dist/jspdf.es.min.js` | **OK — candidato** |
| validação de esquema | `zod` | 4.6.5 | MIT | 5,9 | 0 | ESM+CJS puro | **OK** |
| validação de esquema | `ajv` | 8.20.0 | MIT | 1,0 | 4 | sem campo | **OK** |
| validação de esquema | `valibot` | 1.5.0 | MIT | 1,8 | 0 | ESM+CJS puro | **OK** |
| segmentação | `compromise` | 14.17.0 | MIT | 2,6 | 3 | `unpkg=builds/compromise.js` | **OK** |
| segmentação | `sentence-splitter` | 5.0.1 | MIT | 0,2 | 2 | puro | **OK — o menor** |
| segmentação | `natural` | 8.1.1 | MIT | 13,2 | **14** | não | **descartado por peso**, não por licença (traz `mongoose`, `pg`, `redis`, `dotenv`) |
| lint/format (ADR-017) | `@biomejs/biome` | 2.5.15 | `MIT OR Apache-2.0` | 0,7 | 0 | não (binário em `optionalDependencies`) | **OK — confirma a ADR-017** |
| segmentação | `Intl.Segmenter` (nativo) | — | sem licença (faz parte do runtime) | 0 | 0 | sim (navegador + Node) | **OK — começar por aqui** |

Notas por grupo:

- **Leitura de PDF.** `pdfjs-dist` é o único que roda em navegador **e** Node sem binário nativo (REQ-EXT-17). `mupdf` confirma que a regra detecta o caso real: **AGPL = proibida**, mesmo sendo rápida. `pdf-parse` é Apache-2.0 mas é CLI/Node (`bin`), então não entra no núcleo portável.
- **Geração de PDF (ADR-013).** Os três são MIT. A escolha entre eles é de **capacidade**, não de licença, e continua sendo da **E1-T07**: negrito/itálico, quebra de linha, colunas e notas. `pdf-lib` tem build minificado publicado para navegador; `pdfkit` é o mais leve mas puxa 6 dependências (`fontkit`, `fflate`, `linebreak`…) e só declara `exports` de Node; `jspdf` é o maior (28,8 MB) mas tem `browser` declarado. Gerador só é usado em teste/CLI, então tamanho não pesa no app.
- **Validação de esquema.** Hoje `@pagepace/schema` é só tipo TypeScript, **sem validação em runtime**. `zod` e `valibot` são zero-dependência e trazem inferência de tipos; `ajv` é o menor (1,0 MB) e segue JSON Schema, mas tem 4 dependências e não declara entrada de navegador. Todos compatíveis com a ADR-006 — **a escolha é de produto e fica para a E1** (quem for adotar registra a ADR).
- **Segmentação.** Medido em Node v24.18.0: `Intl.Segmenter({granularity:"sentence"})` em português cortou a amostra fixa em **7 frases onde há 4** — partiu as abreviaturas `O Sr.` e `Dra.`. Não é problema de licença (é de comportamento): **plano sugerido = começar sem dependência** e corrigir abreviaturas na própria regra; se não bastar, `sentence-splitter` (MIT, 0,2 MB, 2 deps) é o menor candidato; `natural` fica de fora pelo peso das dependências.
- **Lint/format (ADR-017).** Licença `MIT OR Apache-2.0` confirmada — inclusive no pacote de binário da plataforma (`@biomejs/cli-win32-x64`, mesma licença). O binário roda só na máquina de build, nunca vai ao app.

## 5. Veredito por item × ADR

| item | veredito | ADR afetada |
|---|---|---|
| PDF.js (`pdfjs-dist`) | **Confirmado**: código Apache-2.0, 0 dependências, sem binário nativo, roda em navegador e Node; único candidato viável (alternativas AGPL/GPL proibidas ou só-Node). **Ressalva:** os 4 TTF Liberation de `standard_fonts/` são GPLv2 (§3), decidir na E1-T02 ao copiar assets | **ADR-005** → `accepted` |
| Ferramental (pnpm, Vitest, TypeScript) | **Conforme**: pnpm MIT · Vitest MIT · TypeScript Apache-2.0 · `tsc` da mesma base. Continua `provisional` só pelo lint/formato em aberto | **ADR-009** → mantida `provisional` |
| Gerador de PDF sintético | **Licença fechada**: `pdf-lib`, `pdfkit` e `jspdf` são todos MIT; nenhum tem binário nativo. Capacidade (negrito/itálico, colunas, notas) ainda não medida | **ADR-013** → mantida `provisional` (E1-T07) |
| Lint/formato Biome | **Licença compatível** (`MIT OR Apache-2.0`), confirmada também no binário de plataforma | **ADR-017** → evidência registrada, mantida `provisional` até instalar |
| Política de licenças | **Validada na prática**: 50/50 pacotes instalados conformes; `mupdf` classificado `BLOQUEADA` pelo mesmo critério | ADR-006 (sem mudança) |

## 6. Obrigações de atribuição (nada a fazer ainda)

`Apache-2.0` exige incluir cópia da licença e de eventuais `NOTICE` na distribuição; `MIT` exige manter o aviso de copyright; os ativos do `pdfjs-dist` trazem 10 arquivos de licença próprios (§3). **Hoje o projeto não distribui nada** (repo privado, app ainda não existe), então não há obrigação a cumprir agora. Quando o app for empacotado, é preciso gerar um artefato de terceiros (ex.: `THIRD-PARTY-NOTICES`) a partir do lockfile — item novo no BACKLOG, P2.

## 7. Limitações do que foi verificado

- Metadados dos candidatos vêm do registro npm (declarados pelo autor), não da leitura do código-fonte; a confirmação de que não há `require("fs")`/binário escondido só vem do teste de empacotamento (E1-T00/E1-T07).
- "Suporte a navegador" é **declarado** (campo `browser`/`exports`/`unpkg`). Nenhum candidato foi bundlado.
- A sonda de fontes (§3.1) cobre 2 PDFs do corpus + 1 sintético, não os 15.
- Nenhum candidato foi instalado; nenhum número de `package.json` mudou.

## 8. Reprodução

```powershell
# 1) auditoria da árvore instalada + candidatos (usa a rede; --offline repete pelo cache)
node packages\extractor\spikes\s5-licenses.mjs

# 2) sonda: extração/render com e sem as fontes padrão do PDF.js
node packages\extractor\spikes\s5-fontprobe.mjs                  # PDF do corpus (14 páginas)
node packages\extractor\spikes\s5-fontprobe.mjs --sintetico       # caso controlado (Helvetica sem fonte)

# 3) saídas (gitignored)
#    .pagepace-cache\spikes\S5\summary.json       -> pacotes, licenças, tamanhos, candidatos
#    .pagepace-cache\spikes\S5\npm-registry.json  -> cache do registro npm
#    .pagepace-cache\spikes\S5\p1-*.png           -> comparação de render (com × sem fontes)
```
