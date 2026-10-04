# S2 · Negrito/itálico a partir do nome da fonte (spike da E0-T03)

**Data:** 2026-10-04 · **Status:** concluído · **Script:** `packages/extractor/spikes/s2-styles.mjs` (descartável, commitado para reprodução) · **Saídas brutas:** `.pagepace-cache/spikes/S2/` (gitignored; contém texto do corpus — nunca commitar).

## 1. Método

- `pdfjs-dist@6.4.299` em Node 24, `fontExtraProperties: true` (sem ela o nome real da fonte não chega ao main thread — ADR-015/S1).
- **15 PDFs do corpus privado** (`CORPUS_PRIVATE_DIR`), todos processados com sucesso (0 falhas): 409 fontes, 391 `sfnt` + 18 `type3`. Não há fonte Type1 (PFA/PFB) no corpus: o ramo Type1 do script **não foi exercitado**.
- Ordem de decisão para cada fonte (a primeira que responder decide):

  1. **convenção** — regra por família histórica (`CONVENTION_RULES`): `CMR/CMTI/CMSL/CMBX/CMTT/CMMI/CMSY/CMEX` (Computer Modern), `SFRM/SFBX/SFTI/SFTT/SFCC/SFSX/SFMI` (SUfonts), `t1x|rtx|tx` + sufixo (`r`, `b`, `i`, `bi`, `tt`, `btt`, `mi`, `bmi`, `sy`).
  2. **token** — palavras no nome genérico: negrito (`bold`, `bd`, `black`, `heavy`, `demi`, `semibold`, `extrabold`…), itálico (`italic`, `oblique`, `slant`, `cursive`, `it`), regular (`roman`, `regular`, `regu`, `book`, `std`…), além de `light/thin/cond` e `medium`.
  3. **default** — nome sem marcador de estilo mas com família plausível (ex.: `TimesNewRomanPSMT`, `Avenir-Roman`) ⇒ regular.
  4. **desconhecido** — nenhum dos casos (resultado: **0 no corpus**).

- Cada decisão grava `basis` (`convention` | `token` | `default` | `unknown`), além de `bold`, `italic`, `kind` (`text` | `math` | `symbol`), `role` e `family`.
- **Definições:** *fonte de texto* = renderiza letras (`\p{L}`) e não é símbolo/matematical; *decidida* = `bold` e `italic` não nulos; *naive* = mesma leitura **sem** a tabela de convenções (só token + default); *conflito* = nome ≠ bytes (OS/2 `fsSelection`, `head.macStyle`, peso ≥ 700 ou regex no nome interno do arquivo); *faux* = estilo simulado na desenho (contorno `Tr` 2/5/6 ou corte/shear visível).
- Determinístico: mesma entrada, mesma saída (sem `Date.now()` na lógica).
- Comandos: `node packages/extractor/spikes/s2-styles.mjs` e, para conferir no visual, `node .pagepace-cache/spikes/S2/render-crop.mjs <id> <pág> <x> <y> <largura> <altura> <nome> [escala]`.

## 2. Resultado: o nome basta?

**Sim, para as fontes de texto do corpus: 257/257 decididas (100%), 0 desconhecidas.**

Sem a tabela de convenções (só tokens + default), caem para **186/257 (72%)** — e o que não é decidido vira "regular" por silêncio, que é uma **resposta errada**, não um "não sei".

| PDF | fontes | fontes de texto | decididas | naive (sem convenções) | erros do naive |
|---|---:|---:|---:|---:|---|
| n1-pt-sofia | 5 | 5 | 5 | 5 | — |
| n1-en-sofia | 5 | 3 | 3 | 3 | — |
| n1-pt-curinga | 3 | 3 | 3 | 3 | — |
| n1-en-curinga | 8 | 8 | 8 | 8 | — |
| n1-en-lostworld | 1 | 1 | 1 | 1 | — |
| n2-en-astrofisica | 86 | 60 | 60 | 49 | 24 letras negrito, 1.042 de papel (`t1xbtt`) |
| n2-pt-placasdevideo | 7 | 4 | 4 | 4 | — |
| n3-pt-filosofia | 17 | 13 | 13 | 13 | — |
| n3-pt-filosofia2 | 23 | 12 | 12 | 12 | — |
| n3-en-filosofia | 112 | 60 | 60 | 60 | — |
| n4-en-astrofisica | 48 | 36 | 36 | 19 | 422 negrito (`SFBX`), 1.568 itálico (`SFTI`), 145 papel |
| n4-en-fisica | 6 | 6 | 6 | 6 | — |
| n4-pt-astrofisica | 88 | 46 | 46 | **3** | 3.571 negrito (`CMBX`), 3.514 itálico (`CMTI`/`CMSL`) |
| n5-en-newton | 0 | 0 | 0 | 0 | — |
| n5-pt-astrofisica | 0 | 0 | 0 | 0 | — |
| **total** | **409** | **257** | **257 (100%)** | **186 (72%)** | **10.286 letras (0,28%)** |

Contagem por base de decisão (fontes de texto): `token` 147 · `default` 39 · `convention` 71 · `unknown` 0.

Erros do naive em letras (sobre 3.610.644 letras de texto): **negrito 4.017 (0,11%) em 8 fontes**, **itálico 5.082 (0,14%) em 12 fontes**, **papel errado** (typewriter/sans/small-caps virando "texto comum") **1.187 (0,03%) em 6 fontes**. Todos concentrados nos três PDFs LaTeX/TeX do corpus.

Composição real do corpus: negrito 10.254 letras (0,28%) em 49 fontes; itálico 88.380 letras (2,45%) em 88 fontes.

Exemplos (nome real → decisão):

| Nome (prefixo de subset já cortado) | Decisão | `basis` |
|---|---|---|
| `Arial-BoldMT`, `TimesNewRomanPS-BoldMT` | negrito | token |
| `Times-Italic`, `DejaVuSans-Oblique` | itálico | token |
| `TimesNewRomanPSMT`, `Avenir-Roman` | regular | default |
| `CMBX10`, `SFBX1095`, `t1xbtt` | negrito | convention |
| `CMTI10`, `CMSL10`, `SFTI1000`, `rtxbmi` | itálico (o `rtxbmi` é negrito+itálico) | convention |
| `CMMI10`, `rtxmi` | matemática itálica (`kind: "math"`) | convention |
| `CMTT9`, `SFTT0900`, `SFSX1440`, `SFCC1000` | typewriter / sans / small-caps | convention |

## 3. O que os bytes do arquivo dizem (e por que não bastam)

- **Flags do pdf.js:** `font.bold`/`font.italic` continuam `undefined` em **409/409** fontes (o achado do S1 vale para o corpus inteiro). Não servem.
- **Bytes do arquivo (391 `sfnt`):** `fsSelection ≠ 0` em 148 fontes, `macStyle ≠ 0` em 89, peso ≥ 700 em 21. Onde os campos estão preenchidos, eles **concordam** com o nome (nenhum conflito no sentido inverso).
- **37 conflitos nome × bytes** (18 deles em fontes de texto = **7% das 257**), todos no mesmo padrão: nome diz estilo, bytes dizem regular — `fsSelection: 0`, `macStyle: 0`, `weightClass: 500`, `subfamily: "Unknown"`. São exatamente os subsets TeX/Type1: `CMBX10`, `CMTI10`, `CMSL10`, `SFBX1095`, `SFBX1200`, `t1xbtt` (+ `CMMI*`/`CMSY*` no papel de matemática/símbolo).
- **Conclusão:** os bytes **não geram falso positivo**, mas **perdem recall** (7% das fontes de texto virariam "regular" por silêncio). E as 18 fontes `type3` (n4-en) não têm bytes nenhum: só o nome resolve.
- O que carrega o estilo nessas fontes é o **nome PostScript** (`font.name`), que a própria tabela `name` do arquivo copia sem os sufixos legíveis: `subfamily` vem "Unknown" e `family`/`full` vêm o nome cru (`CMTI10`), que a regex interna do script não decodifica — por isso a tabela de convenções.

## 4. Estilo falso (sinais no desenho, não no nome)

| Sinal | Medição no corpus | Leitura |
|---|---|---|
| Contorno (`Tr` 2/5/6) | 0 ocorrências em texto visível | Nenhum negrito simulado por traçado |
| `Tr` 3 (texto invisível) | 1.166.930 caracteres em 2 PDFs (n1-en-lostworld 426.329; n3-en-filosofia 740.601) | **Não é estilo**: são scans com camada OCR invisível (ver §7) |
| Corte/shear do texto | 10 itens / **107 letras** em n3-pt-filosofia | **Itálico simulado** — único caso real do corpus (ver abaixo) |
| Rotação | 718 itens rotacionados (n1-en-lostworld 161, n2-en 231, n4-en 326) | Não é estilo. Rotação de 90° mantém os eixos ortogonais; **shear não** — o teste precisa da ortogonalidade (`a*c + b*d ≈ 0`), senão conta rotação como itálico |

O caso de shear: fonte `Avenir-Heavy` (n3 p101, "a ontologia") e `Avenir-Roman` (p181) desenhadas com matriz de corte de ~8° — render confirma **negrito itálico simulado**. O nome dá o negrito (`Heavy`), **não dá o itálico**. É a única brecha do nome no corpus: 107 letras em 3,6 milhões (0,003%).

## 5. Largura dos glifos: confirmação fraca, nunca classificadora

Média da razão de largura por letra (pares da mesma família, ≥8 letras em comum):

| Relação | Pares | Razão média | Faixa |
|---|---:|---:|---|
| negrito ÷ regular (Times, Avenir, Minion, Helvetica Neue) | 80 | 1,05–1,08 | 1,032–1,090 |
| negrito ÷ regular (Arial) | 1 | 1,148 | — |
| negrito ÷ regular (Gill Sans Bold ÷ Light) | 1 | 1,254 | — |
| negrito ÷ regular (SF, contaminada por small-caps) | 16 | 1,066 | 0,928–1,152 |
| regular ÷ regular (controle) | 266 | ≈1,00 | 0,631–1,603 |
| negrito itálico ÷ itálico | 2 | 1,013 | — |

- Negrito é **5–15% mais largo** na mesma família — serve como confirmação.
- O controle mostra o limite: o mesmo rótulo de família esconde cortes/corpos diferentes (`CMR12` × `CMTI/CMSL` vai de 0,631 a 1,603; `SFCC` × `SFSX` de 0,84 a 1,185) → **largura sozinha classifica mal**.
- Itálico não muda a largura (1,013) → **não separa itálico**.

## 6. Validação visual (PNGs em `.pagepace-cache/spikes/S2/render/`)

- `n4en-p2-contents.png` — `SFBX` renderiza **negrito**.
- `n4en-p3-italic.png` — `SFTI` renderiza **itálico**.
- `n4pt-p11-cmbx.png` — "1." em `CMBX` **negrito** e "constante solar" em `CMTI` **itálico**.
- `n3pt-p101-shear-6x.png` — `Avenir-Heavy` cortado = **negrito itálico simulado**.
- `n3-en-filosofia-p1.png` — página é **imagem de scan** (o texto extraído está invisível).

## 7. Achados laterais (fora do escopo da E0-T03)

1. **Camada OCR invisível:** 2 dos 15 PDFs são scans **com** camada de texto, mas com todo o texto em `Tr 3` (invisível). A regra de escaneado da ADR-018 ("0 itens de texto") **não pega** esses casos. Item novo no `BACKLOG.md`.
2. **`n5-en-newton` / `n5-pt-astrofisica`:** 0 itens de texto, 0 fontes (pergunta de produto já registrada em `OPEN-QUESTIONS.md`).

## 8. Recomendação para a E4 (títulos e estilos)

1. **Fonte primária = nome PostScript** (`font.name`, com `fontExtraProperties: true`), prefixo de subset cortado, na ordem: **convenção → token → default regular**. Guardar `basis` por fonte para o overlay de confiança (E7).
2. **Bytes (OS/2/head) só como corroborador:** se os dois disserem estilo, confirma; se bytes disserem regular e o nome estilo, o nome vence (37 casos aqui). Não parsear fonte para descobrir estilo.
3. **Flags do pdf.js não servem** (`undefined` em 409/409).
4. **Sinais de estilo falso:** shear no `transform` do item (com teste de ortogonalidade) e `Tr` 2/3/5/6 ⇒ marcar como estilo simulado/invisível; texto com `Tr 3` não entra na extração.
5. **Largura dos glifos:** opcional, só como confirmação de negrito na mesma família+corpo.
6. **Tabela de convenções** fica versionada no extrator (CM/SF/TeX são estáveis) e vira teste golden com os PDFs do corpus.
7. **ADR a registrar na E4** ao adotar esta estratégia (não registrada aqui: spike informa, a decisão se registra quando a E4 a adotar).

## 9. Reprodução

```powershell
node packages/extractor/spikes/s2-styles.mjs
node .pagepace-cache/spikes/S2/render-crop.mjs n4-pt-astrofisica 11 80 605 400 22 n4pt-p11-cmbx
```

Saídas: `.pagepace-cache/spikes/S2/summary.json` (taxas, histogramas, conflitos, pares de largura), `<id>.json` (fonte a fonte) e `render/*.png`.
