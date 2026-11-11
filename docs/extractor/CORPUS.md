# Corpus de teste

Princípio: **refletir o uso real** (filosofia, artigos, técnicos; pt e en) e ser **reproduzível por qualquer máquina**.

## Níveis
| Nível | Conteúdo | Dificuldade principal |
|---|---|---|
| **N1** | Livro digital simples (coluna única, poucas notas) | Parágrafos, hifenização, cabeçalhos |
| **N2** | Artigo acadêmico em duas colunas | Ordem de leitura, referências, título/resumo |
| **N3** | Filosofia com notas de rodapé, citações, epígrafes | Notas, citações em bloco, numeração marginal, grego/latim |
| **N4** | Técnico com equações, tabelas, código | Blocos não textuais, listas |
| **N5** | Escaneado (Internet Archive etc.) | OCR (E9) |

Cada nível deve ter **pt e en** sempre que possível. Distribuição mínima desejada para começar: N1 (2 pt, 2 en), N2 (2 en, 1 pt), N3 (3 pt, 3 en), N4 (1 pt, 2 en), N5 (2 mistos, só testam "detecta escaneado" até o E9).

### PDFs com camada de OCR embutido (feature `scanned-ocr-layer`)
- `n1-en-lostworld` e `n3-en-filosofia` são **escaneados com texto de OCR já embutido** (todo o texto em `Tr 3`, invisível — achado do spike S2, ADR-019). Feature `scanned-ocr-layer` marcada no manifest privado.
- **Eles não contam nas metas de N1 e N3:** a distribuição acima é contada sem eles, e as métricas deles entram em **baseline separada** (grupo "texto de OCR embutido: leitura com aviso", com confiança reduzida e sem estilo — nunca misturado com os PDFs digitais nativos).
- **N3 em inglês digital (resolvido pela E0-T01b, 2026-10-04):** o corpus **público** agora tem `n3-en-scielo-climatejustice` (artigo digital nativo, Filosofia Unisinos, CC BY 4.0) — o N3-en privado `n3-en-filosofia` continua sendo escaneado com OCR embutido e não conta nas metas.

## Onde ficam os PDFs
| Tipo | Local | No git? |
|---|---|---|
| Públicos (domínio público / acesso aberto) | `corpus/public/` | Não (ignorado), baixados por `pnpm corpus:fetch` a partir do manifest |
| SciELO (bloqueia o CI com 403, ADR-034) | `corpus/vendored/` | **Sim, único caso** — 2 PDFs byte a byte (1,3 MB); `pnpm check:no-pdf` só aceita esses caminhos com o SHA-256 do manifest e reprova qualquer outro `.pdf` (ADR-103) |
| Sintéticos (gerados das especificações) | `corpus/public/synthetic/` | Não (ignorado), gerados por `pnpm corpus:synthetic` / `corpus:fetch` |
| Pessoais (com copyright) | pasta **fora** do repo, `CORPUS_PRIVATE_DIR` | Nunca |
| Gabaritos de públicos | `corpus/golden/` | Sim |
| Gabaritos de pessoais | `$CORPUS_PRIVATE_DIR/golden/` | Nunca |

Fontes sugeridas para públicos: arXiv e outros de acesso aberto (nível 2 e 4), Wikisource/Domínio Público/Project Gutenberg/Standard Ebooks (níveis 1 e 3, quando houver PDF), Internet Archive (nível 5). Verificar a **licença de cada item antes** de entrar no manifest.

## Regras de licença (públicos) — decisão do PO, 2026-10-04
| Situação | Veredito |
|---|---|
| CC BY · CC BY-SA · domínio público verificado | **Aceito** |
| CC BY-NC-SA | **Aceito só enquanto o repositório for privado** — reavaliar antes de qualquer distribuição pública (viola a non-commercial se o app for pago/distribuído) |
| CC BY-ND | **Não aceito** (sem obras derivadas) |
| Exija login/cadastro para baixar | **Não aceito** |
| Licença que eu não consegui confirmar abrindo a página oficial | **Não entra** — registrar a dúvida em `OPEN-QUESTIONS.md` |

- **Nunca afirmar licença de memória.** Para cada entrada: URL da página oficial, **linha exata da licença** (curta) e **data da verificação** ficam registradas no manifest (campo `license` + `license_url` + `verified_on`).
- Toda entrada passa também por: `source_url` direta e estável **ou** `vendored` (caminho de um PDF versionado no repo, para fonte que bloqueia o CI), SHA-256 calculado do arquivo, número de páginas, nível confirmado abrindo o arquivo, idioma e features.

## Manifest (`corpus/manifest.yaml`)
Cada entrada: `id`, `level`, `lang`, `title`, `source_url` (URL direta e estável do PDF) **ou** `vendored` (`corpus/vendored/<arquivo>.pdf`, cópia versionada — os 2 do SciELO, ADR-103), `page_url` (página oficial onde a licença foi conferida), `license` (linha exata da licença), `verified_on` (data da verificação), `pages` (número de páginas), `sha256`, `features` (lista: `footnotes`, `two-column`, `hyphenation`, `equations`, `tagged`, `scanned`, `scanned-ocr-layer`...), `golden` (caminho ou `none`), `visibility` (`public`). **Sintéticos (E1-T07, ADR-037):** `generated: true` no lugar de `source_url` — o PDF é construído das especificações (`packages/eval/src/specs.ts`) para `corpus/public/synthetic/<id>.pdf` e o `sha256` do manifest confere o que o gerador produz.
O script `pnpm corpus:fetch` (E1-T05, implementado em 2026-10-05) baixa as entradas públicas para `corpus/public/`, **valida o SHA-256** de cada uma e falha (`exit 1`) se divergir. Ele **não rebaixa** o que já está no disco com o hash certo, **não baixa nada** quando o cache do CI está quente, tenta a rede **3 vezes** (espera de 1 s e 2 s) só em erro de rede/`5xx`/`429`, e avisa — sem falhar — sobre PDFs presentes no disco sem entrada no manifest (é assim que a **E1-T05b** aparece: `n4-pt-astrofisica` e `n5-pt-astrofisica`). Ele também mescla o manifest privado quando existe `CORPUS_PRIVATE_DIR` (variável de ambiente, depois `.env` da raiz) e, na falta das duas fontes, avisa **uma vez** e segue só com o público. Os avisos de "PDF no disco sem entrada no manifest" mostravam `n4-pt-astrofisica` e `n5-pt-astrofisica` até a **E1-T05b** (2026-10-06), que gravou as 2 entradas que faltavam: o manifest privado está com **15 de 15 PDFs** e o `pnpm corpus:fetch` roda sem nenhum aviso. Ver `corpus/README.md` e as ADR-031/032.

## Gabaritos (golden)
Quatro origens, em ordem de confiabilidade:
1. **Sintéticos programáticos** (a especificação é a verdade).
2. **PDFs tagged** (estrutura explícita; revisar, pois nem toda tag é boa).
3. **Par PDF + EPUB** do mesmo livro (EPUB dá a estrutura).
4. **Anotados à mão** (poucas páginas por livro, mas as mais difíceis).
Gabaritos podem ser **parciais** (`coverage.pages`), e as métricas só consideram as páginas cobertas.
**Sintéticos (E1-T07, 2026-10-06):** os 5 primeiros gabaritos são os `syn-*` (origem 1), versionados em `corpus/golden/` no formato `1.0.0` (ADR-036). Eles são **casos controlados** (toda heurística nova deve manter `text_cer = 0` neles), **não contam na distribuição por nível/idioma** desta página (a cobertura mínima é contada só nos PDFs reais) e têm baseline própria na E1-T08.

## Corpus privado
Mesmo manifest em `$CORPUS_PRIVATE_DIR/manifest.yaml`; o runner mescla os dois. Resultados privados são impressos localmente e **nunca** commitados nem colados em PRs com texto do livro.

## Como adicionar um PDF
Skill `add-corpus-pdf`.
