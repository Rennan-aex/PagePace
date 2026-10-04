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
- **Falta para o N3:** um PDF **digital** de filosofia em inglês (não escaneado, sem OCR embutido) — hoje o único N3-en é `n3-en-filosofia`, que é scan. Enquanto não houver esse PDF, o N3-en não tem exemplar digital nativo.

## Onde ficam os PDFs
| Tipo | Local | No git? |
|---|---|---|
| Públicos (domínio público / acesso aberto) | `corpus/public/` | Não (ignorado), baixados por `pnpm corpus:fetch` a partir do manifest |
| Pessoais (com copyright) | pasta **fora** do repo, `CORPUS_PRIVATE_DIR` | Nunca |
| Gabaritos de públicos | `corpus/golden/` | Sim |
| Gabaritos de pessoais | `$CORPUS_PRIVATE_DIR/golden/` | Nunca |

Fontes sugeridas para públicos: arXiv e outros de acesso aberto (nível 2 e 4), Wikisource/Domínio Público/Project Gutenberg/Standard Ebooks (níveis 1 e 3, quando houver PDF), Internet Archive (nível 5). Verificar a **licença de cada item antes** de entrar no manifest.

## Manifest (`corpus/manifest.yaml`)
Cada entrada: `id`, `level`, `lang`, `title`, `source_url`, `license`, `sha256`, `features` (lista: `footnotes`, `two-column`, `hyphenation`, `equations`, `tagged`, `scanned`, `scanned-ocr-layer`...), `golden` (caminho ou `none`), `visibility` (`public`).
O script `corpus:fetch` baixa, **valida o SHA-256** e falha se divergir.

## Gabaritos (golden)
Quatro origens, em ordem de confiabilidade:
1. **Sintéticos programáticos** (a especificação é a verdade).
2. **PDFs tagged** (estrutura explícita; revisar, pois nem toda tag é boa).
3. **Par PDF + EPUB** do mesmo livro (EPUB dá a estrutura).
4. **Anotados à mão** (poucas páginas por livro, mas as mais difíceis).
Gabaritos podem ser **parciais** (`coverage.pages`), e as métricas só consideram as páginas cobertas.

## Corpus privado
Mesmo manifest em `$CORPUS_PRIVATE_DIR/manifest.yaml`; o runner mescla os dois. Resultados privados são impressos localmente e **nunca** commitados nem colados em PRs com texto do livro.

## Como adicionar um PDF
Skill `add-corpus-pdf`.
